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


if __name__ == '__main__':
    unittest.main()
