"""Exercise exact staged inventory and independent readback with inert fixtures."""

from hashlib import sha256
import importlib.util
import json
from pathlib import Path, PurePosixPath
import unittest


ROOT = Path(__file__).resolve().parents[3]
PROPOSALS = ROOT / 'docs/proposals'
HOLDER = 'm4-linux-arm64-holder-'
PLAN_RAW = (PROPOSALS / (HOLDER + 'staging-readback-plan-v1.json')).read_bytes()
PLAN = json.loads(PLAN_RAW)


def load(module):
    path = ROOT / 'tools/local-coordination-pilot' / ('m4-linux-arm64-guest-isolation-canary-holder-' + module + '.py')
    spec = importlib.util.spec_from_file_location(module, path)
    source = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(source)
    return source


readback = load('staging-readback')
closure = load('toolchain-closure')
SEAL = readback.FixtureStagingSeal(b'w' * 32, 17, 100, 8, True)
CC1 = 'toolchain/bin/cc1'
LINKER = 'toolchain/bin/ld'
INTERPRETER = 'toolchain/runtime/lib/ld-linux-aarch64.so.1'
SYSROOT = 'toolchain/sysroot'


class HolderStagingReadbackTests(unittest.TestCase):
    def setUp(self):
        leaves = {row['staged_path']: readback.StagedContent(
            row['kind'], int(row['mode_octal'], 8), row['size_bytes'],
            bytes.fromhex(row['sha256']) if row['sha256'] else None, row['link_target'],
        ) for row in PLAN['entries']}
        directories = {str(parent) for path in leaves for parent in PurePosixPath(path).parents} - {'.'}
        node_content = {**leaves, **{
            path: readback.StagedContent('DIRECTORY', 0o755, 0, None, None) for path in directories
        }}
        self.nodes = tuple(
            readback.FixtureStagedNode(path, content, SEAL.mount_id, inode, 2 if path in directories else 1, 70)
            for inode, (path, content) in enumerate(sorted(node_content.items()), SEAL.root_inode)
        )
        self.before = readback.FixtureStagingReadback('SYNTHETIC_ONLY', b'r' * 32, SEAL, True, 31, self.nodes)
        self.after = self.before._replace(sequence=32, nodes=self.nodes[::-1])

    def compare(self, before=None, after=None, plan=PLAN_RAW, seal=SEAL):
        return readback.verify_fixture_holder_staging_readback(
            plan, seal, self.before if before is None else before, self.after if after is None else after,
        )

    def after_with_node(self, path, **updates):
        return self.after._replace(nodes=tuple(
            node._replace(**updates) if node.path == path else node for node in self.nodes
        ))

    def test_plan_binds_v6_archive_members_and_pr105_evidence_without_authority(self):
        self.assertEqual(PLAN['source_revision'], 'fcc2ff7125a33f2fb7070e860bccb1b8b23f58b3')
        self.assertEqual(PLAN['status'], 'SOURCE_ONLY_HOLD')
        for file, digest in PLAN['input_sha256'].items():
            self.assertEqual(sha256((PROPOSALS / file).read_bytes()).hexdigest(), digest, file)
        self.assertEqual(PLAN['manifest_sha256'], closure.MANIFEST_V2_DIGEST.hex())
        self.assertEqual(PLAN['recipe_sha256'], closure.RECIPE_V2_DIGEST.hex())
        policy = json.loads((PROPOSALS / (HOLDER + 'staging-allowlist-v6.json')).read_bytes())
        initial = json.loads((PROPOSALS / (HOLDER + 'staging-member-observation-v1.json')).read_bytes())
        self.assertEqual(PLAN['initial_raw_receipt_sha256'], initial['raw_receipt_sha256'])
        self.assertEqual(
            [{key: row[key] for key in ('package', 'member_path', 'staged_path')} for row in PLAN['entries'][:-1]],
            policy['paths'],
        )
        self.assertEqual(sum(row['kind'] == 'FILE' for row in PLAN['entries']), 24)
        self.assertEqual([row for row in PLAN['entries'] if row['kind'] == 'SYMLINK'], [
            initial['observed_link'],
            {'package': None, 'member_path': None, 'staged_path': INTERPRETER, 'kind': 'SYMLINK',
             'mode_octal': '0777', 'size_bytes': 0, 'sha256': None,
             'link_target': policy['runtime_interpreter_binding']['relative_target']},
        ])
        staged = {row['staged_path']: row for row in PLAN['entries']}
        for name, key in (('linker-elf-graph-observation-v1', 'objects'),
                          ('tool-root-elf-observation-v1', 'tools'), ('tool-root-library-elf-observation-v1', 'objects')):
            observation = json.loads((PROPOSALS / (HOLDER + name + '.json')).read_bytes())
            for row in observation[key]:
                member = staged[row['mapping']['staged_path']]
                self.assertEqual((member['mode_octal'], member['size_bytes'], member['sha256']),
                                 (row['member_mode_octal'], row['member_size_bytes'], row['member_sha256']))
        for key in ('native_staging_observation', 'native_readback_observation', 'native_loader_closure',
                    'approved_toolchain_lock', 'artifact_receipt'):
            self.assertIsNone(PLAN[key])
        for key in ('materialization_authorized', 'build_authorized', 'launch_authorized', 'runtime_eligible'):
            self.assertIs(PLAN[key], False)
        self.assertEqual(PLAN['qualifying_native_amd64_builder_receipts_added'], 0)
        self.assertIsNone(self.compare(plan=PLAN_RAW + b' '))
        self.assertIsNone(self.compare(plan=bytearray(PLAN_RAW)))

    def test_complete_exact_readbacks_feed_the_existing_v2_inventory_and_elf_verifiers(self):
        result = self.compare()
        self.assertEqual(result.status, 'SOURCE_ONLY_HOLD')
        self.assertEqual(len(result.entries), len(self.nodes))
        self.assertEqual(result, self.compare(before=self.before._replace(nodes=self.nodes[::-1]),
                                              after=self.after._replace(nodes=self.nodes)))
        self.assertNotEqual(result.census_digest, result.sysroot_digest)

        def project(nodes):
            entries = []
            for path, content in nodes:
                if content.kind == 'FILE':
                    entries.append(closure.FixtureHolderToolchainFile(
                        path, content.size, content.digest, bool(content.mode & 0o111),
                    ))
                elif content.kind == 'SYMLINK':
                    entries.append(closure.FixtureHolderToolchainAlias(path, content.target))
            return tuple(entries)

        expected = project((node.path, node.content) for node in self.before.nodes)
        observed = project(result.entries)
        manifest, recipe = closure.MANIFEST_V2_DIGEST, closure.RECIPE_V2_DIGEST
        inventory = closure.FixtureHolderToolchainObservation(
            'SYNTHETIC_ONLY', 'NATIVE_LINUX_ARM64', manifest, recipe, True, True, observed,
        )
        lock = closure.FixtureHolderToolchainLock(manifest, recipe, expected)
        lock_digest = closure.fixture_holder_toolchain_lock_digest(lock)
        self.assertEqual(closure.verify_fixture_holder_toolchain_closure(lock, lock_digest, inventory).status,
                         'SOURCE_ONLY_HOLD')

        objects = []
        for name, key in (('linker-elf-graph-observation-v1', 'objects'),
                          ('tool-root-elf-observation-v1', 'tools'), ('tool-root-library-elf-observation-v1', 'objects')):
            record = json.loads((PROPOSALS / (HOLDER + name + '.json')).read_bytes())
            for row in record[key]:
                elf = row['elf_metadata']
                objects.append(closure.FixtureHolderELFObject(
                    row['mapping']['staged_path'], bytes.fromhex(row['member_sha256']), tuple(elf['abi']),
                    elf['kind'], elf['interpreter'], elf['soname'],
                    tuple((edge['soname'], tuple(edge['required_versions'])) for edge in elf['needed']),
                    tuple(elf['version_definitions']), tuple(elf['unsupported_features']),
                ))
        self.assertEqual(len(objects), 19)
        elf_observation = closure.FixtureHolderELFObservation('SYNTHETIC_ONLY', lock_digest, True, tuple(objects))
        self.assertEqual(closure.verify_fixture_holder_elf_closure(lock, lock_digest, inventory, elf_observation).status,
                         'SOURCE_ONLY_HOLD')

    def test_full_census_rejects_extra_missing_duplicate_and_special_nodes(self):
        root, cc1 = self.nodes[0], next(node for node in self.nodes if node.path == CC1)
        for nodes in (
            self.nodes[1:],
            self.nodes + (root._replace(path='toolchain/empty'),),
            self.nodes[1:] + (cc1,),
            self.nodes[1:] + (root._replace(path='toolchain/.hidden'),),
            self.nodes[1:] + (root._replace(path='toolchain/../escape'),),
        ):
            with self.subTest(last_path=nodes[-1].path):
                self.assertIsNone(self.compare(after=self.after._replace(nodes=nodes)))
        self.assertIsNone(self.compare(after=self.after_with_node(CC1, content=cc1.content._replace(kind='DEVICE'))))
        self.assertIsNone(self.compare(after=self.after_with_node('toolchain', content=root.content._replace(mode=0o700))))

    def test_exact_regular_file_modes_bytes_and_alias_targets_are_required(self):
        cc1, = (node for node in self.nodes if node.path == CC1)
        for updates in ({'mode': 0o555}, {'digest': b'x' * 32}, {'size': cc1.content.size + 1}):
            with self.subTest(updates=updates):
                changed = self.after_with_node(CC1, content=cc1.content._replace(**updates))
                self.assertIsNone(self.compare(after=changed))
        for path, target in ((LINKER, 'as'), (LINKER, '../../outside'),
                             (INTERPRETER, '../usr/lib/aarch64-linux-gnu/libc.so.6'),
                             (INTERPRETER, '/lib/ld-linux-aarch64.so.1')):
            with self.subTest(path=path, target=target):
                node, = (node for node in self.nodes if node.path == path)
                self.assertIsNone(self.compare(after=self.after_with_node(path, content=node.content._replace(target=target))))

    def test_readback_requires_independent_ordered_complete_samples_on_the_same_seal(self):
        for change in (
            {'origin': 'NATIVE_LINUX_ARM64'}, {'complete': False}, {'complete': 1},
            {'sequence': self.before.sequence}, {'sequence': 30}, {'sequence': True},
            {'reader_id': SEAL.writer_id}, {'reader_id': b'R' * 32},
            {'seal': SEAL._replace(generation=9)}, {'seal': SEAL._replace(write_fenced=False)},
            {'seal': SEAL._replace(mount_id=18)}, {'seal': SEAL._replace(root_inode=101)},
        ):
            with self.subTest(change=change):
                self.assertIsNone(self.compare(after=self.after._replace(**change)))
        self.assertIsNone(self.compare(before=self.before._replace(reader_id=SEAL.writer_id)))
        self.assertIsNone(self.compare(seal=SEAL._replace(write_fenced=1)))

    def test_same_content_cannot_mask_inode_replacement_or_a_mount_or_link_change(self):
        cc1, = (node for node in self.nodes if node.path == CC1)
        as_node, = (node for node in self.nodes if node.path == 'toolchain/bin/as')
        for path, change in (
            (CC1, {'mount_id': 18}), (SYSROOT, {'mount_id': 18}), (CC1, {'inode': as_node.inode}),
            (CC1, {'inode': 9999}), (CC1, {'change_time_ns': cc1.change_time_ns + 1}),
            (CC1, {'link_count': 2}), (INTERPRETER, {'link_count': 2}), ('toolchain', {'inode': 9999}),
        ):
            with self.subTest(path=path, change=change):
                self.assertIsNone(self.compare(after=self.after_with_node(path, **change)))


if __name__ == '__main__':
    unittest.main()
