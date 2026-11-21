"""Replay the reviewed Debian metadata projection without a network or package manager."""

from collections import Counter
from datetime import datetime
from email.utils import parsedate_to_datetime
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]
PROPOSALS = ROOT / 'docs/proposals'
CANDIDATE = (PROPOSALS / 'm4-linux-arm64-holder-toolchain-candidate-v1.json').read_bytes()
TRUST = (ROOT / 'docs/architecture/p3-debian-archive-trust-root-source-recommendation-v2.json').read_bytes()
RECEIPT = (PROPOSALS / 'm4-linux-arm64-holder-debian-dependency-candidate-v1.json').read_bytes()
SPEC = importlib.util.spec_from_file_location(
    'resolver', ROOT / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-debian-dependencies.py',
)
resolver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(resolver)


def package(name, version='1', architecture='arm64', **fields):
    return {
        'archive': 'debian', 'Package': name, 'Version': version, 'Architecture': architecture,
        'Filename': f'pool/main/f/fake/{name}_{version}_{architecture}.deb',
        'Size': '9', 'SHA256': 'a' * 64, **fields,
    }


ROOT_PACKAGE = package('root')
ROOT_PIN = {
    'archive': 'debian', 'name': 'root', 'version': '1', 'architecture': 'arm64',
    'pool_directory': 'pool/main/f/fake', 'size_bytes': 9, 'sha256': 'a' * 64,
}


class HolderDebianDependenciesTests(unittest.TestCase):
    def setUp(self):
        self.receipt = json.loads(RECEIPT)
        self.candidate = json.loads(CANDIDATE)

    def test_observation_binds_the_reviewed_inputs_and_each_index_identity(self):
        self.assertEqual(sha256(RECEIPT).hexdigest(),
                         '2b75bc59ee3a90c44dba6be491b2ce7a2099a25cbb30cb2e59cd2e58289602ca')
        self.assertEqual(self.receipt['source_revision'], 'd12f329d4e3515b21fb8449f500cbcf3377f1bde')
        self.assertEqual(self.receipt['toolchain_candidate_sha256'], sha256(CANDIDATE).hexdigest())
        self.assertEqual(self.receipt['trust_root_recommendation_sha256'], sha256(TRUST).hexdigest())
        for field in ('source_manifest_sha256', 'recipe_sha256'):
            self.assertEqual(self.receipt[field], self.candidate[field])
        trusted = {row['purpose']: row['expected_primary_fingerprint']
                   for row in json.loads(TRUST)['key_material_sources']}
        expected = {
            'main': ('trixie', ('DEBIAN_13_ARCHIVE_AUTOMATIC', 'DEBIAN_13_STABLE_RELEASE')),
            'security': ('trixie-security', ('DEBIAN_13_SECURITY_ARCHIVE_AUTOMATIC',)),
        }
        observed = datetime.fromisoformat(self.receipt['observed_at'].replace('Z', '+00:00'))
        self.assertEqual(set(self.receipt['archives']), set(expected))
        for name, (suite, purposes) in expected.items():
            archive = self.receipt['archives'][name]
            self.assertEqual(archive['fields']['Codename'], suite)
            self.assertEqual(set(archive['approved_signatures']), {trusted[purpose] for purpose in purposes})
            self.assertLessEqual(parsedate_to_datetime(archive['fields']['Date']), observed)
            if name == 'security':
                self.assertLessEqual(observed, parsedate_to_datetime(archive['fields']['Valid-Until']))
            self.assertEqual({row['path'] for row in archive['indexes']},
                             {'main/binary-arm64/Packages.xz', 'main/binary-all/Packages.xz'})
            for index in archive['indexes']:
                index_parent = index['path'].rsplit('/', 1)[0]
                base = archive['release_url'].rsplit('/', 1)[0]
                self.assertEqual(index['url'], f"{base}/{index_parent}/by-hash/SHA256/{index['sha256']}")

    def test_exact_metadata_graph_closes_and_leaves_physical_gates_held(self):
        roots = self.candidate['package_roots']
        packages = self.receipt['packages']
        self.assertEqual(resolver.resolve_holder_dependencies(roots, reversed(packages)), tuple(packages))
        self.assertEqual(self.receipt['root_count'], len(roots))
        self.assertEqual(self.receipt['package_count'], 35)
        self.assertEqual(len(packages), 35)
        self.assertEqual(Counter(row['Architecture'] for row in packages), {'arm64': 34, 'all': 1})
        self.assertEqual(sum(int(row['Size']) for row in packages), self.receipt['package_archive_bytes'])
        for field in ('Depends', 'Pre-Depends'):
            clauses = sum(len(resolver._groups(row.get(field, ''))) for row in packages)
            self.assertEqual(clauses, self.receipt['required_relationship_counts'][field])
        self.assertEqual(self.receipt['status'], 'SIGNED_PACKAGE_METADATA_ONLY_HOLD')
        for field in ('package_bytes_verified', 'build_authorized', 'launch_authorized', 'runtime_eligible'):
            self.assertIs(self.receipt[field], False)
        for field in ('native_staging_observation', 'native_loader_closure', 'approved_toolchain_lock',
                      'artifact_receipt'):
            self.assertIsNone(self.receipt[field])
        self.assertEqual(self.receipt['qualifying_native_amd64_builder_receipts_added'], 0)

    def test_debian_order_compares_epochs_tildes_numeric_runs_and_revisions(self):
        for earlier, later in [('3.9', '3.10'), ('1.0~rc1-7', '1.0-1'), ('9', '1:1'),
                               ('2.41-12+deb13u4', '2.41-12+deb13u10'), ('1.0a', '1.0+git')]:
            with self.subTest(earlier=earlier, later=later):
                self.assertLess(resolver.compare_debian_versions(earlier, later), 0)
                self.assertGreater(resolver.compare_debian_versions(later, earlier), 0)
        self.assertEqual(resolver.compare_debian_versions('1.01', '0:1.1-0'), 0)

    def test_versioned_pre_dependency_and_transitive_architecture_independent_dependency(self):
        root = dict(ROOT_PACKAGE, **{'Pre-Depends': 'missing | dep (>= 1.2)'})
        records = [root, package('dep', '1.2'), package('dep', '1.10', Depends='data (= 4)'),
                   package('dep', '2', architecture='amd64'), package('data', '4', architecture='all')]
        resolved = resolver.resolve_holder_dependencies([ROOT_PIN], records)
        self.assertEqual([(row['Package'], row['Version']) for row in resolved],
                         [('data', '4'), ('dep', '1.10'), ('root', '1')])
        with self.assertRaisesRegex(ValueError, 'unresolved for dep: data'):
            resolver.resolve_holder_dependencies([ROOT_PIN], records[:-1])
        with self.assertRaisesRegex(ValueError, r'unresolved for root: missing\|dep'):
            resolver.resolve_holder_dependencies([ROOT_PIN], [root, package('dep', '1.1')])

    def test_wrong_root_hash_and_disagreeing_same_version_records_fail_closed(self):
        changed = dict(ROOT_PACKAGE, SHA256='b' * 64)
        with self.assertRaisesRegex(ValueError, 'root unresolved'):
            resolver.resolve_holder_dependencies([ROOT_PIN], [changed])
        root, dep = dict(ROOT_PACKAGE, Depends='dep'), package('dep')
        security = dict(dep, archive='debian-security')
        self.assertEqual(resolver.resolve_holder_dependencies([ROOT_PIN], [root, security, dep])[0], dep)
        with self.assertRaisesRegex(ValueError, 'Ambiguous signed Debian package records'):
            resolver.resolve_holder_dependencies([ROOT_PIN], [root, dep, dict(security, SHA256='b' * 64)])

    def test_conflicting_direct_and_virtual_providers_fail_closed(self):
        for relationship in ('dep (>= 1)', 'virtual (>= 1)'):
            with self.subTest(relationship=relationship), self.assertRaisesRegex(ValueError, 'Debian Conflicts'):
                root = dict(ROOT_PACKAGE, Depends='dep', Conflicts=relationship)
                resolver.resolve_holder_dependencies([ROOT_PIN], [root, package('dep', Provides='virtual (= 1)')])

    def test_duplicate_fields_and_unsupported_relationships_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate Debian package field'):
            tuple(resolver.read_package_index(['Package: root\n', 'Package: another\n'], 'debian'))
        root = dict(ROOT_PACKAGE, Depends='dep [amd64]')
        with self.assertRaisesRegex(ValueError, 'Unsupported Debian package relationship'):
            resolver.resolve_holder_dependencies([ROOT_PIN], [root])


if __name__ == '__main__':
    unittest.main()
