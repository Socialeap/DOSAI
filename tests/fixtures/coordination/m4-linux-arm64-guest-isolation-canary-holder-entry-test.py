"""Offline holder entry ABI, plan encoding, and startup order checks."""

from hashlib import sha256
import importlib.util
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[3]
TOOLS = ROOT / 'tools/local-coordination-pilot'
PREFIX = 'm4-linux-arm64-guest-isolation-canary-'
ENTRY_SOURCE = TOOLS / f'{PREFIX}holder-entry.c'
BOOTSTRAP_SOURCE = TOOLS / f'{PREFIX}holder-bootstrap.c'
ENTRY_DIGEST = 'd74a9a47f6479fe9141678ff885544f729919f16d4bfc9d2a99d6531546b38cf'
spec = importlib.util.spec_from_file_location('holder_harness', TOOLS / f'{PREFIX}harness.py')
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)

REQUEST = harness.CanaryRequest('HOST_FILE_READ', 'CONTROL_BEFORE', 1, 'a' * 64, 'fixture-control')
BINDING = harness.FixtureAttemptBinding(REQUEST, 'fixture-supervisor', 'b' * 64, 300)
WATCHDOG = harness.FixtureWatchdogPlan(
    'SYNTHETIC_ONLY', BINDING, 'fixture-capsule', 'fixture-watchdog', 'fixture-verifier', 600_000_000,
)
TEMPLATE = harness.FixtureCleanupScope(WATCHDOG, 0, b'c' * 32, 'fixture-resource-registry')
RESOURCE = harness.FixtureResourceBinding(
    'temporary_files', WATCHDOG.capsule_generation, 'fixture-temp-reader', 'fixture-owner',
    'fixture-temp-slot', 'fixture-temp-instance',
)
PLAN = harness.FixtureTempFileLaunchPlan(
    TEMPLATE, RESOURCE, 'fixture-policy', b'd' * 32, harness.TEMP_REFERENCE_FILTER_DIGEST,
    b'e' * 32, 41, (11, 21), (12, 23), (12, 24), 275,
)


def c_struct(source, name):
    match = re.search(rf'^struct {name} \{{\n(.*?)^\}};', source, re.M | re.S)
    if match is None:
        raise AssertionError(f'Missing struct {name}')
    return tuple(line.strip() for line in match[1].strip().splitlines())


class HolderEntryTests(unittest.TestCase):
    def setUp(self):
        self.entry = ENTRY_SOURCE.read_text()
        self.bootstrap = BOOTSTRAP_SOURCE.read_text()

    def test_exact_source_pin_and_bootstrap_types_match(self):
        self.assertEqual(sha256(ENTRY_SOURCE.read_bytes()).hexdigest(), ENTRY_DIGEST)
        for name in ('holder_pin', 'holder_bootstrap_plan'):
            with self.subTest(struct=name):
                self.assertEqual(c_struct(self.entry, name), c_struct(self.bootstrap, name))
        self.assertIn('_Noreturn void dosai_bootstrap_temp_file_holder(const struct holder_bootstrap_plan *plan);',
                      self.entry)
        self.assertIn('sizeof(struct holder_bootstrap_plan) == 88', self.entry)
        self.assertIn('offsetof(struct holder_entry_frame, plan) == 8', self.entry)
        self.assertIn('sizeof(struct holder_entry_frame) == 96', self.entry)
        self.assertEqual(c_struct(self.entry, 'holder_entry_frame'),
                         ('unsigned char magic[8];', 'struct holder_bootstrap_plan plan;'))

    def test_encoder_and_c_wire_agree_on_all_offsets(self):
        frame = harness.encode_fixture_temp_file_entry_plan(PLAN)
        expected = b'DOSAIE01' + PLAN.nonce + b''.join(
            number.to_bytes(8, 'little') for number in (41, 11, 21, 12, 23, 12, 24)
        )
        self.assertEqual(frame, expected)
        self.assertEqual(len(frame), 96)
        self.assertEqual(frame[:8], b'DOSAIE01')
        self.assertEqual(frame[8:40], PLAN.nonce)
        for offset, value in {
            40: PLAN.pid, 48: PLAN.directory[0], 56: PLAN.directory[1],
            64: PLAN.control[0], 72: PLAN.control[1], 80: PLAN.setup[0], 88: PLAN.setup[1],
        }.items():
            with self.subTest(offset=offset):
                self.assertEqual(int.from_bytes(frame[offset:offset + 8], 'little'), value)
        self.assertIn('memcmp(frame.magic, "DOSAIE01", sizeof(frame.magic)) != 0', self.entry)
        self.assertNotEqual(frame[:8], b'DOSAITF1')

    def test_encoder_rejects_bad_scope_pins_and_build_binding(self):
        for changes in (
            {'nonce': bytearray(PLAN.nonce)}, {'nonce': b'x' * 31},
            {'pid': True}, {'pid': 0}, {'pid': 2**31},
            {'directory': (11, 0)}, {'control': PLAN.setup}, {'setup': (12, True)},
            {'directory': [11, 21]}, {'policy_generation': 'unknown'},
            {'binding': RESOURCE._replace(kind='sockets')},
            {'template': TEMPLATE._replace(fence_ns=10)},
            {'program_digest': b'x' * 32}, {'executable_digest': b''},
            {'deadline_ns': WATCHDOG.binding.deadline_ns + 1},
        ):
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, 'Invalid synthetic holder entry plan'):
                harness.encode_fixture_temp_file_entry_plan(PLAN._replace(**changes))
        with self.assertRaises(ValueError):
            harness.encode_fixture_temp_file_entry_plan(tuple(PLAN))

    def test_entry_checks_read_only_sealed_plan_and_exact_eof(self):
        for guard in (
            'CONTROL_FD = 3, ENTRY_PLAN_FD = 6', '(flags & O_PATH)', '(flags & O_ACCMODE) != O_RDONLY',
            'F_SEAL_SEAL | F_SEAL_SHRINK | F_SEAL_GROW | F_SEAL_WRITE',
            '(seals & required) == required', 'entry.st_nlink == 0', 'filesystem.f_type == TMPFS_MAGIC',
            'entry.st_size == (off_t)sizeof(struct holder_entry_frame)',
            'pread(ENTRY_PLAN_FD, &frame, sizeof(frame), 0) != (ssize_t)sizeof(frame)',
            'pread(ENTRY_PLAN_FD, &trailing, 1, sizeof(frame)) != 0',
            'close(ENTRY_PLAN_FD) != 0',
        ):
            with self.subTest(guard=guard):
                self.assertIn(guard, self.entry)
        self.assertIn('__BYTE_ORDER__ != __ORDER_LITTLE_ENDIAN__', self.entry)
        self.assertIn('!defined(__linux__) || !defined(__aarch64__)', self.entry)

    def test_admission_read_is_pinned_and_precedes_the_only_bootstrap_call(self):
        main = self.entry.split('int main(', 1)[1]
        sequence = (
            'argc != 1', 'strcmp(argv[0], "dosai-temp-file-holder") != 0',
            'environ[0] != NULL', '!matches_entry_plan_fd()', 'pread(ENTRY_PLAN_FD, &frame',
            'pread(ENTRY_PLAN_FD, &trailing', 'close(ENTRY_PLAN_FD)', 'memcmp(frame.magic',
            'plan->pid != (uint64_t)getpid()', 'plan->pid != (uint64_t)syscall(SYS_gettid)',
            '!distinct_pins(&plan->control, &plan->setup)', '!matches_control(&plan->control)',
            "read(CONTROL_FD, &admission, 1) != 1 || admission != 'B'", 'dosai_bootstrap_temp_file_holder(plan);',
        )
        indices = [main.index(fragment) for fragment in sequence]
        self.assertEqual(indices, sorted(indices))
        self.assertEqual(main.count('dosai_bootstrap_temp_file_holder('), 1)
        self.assertRegex(main, r"admission != 'B'\) \{\s*_exit\(124\);\s*\}")
        self.assertIn('!(flags & (O_PATH | O_NONBLOCK))', self.entry)
        self.assertIn('S_ISFIFO(entry.st_mode)', self.entry)
        self.assertIn('filesystem.f_type == PIPEFS_MAGIC', self.entry)
        self.assertIn('(uint64_t)entry.st_dev == pin->device && (uint64_t)entry.st_ino == pin->inode', self.entry)
        self.assertNotRegex(self.entry, r'\b(?:open|openat|write|unlink|fork|execve|socket)\s*\(')
        self.assertIn("command != 'C'", self.bootstrap)


if __name__ == '__main__':
    unittest.main()
