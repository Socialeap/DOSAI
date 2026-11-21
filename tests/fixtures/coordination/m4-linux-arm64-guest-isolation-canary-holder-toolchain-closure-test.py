"""Offline tests for the closed native ARM64 holder toolchain inventory."""

from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]
NAME = 'm4-linux-arm64-guest-isolation-canary-holder-toolchain-closure.py'
SOURCE = ROOT / 'tools/local-coordination-pilot' / NAME
spec = importlib.util.spec_from_file_location('holder_toolchain', SOURCE)
closure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(closure)


def file(path, executable=False):
    content = ('synthetic ' + path).encode('ascii')
    return closure.FixtureHolderToolchainFile(path, len(content), sha256(content).digest(), executable)


Alias = closure.FixtureHolderToolchainAlias
MANIFEST = closure.MANIFEST_V2_DIGEST
RECIPE = closure.RECIPE_V2_DIGEST
DRIVER = 'toolchain/bin/aarch64-linux-gnu-gcc'
FRONTEND = 'toolchain/bin/cc1'
ENTRIES = (
    file(DRIVER, True),
    Alias(FRONTEND, '../libexec/compiler-front'),
    Alias('toolchain/libexec/compiler-front', 'cc1'),
    file('toolchain/libexec/cc1', True),
    file('toolchain/bin/as', True),
    file('toolchain/bin/collect2', True),
    file('toolchain/bin/ld', True),
    file('toolchain/lib/libgcc.a'),
    file('toolchain/runtime/lib/ld-linux-aarch64.so.1', True),
    file('toolchain/sysroot/usr/include/fcntl.h'),
    file('toolchain/sysroot/usr/include/linux/seccomp.h'),
    file('toolchain/sysroot/usr/lib/crt1.o'),
    Alias('toolchain/sysroot/usr/lib/libc.a', '../../archives/libc.a'),
    file('toolchain/sysroot/archives/libc.a'),
)
LOCK = closure.FixtureHolderToolchainLock(MANIFEST, RECIPE, ENTRIES)
OBSERVATION = closure.FixtureHolderToolchainObservation(
    'SYNTHETIC_ONLY', 'NATIVE_LINUX_ARM64', MANIFEST, RECIPE, True, True, ENTRIES,
)


def stable_digest(payload):
    return sha256(json.dumps(payload, separators=(',', ':')).encode('ascii')).digest()


EXPECTED_ROWS = sorted(
    ([entry.path, 'FILE', entry.size, entry.digest.hex(), entry.executable] if len(entry) == 4
     else [entry.path, 'ALIAS', entry.target])
    for entry in ENTRIES
)
EXPECTED_ROWS = [[kind, path, *fields] for path, kind, *fields in EXPECTED_ROWS]
APPROVAL = stable_digest(('DOSAI_LINUX_ARM64_HOLDER_TOOLCHAIN_LOCK_V1', OBSERVATION.host,
                          MANIFEST.hex(), RECIPE.hex(), EXPECTED_ROWS))
EXPECTED_SYSROOT = stable_digest(('DOSAI_LINUX_ARM64_HOLDER_SYSROOT_V1',
                                   [row for row in EXPECTED_ROWS if row[1].startswith('toolchain/sysroot/')]))


class HolderToolchainClosureTests(unittest.TestCase):
    def test_binds_the_merged_manifest_and_build_recipe(self):
        raw = (ROOT / 'docs/proposals/m4-linux-arm64-holder-build-manifest-v2.json').read_bytes()
        manifest = json.loads(raw)
        self.assertEqual(sha256(raw).digest(), MANIFEST)
        self.assertEqual(bytes.fromhex(manifest['recipe_sha256']), RECIPE)
        self.assertEqual(manifest['recipe']['driver'], DRIVER)
        self.assertIsNone(manifest['toolchain_closure'])
        self.assertIsNone(manifest['artifact_receipt'])
        self.assertFalse(manifest['build_authorized'])
        self.assertFalse(manifest['launch_authorized'])

    def test_matches_the_exact_canonical_inventory_and_holds_authority(self):
        self.assertEqual(closure.fixture_holder_toolchain_lock_digest(LOCK), APPROVAL)
        shuffled = OBSERVATION._replace(entries=ENTRIES[::-1])
        self.assertEqual(closure.verify_fixture_holder_toolchain_closure(LOCK, APPROVAL, shuffled),
                         closure.FixtureHolderToolchainEvidence('SOURCE_ONLY_HOLD', APPROVAL, EXPECTED_SYSROOT))
        self.assertEqual(closure.fixture_holder_toolchain_lock_digest(LOCK._replace(entries=ENTRIES[::-1])), APPROVAL)

    def test_missing_extra_changed_and_duplicate_files_withhold_evidence(self):
        for entries in (
            ENTRIES[:-1], ENTRIES + (file('toolchain/lib/unapproved.a'),), ENTRIES + (ENTRIES[0],),
            (ENTRIES[0]._replace(digest=b'x' * 32), *ENTRIES[1:]),
            (ENTRIES[0]._replace(size=ENTRIES[0].size + 1), *ENTRIES[1:]),
            (ENTRIES[0]._replace(executable=False), *ENTRIES[1:]),
            (ENTRIES[0]._replace(executable=1), *ENTRIES[1:]),
        ):
            with self.subTest(entries=len(entries)):
                self.assertIsNone(closure.verify_fixture_holder_toolchain_closure(
                    LOCK, APPROVAL, OBSERVATION._replace(entries=entries),
                ))

    def assert_bad_lock(self, entries):
        with self.assertRaisesRegex(ValueError, 'Invalid synthetic holder toolchain lock'):
            closure.fixture_holder_toolchain_lock_digest(LOCK._replace(entries=entries))

    def test_rejects_escaped_aliases_cycles_and_unresolved_paths(self):
        for target in (
            '/usr/bin/cc1', '../../outside/cc1', '../unlisted/cc1', 'cc1', '../libexec',
            '../libexec/cc1/../cc1', '../libexec//cc1',
        ):
            with self.subTest(target=target):
                self.assert_bad_lock((ENTRIES[0], Alias(FRONTEND, target), *ENTRIES[2:]))
        self.assert_bad_lock((*ENTRIES, Alias('toolchain/sysroot/usr/lib/helper', '../../../bin/ld')))
        self.assert_bad_lock((*ENTRIES, Alias('toolchain/libexec/loop-a', 'loop-b'),
                              Alias('toolchain/libexec/loop-b', 'loop-a')))
        self.assert_bad_lock((*ENTRIES, Alias('toolchain/libexec/cc1/descendant', 'other')))
        self.assert_bad_lock((*ENTRIES, file('toolchain/sysroot/../bin/extra')))

    def test_required_subprograms_startup_objects_and_target_libraries_are_present(self):
        missing = ('toolchain/bin/collect2', 'toolchain/bin/as', 'toolchain/lib/libgcc.a',
                   'toolchain/sysroot/usr/include/linux/seccomp.h', 'toolchain/sysroot/usr/lib/crt1.o')
        for path in missing:
            with self.subTest(path=path):
                self.assert_bad_lock(tuple(entry for entry in ENTRIES if entry.path != path))
        self.assert_bad_lock((*ENTRIES[1:], Alias(DRIVER, '../sysroot/archives/libc.a')))

    def test_wrong_approval_revision_platform_or_incomplete_snapshot_is_rejected(self):
        self.assertIsNone(closure.verify_fixture_holder_toolchain_closure(LOCK, b'x' * 32, OBSERVATION))
        for field, value in (('origin', 'LIVE'), ('host', 'NATIVE_LINUX_AMD64'), ('host', 'EMULATED_LINUX_ARM64'),
                             ('manifest_digest', b'x' * 32), ('recipe_digest', b'x' * 32),
                             ('complete', False), ('complete', 1), ('write_fenced', False), ('write_fenced', 1)):
            with self.subTest(field=field, value=value):
                self.assertIsNone(closure.verify_fixture_holder_toolchain_closure(
                    LOCK, APPROVAL, OBSERVATION._replace(**{field: value}),
                ))
        with self.assertRaises(ValueError):
            closure.fixture_holder_toolchain_lock_digest(LOCK._replace(recipe_digest=b'x' * 32))

    def test_bounds_and_malformed_entries_fail_closed(self):
        self.assert_bad_lock(ENTRIES + (file('toolchain/lib/extra')._replace(size=closure.MAX_TOTAL_BYTES),))
        self.assert_bad_lock(ENTRIES + (file('toolchain/lib/extra')._replace(size=-1),))
        self.assert_bad_lock(ENTRIES + (file('toolchain/lib/extra')._replace(digest=bytearray(32)),))
        self.assert_bad_lock(ENTRIES + ({'path': 'toolchain/unknown'},))
        self.assert_bad_lock((ENTRIES[0],) * (closure.MAX_ENTRIES + 1))


RUNTIME = 'toolchain/runtime/usr/lib/aarch64-linux-gnu/'
LOADER = RUNTIME + 'ld-linux-aarch64.so.1'
INTERPRETER_ALIAS = 'toolchain/runtime' + closure.ELF_INTERPRETER
LIBC = RUNTIME + 'libc.so.6'
GCC_LIB = RUNTIME + 'libgcc_s.so.1.0'


def elf(path, kind, interpreter='', soname='', needed=(), versions=()):
    return closure.FixtureHolderELFObject(path, file(path).digest, closure.ELF_ABI,
                                          kind, interpreter, soname, needed, versions, ())


class HolderELFClosureTests(unittest.TestCase):
    def setUp(self):
        self.entries = tuple(entry for entry in ENTRIES if entry.path != INTERPRETER_ALIAS) + (
            Alias(INTERPRETER_ALIAS, '../usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1'),
            file(LOADER, True), file(LIBC), file(GCC_LIB), Alias(RUNTIME + 'libgcc_s.so.1', 'libgcc_s.so.1.0'),
        )
        tool_paths = (DRIVER, 'toolchain/libexec/cc1', 'toolchain/bin/as', 'toolchain/bin/collect2', 'toolchain/bin/ld')
        self.objects = tuple(elf(path, 'DYNAMIC_TOOL', interpreter=closure.ELF_INTERPRETER,
                                 needed=(('libc.so.6', ('GLIBC_2.38',)),)) for path in tool_paths) + (
            elf(LOADER, 'SHARED_OBJECT', soname='ld-linux-aarch64.so.1', versions=('GLIBC_PRIVATE',)),
            elf(LIBC, 'SHARED_OBJECT', soname='libc.so.6', versions=('GLIBC_2.38',),
                needed=(('ld-linux-aarch64.so.1', ('GLIBC_PRIVATE',)), ('libgcc_s.so.1', ('GCC_3.0',)))),
            elf(GCC_LIB, 'SHARED_OBJECT', soname='libgcc_s.so.1', versions=('GCC_3.0',),
                needed=(('libc.so.6', ('GLIBC_2.38',)),)),
        )

    def verify(self, entries=None, objects=None, **changes):
        entries = self.entries if entries is None else entries
        objects = self.objects if objects is None else objects
        lock = LOCK._replace(entries=entries)
        approved = closure.fixture_holder_toolchain_lock_digest(lock)
        observed = OBSERVATION._replace(entries=entries)
        elf_observation = closure.FixtureHolderELFObservation('SYNTHETIC_ONLY', approved, True, objects)
        return closure.verify_fixture_holder_elf_closure(lock, approved, observed, elf_observation._replace(**changes))

    def edit(self, path, **changes):
        return tuple(obj._replace(**changes) if obj.path == path else obj for obj in self.objects)

    def test_transitive_graph_includes_the_exact_loader_and_terminates_on_a_library_cycle(self):
        proof = self.verify()
        self.assertEqual(proof.status, 'SOURCE_ONLY_HOLD')
        self.assertEqual(len(proof.graph_digest), 32)
        self.assertEqual(self.verify(entries=self.entries[::-1], objects=self.objects[::-1]), proof)
        self.assertNotEqual(self.verify(objects=self.edit(LIBC, version_definitions=('GLIBC_2.38', 'GLIBC_2.41'))), proof)

    def test_missing_wrong_or_foreign_interpreter_and_metadata_fail_closed(self):
        for changes in ({'interpreter': ''}, {'interpreter': '/lib64/ld-linux-x86-64.so.2'},
                        {'abi': ('ELF64', 'LITTLE_ENDIAN', 'EM_X86_64')}, {'digest': bytes(32)},
                        {'unsupported_features': ('DT_RUNPATH',)}, {'unsupported_features': ('DT_AUDIT',)}):
            with self.subTest(changes=changes):
                self.assertIsNone(self.verify(objects=self.edit(DRIVER, **changes)))
        self.assertIsNone(self.verify(entries=tuple(e for e in self.entries if e.path != INTERPRETER_ALIAS)))
        self.assertIsNone(self.verify(objects=self.objects[1:]))
        self.assertIsNone(self.verify(objects=(*self.objects, self.objects[0])))

    def test_required_versions_and_transitive_sonames_must_resolve(self):
        self.assertIsNone(self.verify(objects=self.edit(GCC_LIB, version_definitions=('GCC_3.1',))))
        self.assertIsNone(self.verify(objects=self.edit(GCC_LIB, soname='libother.so.1')))
        self.assertIsNone(self.verify(objects=self.edit(GCC_LIB, needed=(('missing.so.1', ()),))))
        self.assertIsNone(self.verify(objects=self.edit(LIBC, needed=(('../libc.so.6', ()),))))

    def test_graph_digest_preserves_needed_order_and_rejects_unreachable_elf_rows(self):
        libc = next(obj for obj in self.objects if obj.path == LIBC)
        reversed_needed = self.verify(objects=self.edit(LIBC, needed=libc.needed[::-1]))
        self.assertEqual(reversed_needed.lock_digest, self.verify().lock_digest)
        self.assertNotEqual(reversed_needed.graph_digest, self.verify().graph_digest)
        unused = RUNTIME + 'libunused.so.1'
        self.assertIsNone(self.verify(entries=(*self.entries, file(unused)), objects=(
            *self.objects, elf(unused, 'SHARED_OBJECT', soname='libunused.so.1'),
        )))

    def test_second_provider_and_hidden_runtime_file_fail_even_with_a_matching_inventory(self):
        other_path = 'toolchain/runtime/lib/libc.so.6'
        entries = (*self.entries, file(other_path))
        objects = (*self.objects, elf(other_path, 'SHARED_OBJECT', soname='libc.so.6', versions=('GLIBC_2.38',)))
        self.assertIsNone(self.verify(entries=entries, objects=objects))
        for path in ('toolchain/runtime/etc/ld.so.cache', RUNTIME + 'glibc-hwcaps/v2/libc.so.6'):
            with self.subTest(path=path):
                self.assertIsNone(self.verify(entries=(*self.entries, file(path))))
        escaped = Alias('toolchain/runtime/lib/injected.so.1', '../../bin/as')
        self.assertIsNone(self.verify(entries=(*self.entries, escaped)))

    def test_live_or_unfenced_claims_and_stale_inventory_bindings_fail_closed(self):
        self.assertIsNone(self.verify(origin='LIVE'))
        self.assertIsNone(self.verify(isolated_default_search=False))
        self.assertIsNone(self.verify(isolated_default_search=1))
        self.assertIsNone(self.verify(inventory_digest=bytes(32)))
        lock = LOCK._replace(entries=self.entries)
        pin = closure.fixture_holder_toolchain_lock_digest(lock)
        inventory = OBSERVATION._replace(entries=self.entries, write_fenced=False)
        observation = closure.FixtureHolderELFObservation('SYNTHETIC_ONLY', pin, True, self.objects)
        self.assertIsNone(closure.verify_fixture_holder_elf_closure(lock, pin, inventory, observation))


if __name__ == '__main__':
    unittest.main()
