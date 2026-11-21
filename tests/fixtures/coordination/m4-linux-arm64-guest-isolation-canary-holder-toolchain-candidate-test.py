"""Offline consistency checks for the held Debian package-metadata candidate."""

from hashlib import sha256
import importlib.util
import json
from pathlib import Path, PurePosixPath
import unittest


ROOT = Path(__file__).resolve().parents[3]
PROPOSALS = ROOT / 'docs/proposals'
MANIFEST_RAW = (PROPOSALS / 'm4-linux-arm64-holder-build-manifest-v2.json').read_bytes()
CANDIDATE_RAW = (PROPOSALS / 'm4-linux-arm64-holder-toolchain-candidate-v1.json').read_bytes()
CANDIDATE_DIGEST = 'b499f1cecd84044854631bd702dd33d33666d1fcabcfbf706d27317d62735f0e'
SPEC = importlib.util.spec_from_file_location(
    'closure', ROOT / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-toolchain-closure.py',
)
closure = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(closure)


class HolderToolchainCandidateTests(unittest.TestCase):
    def setUp(self):
        self.candidate = json.loads(CANDIDATE_RAW)
        self.manifest = json.loads(MANIFEST_RAW)

    def test_exact_metadata_candidate_matches_the_reviewed_recipe_and_manifest(self):
        self.assertEqual(sha256(CANDIDATE_RAW).hexdigest(), CANDIDATE_DIGEST)
        self.assertEqual(self.candidate['source_revision'], 'eee1a6a723a6f76c13aeec335930d9a81544ce86')
        self.assertEqual(self.candidate['source_manifest_sha256'], sha256(MANIFEST_RAW).hexdigest())
        self.assertEqual(self.candidate['source_manifest_sha256'], closure.MANIFEST_V2_DIGEST.hex())
        self.assertEqual(self.candidate['recipe_sha256'], self.manifest['recipe_sha256'])
        self.assertEqual(self.candidate['recipe_sha256'], closure.RECIPE_V2_DIGEST.hex())
        self.assertEqual(self.candidate['required_host'], self.manifest['build_contract']['host'])
        self.assertEqual(self.candidate['target'], self.manifest['build_contract']['target'])

    def test_package_roots_pin_the_native_arm64_family_and_kernel_headers(self):
        packages = {row['name']: row for row in self.candidate['package_roots']}
        expected = {
            'gcc-14-aarch64-linux-gnu': ('14.2.0-19', 'arm64', 'debian'),
            'cpp-14-aarch64-linux-gnu': ('14.2.0-19', 'arm64', 'debian'),
            'binutils-aarch64-linux-gnu': ('2.44-3', 'arm64', 'debian'),
            'libc6-dev': ('2.41-12+deb13u4', 'arm64', 'debian'),
            'libc6': ('2.41-12+deb13u4', 'arm64', 'debian'),
            'linux-libc-dev': ('6.12.117-1', 'all', 'debian-security'),
            'libgcc-14-dev': ('14.2.0-19', 'arm64', 'debian'),
        }
        self.assertEqual(len(packages), len(self.candidate['package_roots']))
        self.assertEqual({key: (row['version'], row['architecture'], row['archive']) for key, row in packages.items()},
                         expected)
        for row in packages.values():
            self.assertRegex(row['sha256'], r'^[a-f0-9]{64}$')
            self.assertIs(type(row['size_bytes']), int)
            self.assertGreater(row['size_bytes'], 0)
            self.assertTrue(row['pool_directory'].startswith('pool/'))
            self.assertNotIn('..', PurePosixPath(row['pool_directory']).parts)
        root_bytes = sum(row['size_bytes'] for row in packages.values())
        self.assertEqual(root_bytes, self.candidate['package_root_bytes'])

    def test_package_file_candidates_cover_the_recipe_and_inventory_verifier(self):
        sources = {row['name'] for row in self.candidate['package_roots']}
        stages = {}
        for package, archive_path, stage_path in self.candidate['stage_candidates']:
            self.assertIn(package, sources)
            for path in (archive_path, stage_path):
                self.assertFalse(PurePosixPath(path).is_absolute())
                self.assertNotIn('..', PurePosixPath(path).parts)
            self.assertNotIn(stage_path, stages)
            stages[stage_path] = package
        self.assertEqual(stages[self.manifest['recipe']['driver']], 'gcc-14-aarch64-linux-gnu')
        for tool in closure.REQUIRED_TOOLS:
            self.assertIn(closure.TOOL_PREFIX + tool, stages)
        for suffix in closure.REQUIRED_SYSROOT_INPUTS:
            self.assertTrue(any(path.startswith(closure.SYSROOT_PREFIX) and path.endswith(suffix) for path in stages))
        self.assertIn('toolchain/lib/gcc/aarch64-linux-gnu/14/libgcc.a', stages)
        self.assertIn('toolchain/runtime/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1', stages)

    def test_public_metadata_does_not_supply_a_toolchain_lock_or_build_authority(self):
        self.assertEqual(self.candidate['status'], 'PUBLIC_METADATA_ONLY_HOLD')
        for field in ('signed_index_verification', 'dependency_closure', 'native_staging_observation',
                      'approved_toolchain_lock', 'artifact_receipt'):
            self.assertIsNone(self.candidate[field])
        for field in ('build_authorized', 'launch_authorized', 'runtime_eligible'):
            self.assertIs(self.candidate[field], False)
        self.assertEqual(self.candidate['qualifying_native_amd64_builder_receipts_added'], 0)
        self.assertIsNone(self.manifest['toolchain_closure'])
        self.assertIsNone(self.manifest['artifact_receipt'])


if __name__ == '__main__':
    unittest.main()
