"""Replay the measured ld.bfd metadata graph without constructing a native inventory."""

from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]
PROPOSALS = ROOT / 'docs/proposals'
POLICY_RAW = (PROPOSALS / 'm4-linux-arm64-holder-staging-allowlist-v4.json').read_bytes()
RECORD_RAW = (PROPOSALS / 'm4-linux-arm64-holder-linker-elf-graph-observation-v1.json').read_bytes()
VERIFIER = ROOT / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-toolchain-closure.py'
SPEC = importlib.util.spec_from_file_location('closure', VERIFIER)
closure = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(closure)


def replay_linker_graph(rows, policy, root_path):
    """Resolve exact names and version definitions on the measured subset, with no search or execution."""
    files, metadata = {}, []
    for row in rows:
        mapping = row['mapping']
        path = mapping['staged_path']
        if path in files or mapping not in policy['paths']:
            raise ValueError('Duplicate or unallowlisted ELF graph member.')
        digest = bytes.fromhex(row['member_sha256'])
        executable = bool(int(row['member_mode_octal'], 8) & 0o111)
        files[path] = closure.FixtureHolderToolchainFile(path, row['member_size_bytes'], digest, executable)
        elf = row['elf_metadata']
        metadata.append(closure.FixtureHolderELFObject(
            path, digest, tuple(elf['abi']), elf['kind'], elf['interpreter'], elf['soname'],
            tuple((edge['soname'], tuple(edge['required_versions'])) for edge in elf['needed']),
            tuple(elf['version_definitions']), tuple(elf['unsupported_features']),
        ))
    # This catalog holds the observed ELF subset. No custody or isolation claim is supplied.
    catalog = closure._ToolchainCatalog(files, {})
    objects = closure._elf_objects(tuple(metadata), catalog)
    if objects is None or not closure._runtime_inventory_covered(catalog, objects):
        raise ValueError('Observed ELF objects do not match the restricted profile.')
    if root_path not in objects or objects[root_path].kind != 'DYNAMIC_TOOL':
        raise ValueError('Missing ld.bfd root object.')
    loader = closure._runtime_library(closure.ELF_LOADER_SONAME, catalog, objects)
    if loader is None or not files[loader.path].executable:
        raise ValueError('Missing executable ELF interpreter provider.')

    pending, visited, edges, interpreters = [root_path], set(), [], []
    while pending:
        path = pending.pop()
        if path in visited:
            continue
        visited.add(path)
        obj = objects[path]
        if obj.interpreter:
            if obj.interpreter != closure.ELF_INTERPRETER:
                raise ValueError('Unexpected ELF interpreter.')
            path_in_runtime = closure.RUNTIME_PREFIX + obj.interpreter
            interpreters.append({
                'consumer': path, 'declared_path': obj.interpreter, 'provider_file': loader.path,
                'runtime_path_bound_in_allowlist': catalog.canonical_path(path_in_runtime) == loader.path,
            })
            pending.append(loader.path)
        for index, (soname, versions) in enumerate(obj.needed):
            provider = closure._runtime_library(soname, catalog, objects)
            if provider is None:
                raise ValueError(f'No unique ELF provider for {soname}.')
            if not set(versions).issubset(provider.version_definitions):
                raise ValueError(f'Missing required ELF versions for {soname}.')
            edges.append([path, index, soname, provider.path, list(versions)])
            pending.append(provider.path)
    if visited != objects.keys():
        raise ValueError('Observed ELF catalog contains unreachable objects.')

    encoded = json.dumps(sorted(edges), separators=(',', ':'), ensure_ascii=True).encode('ascii')
    return {
        'status': 'DT_NEEDED_GRAPH_RESOLVED_INTERPRETER_PATH_BINDING_HELD',
        'reachable_objects': len(visited), 'resolved_dt_needed_edges': len(edges),
        'dt_needed_edge_sha256': sha256(encoded).hexdigest(),
        'interpreter_declarations': sorted(interpreters, key=lambda item: item['consumer']),
    }


class HolderLinkerELFGraphTests(unittest.TestCase):
    def setUp(self):
        self.record = json.loads(RECORD_RAW)
        self.policy = json.loads(POLICY_RAW)
        self.rows = self.record['objects']

    def replay(self, rows):
        return replay_linker_graph(rows, self.policy, self.record['root_path'])

    def test_recorded_receipts_and_complete_needed_graph_replay_offline(self):
        observed = self.record
        self.assertEqual(sha256(RECORD_RAW).hexdigest(), 'f7448404857fa92b0bea74463f5388325e846d160f199c0eea6a6fa97f94cba9')
        self.assertEqual(observed['source_revision'], 'f689bc5b60e56178b942b9a9986a9d0dc1c6a850')
        self.assertEqual(observed['allowlist_sha256'], sha256(POLICY_RAW).hexdigest())
        self.assertEqual(observed['object_verifier_sha256'], sha256(VERIFIER.read_bytes()).hexdigest())
        pins = PROPOSALS / 'm4-linux-arm64-holder-debian-dependency-candidate-v1.json'
        self.assertEqual(observed['dependency_candidate_sha256'], sha256(pins.read_bytes()).hexdigest())
        self.assertEqual(observed['receipts']['transitive_libraries']['sha256'],
                         '0722cf63931685eca1e804500843c548318d6604c7d3da381f90b2076eb787b7')
        self.assertEqual(observed['receipts']['loader']['sha256'],
                         '35e32805d33b532663565ca5db0d75ba4a71db9143e748e4003884e0d218f899')
        transitive = observed['transitive_library_observation']
        self.assertEqual(transitive['passing_transitive_library_checks'], 3)
        self.assertEqual(transitive['new_sonames_outside_v4_runtime_paths'], [])
        graph = self.replay(self.rows)
        self.assertEqual(graph, observed['offline_graph'])
        self.assertEqual((graph['reachable_objects'], graph['resolved_dt_needed_edges']), (9, 19))
        self.assertEqual(len(graph['interpreter_declarations']), 2)
        self.assertNotIn(closure.RUNTIME_PREFIX + closure.ELF_INTERPRETER,
                         {row['staged_path'] for row in self.policy['paths']})
        self.assertTrue(all(item['declared_path'] == closure.ELF_INTERPRETER
                            and not item['runtime_path_bound_in_allowlist'] for item in graph['interpreter_declarations']))
        self.assertEqual(self.replay(self.rows[::-1]), graph)

    def test_loader_measurement_binds_its_canonical_file_and_authority_stays_held(self):
        loader, = (item for item in self.rows if item['elf_metadata']['soname'] == closure.ELF_LOADER_SONAME)
        self.assertEqual(loader['member_sha256'], '1b882eddacd494b060413a8aa4f0a4754ee3f84775e68cecbf8a86092b59cca6')
        self.assertEqual((loader['member_size_bytes'], loader['member_mode_octal']), (201344, '0755'))
        self.assertEqual(loader['elf_metadata']['needed'], [])
        self.assertEqual(loader['elf_metadata']['version_definitions'],
                         ['GLIBC_2.17', 'GLIBC_2.34', 'GLIBC_2.35', 'GLIBC_PRIVATE'])
        self.assertEqual(self.record['status'], 'SOURCE_ONLY_HOLD')
        for key in ('package_archives_saved', 'payload_files_saved', 'native_staging_observed',
                    'materialization_authorized', 'build_authorized', 'launch_authorized', 'runtime_eligible'):
            self.assertIs(self.record[key], False)
        for key in ('native_loader_closure', 'approved_toolchain_lock', 'artifact_receipt'):
            self.assertIsNone(self.record[key])
        self.assertEqual(self.record['qualifying_native_amd64_builder_receipts_added'], 0)

    def test_absent_provider_and_missing_loader_symbol_version_fail_closed(self):
        without_sframe = [row for row in self.rows if row['elf_metadata']['soname'] != 'libsframe.so.1']
        with self.assertRaisesRegex(ValueError, 'No unique ELF provider for libsframe'):
            self.replay(without_sframe)
        # Make a fresh fixture copy, leaving the recorded reader result intact.
        rows = json.loads(RECORD_RAW)['objects']
        loader, = (row for row in rows if row['elf_metadata']['soname'] == closure.ELF_LOADER_SONAME)
        loader['elf_metadata']['version_definitions'].remove('GLIBC_PRIVATE')
        with self.assertRaisesRegex(ValueError, 'Missing required ELF versions for ld-linux'):
            self.replay(rows)


if __name__ == '__main__':
    unittest.main()
