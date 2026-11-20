"""Offline native temporary-file observation, coverage and registry checks."""

import errno
from hashlib import sha256
import importlib.util
import os
from pathlib import Path
import re
import stat
import struct
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch


TOOLS = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot'


def load(suffix):
    spec = importlib.util.spec_from_file_location(suffix, TOOLS / f'm4-linux-arm64-guest-isolation-canary-{suffix}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


harness = load('harness')
native = load('watchdog-terminator')
REQUEST = harness.CanaryRequest('HOST_FILE_READ', 'CONTROL_BEFORE', 1, 'a' * 64, 'fixture-control')
BINDING = harness.FixtureAttemptBinding(REQUEST, 'fixture-supervisor', 'b' * 64, 300)
PLAN = harness.FixtureWatchdogPlan(
    'SYNTHETIC_ONLY', BINDING, 'fixture-capsule', 'fixture-watchdog', 'fixture-verifier', 600_000_000,
)
TEMPLATE = harness.FixtureCleanupScope(PLAN, 0, b'c' * 32, 'fixture-resource-registry')
RESOURCE = harness.FixtureResourceBinding(
    'temporary_files', PLAN.capsule_generation, 'fixture-temp-reader', 'fixture-owner',
    'fixture-temp-slot', 'fixture-temp-instance',
)
PROBE = harness.FixtureResourceProbe(TEMPLATE._replace(fence_ns=100), RESOURCE)
DIRECTORY = native.FixtureHandlePin(11, 21)
FILE = native.FixtureHandlePin(11, 22)
TABLE = native.FixtureHandlePin(12, 23)
LINK = native.FixtureHandlePin(12, 24)
PIN = native.FixtureTempFilePin(DIRECTORY, 0x01021994, FILE, TABLE)
DIGEST = native.fixture_temp_file_observation_digest(PIN)
HANDLES = native.FixtureTempFileHandles(7, 8)
PROCESS = native.FixtureTempFileProcessPin(native.FixtureHandlePin(12, 25), 41, 987)
ENROLLMENT = native.fixture_temp_file_enrollment_digest(PIN, PROCESS)
POLICY_GENERATION = 'fixture-reference-policy'
ABSENT = FileNotFoundError(errno.ENOENT, 'fixture absent')
FILTER_SOURCE = TOOLS / 'm4-linux-arm64-guest-isolation-canary-reference-filter.c'
FILTER_RECEIPT = harness.FixtureTempFileFilterReceipt(
    ENROLLMENT, POLICY_GENERATION, harness.TEMP_REFERENCE_FILTER_DIGEST, PROCESS.pid, 0, True, True,
)
FILTER_STATUS = (
    b'Name:\tfixture\nPid:\t41\nTgid:\t41\nTracerPid:\t0\nThreads:\t1\n'
    b'NoNewPrivs:\t1\nSeccomp:\t2\nSeccomp_filters:\t1\n'
)
ALLOW = 0x7fff0000
KILL = 0x80000000
ARCH = 0xc00000b7


def stat_record(pid=41, started=987, state=b'S'):
    fields = [b'0'] * 49
    fields[18] = str(started).encode('ascii')
    return str(pid).encode('ascii') + b' (fixture ) name\n)) ' + state + b' ' + b' '.join(fields) + b'\n'


def policy_report(challenge):
    return harness.FixtureTempFilePolicyReadback(challenge, POLICY_GENERATION, True, True, True, True, True, True)


def boundary_report(challenge):
    fence = harness.FixtureCleanupFenceReadback(challenge.probe.scope, 'REVOKED_QUIESCED')
    return harness.FixtureTempFileBoundaryReadback(challenge, fence, True, True)


def load_filter(source):
    constants = {'SECCOMP_RET_ALLOW': ALLOW, 'SECCOMP_RET_KILL_PROCESS': KILL}
    rows = re.findall(r'^\s*\{([^{}]+)\},', source, re.M)
    return [
        tuple(constants[token] if token in constants else int(token, 0) for token in row.replace(' ', '').split(','))
        for row in rows
    ]


def evaluate_filter(program, syscall, *, arch=ARCH, descriptor=3, read_length=1):
    data = struct.pack('<IIQQQQQQQ', syscall, arch, 0, descriptor, 0, read_length, 0, 0, 0)
    accumulator = 0
    index = 0
    for _ in program:
        op, equal, different, value = program[index]
        if op == 0x20:
            accumulator, = struct.unpack_from('<I', data, value)
            index += 1
        elif op == 0x15:
            index += 1 + (equal if accumulator == value else different)
        elif op == 0x06:
            return value
        else:
            raise AssertionError('Unexpected reference-filter instruction')
    raise AssertionError('Reference filter did not terminate')


class ReferenceFilterProgramTests(unittest.TestCase):
    def test_exact_c_filter_digest_and_closed_arm64_syscall_set(self):
        source = FILTER_SOURCE.read_text()
        program = load_filter(source)
        encoded = b''.join(struct.pack('<HBBI', *row) for row in program)
        self.assertEqual(sha256(encoded).digest(), harness.TEMP_REFERENCE_FILTER_DIGEST)
        self.assertIn('PR_SET_NO_NEW_PRIVS, 1UL', source)
        self.assertIn('SECCOMP_SET_MODE_FILTER, SECCOMP_FILTER_FLAG_TSYNC', source)
        self.assertIn('_exit(125)', source)
        for syscall in (*range(1024), 0x4000003f, 0xffffffff):
            outcome = ALLOW if syscall in (57, 63, 93, 94) else KILL
            self.assertEqual(evaluate_filter(program, syscall), outcome, syscall)

    def test_filter_rejects_other_abis_and_unbound_or_wide_control_reads(self):
        program = load_filter(FILTER_SOURCE.read_text())
        for arch in (0, 0x40000028, 0xc000003e, ARCH ^ 0x40000000):
            for syscall in (57, 63, 93, 94):
                self.assertEqual(evaluate_filter(program, syscall, arch=arch), KILL)
        for descriptor, size in ((0, 1), (4, 1), (0x100000003, 1), (3, 0), (3, 2), (3, 0x100000001)):
            self.assertEqual(evaluate_filter(program, 63, descriptor=descriptor, read_length=size), KILL)


class TempFileObservationTests(unittest.TestCase):
    def setUp(self):
        self.calls = Mock()
        self.calls.duplicate.side_effect = lambda fd: fd + 10
        self.calls.open_table.return_value = 19
        self.directory_facts = native.DescriptorFacts(DIRECTORY, stat.S_IFDIR, PIN.directory_filesystem, False, os.O_RDONLY)
        self.table_facts = native.DescriptorFacts(TABLE, stat.S_IFDIR, native.PROCFS_MAGIC, False, os.O_RDONLY)
        self.calls.describe.side_effect = {17: self.directory_facts, 18: self.table_facts, 19: self.table_facts}.__getitem__
        self.calls.list_slots.return_value = ('3', '4')
        self.calls.stat_entry.side_effect = self.stat_entry
        self.ops = native.TempFileReadOps(*(
            getattr(self.calls, name) for name in native.TempFileReadOps._fields
        ))
        self.observe = native.prepare_fixture_temp_file_observer(PIN, HANDLES, ops=self.ops)
        self.clock = Mock(return_value=100)
        self.coverage = Mock(side_effect=lambda probe: self.coverage_for(probe))

    def stat_entry(self, fd, name, follow):
        if (fd, name, follow) == (17, native.TEMP_FILE_NAME, False):
            raise ABSENT
        if fd == 19 and name in ('3', '4'):
            return (FILE, stat.S_IFREG) if follow else (LINK, stat.S_IFLNK)
        self.fail('Unexpected stat arguments')

    def coverage_for(self, probe):
        return harness.FixtureTempFileCoverage(probe, DIGEST, 'REVOKED_EXCLUSIVE_DESCRIPTOR_ONLY')

    def prepare_source(self, observer, coverage=None):
        return harness.prepare_fixture_temp_file_inventory_source(
            TEMPLATE, RESOURCE, DIGEST, self.clock, self.coverage if coverage is None else coverage, observer,
        )

    def prepare_enrollment(self):
        operations = Mock()
        operations.duplicate.side_effect = lambda fd: fd + 10
        process_facts = self.table_facts._replace(pin=PROCESS.directory)
        operations.describe.side_effect = {18: self.table_facts, 20: process_facts}.__getitem__
        operations.read_stat.return_value = stat_record()
        operations.lookup_table.return_value = (TABLE, stat.S_IFDIR)
        ops = native.TempFileEnrollmentOps(*(getattr(operations, name) for name in native.TempFileEnrollmentOps._fields))
        return native.prepare_fixture_temp_file_enrollment(PIN, HANDLES, PROCESS, 10, ops=ops), operations, ops

    def prepare_coverage(self, policy, verify):
        return harness.prepare_fixture_temp_file_reference_coverage(
            TEMPLATE, RESOURCE, DIGEST, ENROLLMENT, POLICY_GENERATION, policy, verify,
        )

    def prepare_filter_policy(self, receipt, boundary, read_status):
        return harness.prepare_fixture_temp_file_filter_policy(
            TEMPLATE, RESOURCE, DIGEST, ENROLLMENT, POLICY_GENERATION, receipt, boundary, read_status,
        )

    def test_registration_is_inert_and_rejects_wrong_digest_and_invalid_pins(self):
        self.assertIsNone(self.observe(b'x' * 32))
        self.assertIsNone(self.observe(bytearray(DIGEST)))
        for pin, handles in (
            (PIN._replace(descriptor_table=DIRECTORY), HANDLES),
            (PIN._replace(file=FILE._replace(device=13)), HANDLES),
            (PIN._replace(directory_filesystem=native.PROCFS_MAGIC), HANDLES),
            (PIN, HANDLES._replace(descriptor_table_fd=7)),
            (PIN, HANDLES._replace(directory_fd=0)),
        ):
            with self.subTest(pin=pin, handles=handles), self.assertRaises(ValueError):
                native.prepare_fixture_temp_file_observer(pin, handles, ops=self.ops)
        self.assertEqual(self.calls.mock_calls, [])

    def test_vacant_slot_still_counts_all_pinned_open_references(self):
        self.assertEqual(self.observe(DIGEST), ('VACANT', 2))
        self.assertEqual(self.calls.mock_calls, [
            call.duplicate(7), call.duplicate(8), call.describe(17), call.describe(18),
            call.open_table(18), call.describe(19), call.stat_entry(17, native.TEMP_FILE_NAME, False),
            call.list_slots(19), call.stat_entry(19, '3', False), call.stat_entry(19, '3', True),
            call.stat_entry(19, '4', False), call.stat_entry(19, '4', True),
            call.stat_entry(17, native.TEMP_FILE_NAME, False), call.describe(19), call.describe(17),
            call.close(19), call.close(18), call.close(17),
        ])

    def test_present_replaced_and_changing_slots(self):
        self.calls.list_slots.return_value = ()
        for entries, expected in (
            ([(FILE, stat.S_IFREG)] * 2, ('PRESENT', 0)),
            ([(LINK, stat.S_IFLNK)] * 2, ('REPLACED', 0)),
            ([ABSENT, (FILE, stat.S_IFREG)], None),
            ([PermissionError(errno.EACCES, 'unavailable')], None),
            ([FileNotFoundError(errno.ESTALE, 'unavailable')], None),
        ):
            with self.subTest(expected=expected, entries=entries):
                self.calls.stat_entry.side_effect = entries
                self.assertEqual(self.observe(DIGEST), expected)

    def test_only_canonical_bounded_fd_names_follow_kernel_links(self):
        for slots in (
            ('../outside',), ('03',), ('3', '3'), ('2147483648',), ['3'],
            tuple(str(index) for index in range(native.MAX_TEMP_FILE_FDS + 1)),
        ):
            with self.subTest(slots=slots[:2]):
                self.calls.list_slots.return_value = slots
                self.calls.stat_entry.reset_mock()
                self.assertIsNone(self.observe(DIGEST))
                self.calls.stat_entry.assert_called_once_with(17, native.TEMP_FILE_NAME, False)
        self.calls.list_slots.return_value = ('3',)
        self.calls.stat_entry.side_effect = [ABSENT, (LINK, stat.S_IFREG)]
        self.assertIsNone(self.observe(DIGEST))
        self.assertNotIn(call(19, '3', True), self.calls.stat_entry.call_args_list)
        self.calls.stat_entry.side_effect = [ABSENT, (LINK, stat.S_IFLNK), ABSENT]
        self.assertIsNone(self.observe(DIGEST), 'Descriptor disappearing mid-read leaves the census incomplete.')

    def test_drift_permissions_and_close_failure_withhold_evidence(self):
        for change in (
            self.table_facts._replace(pin=TABLE._replace(inode=99)),
            self.table_facts._replace(inheritable=True), self.table_facts._replace(filesystem=0),
        ):
            with self.subTest(facts=change):
                self.calls.describe.side_effect = [self.directory_facts, self.table_facts, self.table_facts, change]
                self.assertIsNone(self.observe(DIGEST))
        self.calls.describe.side_effect = {17: self.directory_facts, 18: self.table_facts, 19: self.table_facts}.__getitem__
        self.calls.close.reset_mock()
        self.calls.close.side_effect = OSError(errno.EIO, 'close unavailable')
        self.assertIsNone(self.observe(DIGEST))
        self.assertEqual(self.calls.close.call_args_list, [call(19), call(18), call(17)])

    def test_native_ops_open_a_fresh_read_only_table_and_bound_the_scan(self):
        entries = tuple(SimpleNamespace(name=str(index)) for index in range(native.MAX_TEMP_FILE_FDS + 1))
        scan = Mock()
        scan.__enter__ = Mock(return_value=iter(entries))
        scan.__exit__ = Mock(return_value=False)
        with patch.object(native, '_linux_arm64_descriptor_reader', return_value=Mock()), \
                patch.object(native.os, 'open', return_value=19) as open_directory, \
                patch.object(native.os, 'scandir', return_value=scan) as scandir:
            ops = native._linux_arm64_temp_file_read_ops()
            self.assertEqual(ops.open_table(18), 19)
            open_directory.assert_called_once_with('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                                                   dir_fd=18)
            with self.assertRaises(ValueError):
                ops.list_slots(19)
            scandir.assert_called_once_with(19)
            scan.__exit__.assert_called_once()
        with patch.object(native.os, 'uname', return_value=SimpleNamespace(sysname='Linux', machine='x86_64')), \
                patch.object(native.os, 'open') as open_directory:
            self.assertIsNone(native.prepare_fixture_temp_file_observer(PIN, HANDLES)(DIGEST))
            open_directory.assert_not_called()

    def test_coverage_must_bind_exact_probe_and_physical_pins_before_and_after(self):
        observed = Mock(return_value=('VACANT', 0))
        source = self.prepare_source(observed)
        for coverage in (
            None, self.coverage_for(PROBE)._replace(policy='REVOKED'),
            self.coverage_for(PROBE)._replace(probe=PROBE._replace()),
            self.coverage_for(PROBE)._replace(observation_digest=b'x' * 32),
        ):
            self.coverage.side_effect = None
            self.coverage.return_value = coverage
            self.assertIsNone(source.snapshot(PROBE))
        self.assertIsNone(source.snapshot(PROBE._replace(binding=RESOURCE._replace(instance_id='fixture-other'))))
        observed.assert_not_called()
        self.coverage.side_effect = [self.coverage_for(PROBE), None]
        self.assertIsNone(source.snapshot(PROBE))
        observed.assert_called_once_with(DIGEST)

    def test_enrollment_binds_read_only_proc_table_to_registered_process(self):
        verify, ops, _ = self.prepare_enrollment()
        self.assertFalse(verify(b'x' * 32, DIGEST))
        self.assertFalse(verify(ENROLLMENT, b'x' * 32))
        self.assertEqual(ops.mock_calls, [])
        self.assertTrue(verify(ENROLLMENT, DIGEST))
        self.assertEqual(ops.mock_calls, [
            call.duplicate(10), call.duplicate(8),
            call.describe(20), call.describe(18), call.read_stat(20), call.lookup_table(20),
            call.describe(20), call.describe(18), call.read_stat(20), call.lookup_table(20),
            call.close(18), call.close(20),
        ])

    def test_enrollment_rejects_bad_pins_without_reading(self):
        _, operations, ops = self.prepare_enrollment()
        for process, process_fd in (
            (PROCESS._replace(directory=TABLE), 10),
            (PROCESS._replace(directory=PROCESS.directory._replace(device=99)), 10),
            (PROCESS._replace(pid=True), 10),
            (PROCESS._replace(start_ticks=0), 10),
            (PROCESS, HANDLES.descriptor_table_fd),
            (PROCESS, False),
        ):
            with self.subTest(process=process, fd=process_fd), self.assertRaises(ValueError):
                native.prepare_fixture_temp_file_enrollment(PIN, HANDLES, process, process_fd, ops=ops)
        self.assertEqual(operations.mock_calls, [])

    def test_missing_malformed_reused_or_retired_process_holds_enrollment(self):
        verify, ops, _ = self.prepare_enrollment()
        for raw in (
            stat_record(pid=42), stat_record(started=988), stat_record(state=b'Z'),
            stat_record()[:-1], stat_record().replace(b' 987 ', b' 0987 '),
            stat_record().replace(b' 0 ', b' 0\t0 ', 1),
            b'41 (fixture) S 0 0 0\n',
            stat_record().replace(b'fixture', b'x' * native.MAX_PROC_STAT_BYTES),
            ABSENT,
        ):
            with self.subTest(record=repr(raw)[:100]):
                ops.read_stat.side_effect = [stat_record(), raw]
                self.assertFalse(verify(ENROLLMENT, DIGEST))

    def test_lookup_and_handle_drift_withhold_enrollment(self):
        verify, ops, _ = self.prepare_enrollment()
        for entry in ((TABLE._replace(inode=99), stat.S_IFDIR), (TABLE, stat.S_IFLNK), ABSENT):
            with self.subTest(entry=entry):
                ops.lookup_table.side_effect = [(TABLE, stat.S_IFDIR), entry]
                self.assertFalse(verify(ENROLLMENT, DIGEST))
        ops.lookup_table.side_effect = None
        ops.describe.side_effect = [
            self.table_facts._replace(pin=PROCESS.directory), self.table_facts,
            self.table_facts._replace(pin=PROCESS.directory, filesystem=0),
        ]
        self.assertFalse(verify(ENROLLMENT, DIGEST))

    def test_native_enrollment_reads_fixed_entries_with_bounded_proc_stat(self):
        stat_facts = self.table_facts._replace(mode=stat.S_IFREG)
        table_info = SimpleNamespace(st_dev=TABLE.device, st_ino=TABLE.inode, st_mode=stat.S_IFDIR)
        describe = Mock(return_value=stat_facts)
        with patch.object(native, '_linux_arm64_descriptor_reader', return_value=describe), \
                patch.object(native.os, 'open', return_value=21) as open_entry, \
                patch.object(native.os, 'read', return_value=stat_record()) as read_entry, \
                patch.object(native.os, 'close') as close, \
                patch.object(native.os, 'stat', return_value=table_info) as stat_entry:
            ops = native._linux_arm64_temp_file_enrollment_ops()
            self.assertEqual(ops.read_stat(20), stat_record())
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
            open_entry.assert_called_once_with('stat', flags, dir_fd=20)
            read_entry.assert_called_once_with(21, native.MAX_PROC_STAT_BYTES + 1)
            close.assert_called_once_with(21)
            self.assertEqual(ops.lookup_table(20), (TABLE, stat.S_IFDIR))
            stat_entry.assert_called_once_with('fd', dir_fd=20, follow_symlinks=False)
            describe.return_value = stat_facts._replace(filesystem=0)
            with self.assertRaises(ValueError):
                ops.read_stat(20)
            self.assertEqual(close.call_count, 2)
            self.assertEqual(read_entry.call_count, 1)
        with patch.object(native.os, 'uname', return_value=SimpleNamespace(sysname='Linux', machine='x86_64')), \
                patch.object(native.os, 'open') as open_entry:
            verify = native.prepare_fixture_temp_file_enrollment(PIN, HANDLES, PROCESS, 10)
            self.assertFalse(verify(ENROLLMENT, DIGEST))
            open_entry.assert_not_called()

    def test_every_reference_exclusion_is_required_before_enrollment_io(self):
        policy = Mock()
        verify = Mock(return_value=True)
        coverage = self.prepare_coverage(policy, verify)
        self.assertIsNone(coverage(PROBE._replace(binding=RESOURCE._replace(slot_id='fixture-other'))))
        policy.assert_not_called()
        for field in harness.FixtureTempFilePolicyReadback._fields[2:]:
            for value in (False, 1, None):
                with self.subTest(field=field, value=value):
                    policy.side_effect = lambda challenge: policy_report(challenge)._replace(**{field: value})
                    self.assertIsNone(coverage(PROBE))
        policy.side_effect = lambda challenge: policy_report(challenge)._replace(policy_generation='fixture-replaced')
        self.assertIsNone(coverage(PROBE))
        verify.assert_not_called()

    def test_coverage_rejects_policy_replay_and_inexact_enrollment(self):
        policy = Mock(side_effect=policy_report)
        verify = Mock(return_value=True)
        coverage = self.prepare_coverage(policy, verify)
        self.assertEqual(coverage(PROBE), self.coverage_for(PROBE))
        old = policy.call_args.args[0]
        policy.side_effect = lambda _: policy_report(old)
        self.assertIsNone(coverage(PROBE))
        verify.assert_called_once_with(ENROLLMENT, DIGEST)
        policy.side_effect = policy_report
        for value in (False, 1, None):
            verify.return_value = value
            self.assertIsNone(coverage(PROBE))

    def test_changed_enrollment_after_inventory_read_withholds_snapshot(self):
        verify, ops, _ = self.prepare_enrollment()
        policy = Mock(side_effect=policy_report)
        coverage = self.prepare_coverage(policy, verify)
        source = self.prepare_source(self.observe, coverage)
        self.calls.list_slots.return_value = ()
        ops.read_stat.side_effect = [stat_record(), stat_record(), stat_record(started=988)]
        self.assertIsNone(source.snapshot(PROBE))
        self.calls.list_slots.assert_called_once_with(19)
        self.assertEqual(policy.call_count, 2)

    def test_kernel_filter_status_uses_fixed_bounded_status_and_exact_process(self):
        _, calls, ops = self.prepare_enrollment()
        calls.read_status.return_value = FILTER_STATUS
        read = native.prepare_fixture_temp_file_status_reader(PIN, PROCESS, 10, ops=ops)
        self.assertIsNone(read(b'x' * 32))
        self.assertEqual(calls.mock_calls, [])
        self.assertEqual(read(ENROLLMENT), FILTER_STATUS)
        self.assertEqual(calls.mock_calls, [
            call.duplicate(10), call.describe(20), call.read_stat(20), call.read_status(20),
            call.read_stat(20), call.describe(20), call.close(20),
        ])
        calls.read_stat.side_effect = [stat_record(), stat_record(started=988)]
        self.assertIsNone(read(ENROLLMENT))
        calls.read_stat.side_effect = None
        calls.read_status.return_value = b'x' * (native.MAX_PROC_STATUS_BYTES + 1)
        self.assertIsNone(read(ENROLLMENT))

        describe = Mock(return_value=self.table_facts._replace(mode=stat.S_IFREG))
        with patch.object(native, '_linux_arm64_descriptor_reader', return_value=describe), \
                patch.object(native.os, 'open', return_value=21) as open_entry, \
                patch.object(native.os, 'read', return_value=FILTER_STATUS) as read_entry, \
                patch.object(native.os, 'close') as close:
            native_ops = native._linux_arm64_temp_file_enrollment_ops()
            self.assertEqual(native_ops.read_status(20), FILTER_STATUS)
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
            open_entry.assert_called_once_with('status', flags, dir_fd=20)
            read_entry.assert_called_once_with(21, native.MAX_PROC_STATUS_BYTES + 1)
            close.assert_called_once_with(21)

    def test_filter_policy_requires_exact_installation_provenance(self):
        boundary = Mock(side_effect=boundary_report)
        status = Mock(return_value=FILTER_STATUS)
        for changes in (
            {'program_digest': b'x' * 32}, {'enrollment_digest': b'x' * 32}, {'policy_generation': 'fixture-other'},
            {'pid': True}, {'prior_filters': 1}, {'prior_filters': False}, {'exclusive_bootstrap': False},
            {'installed': 1},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.prepare_filter_policy(FILTER_RECEIPT._replace(**changes), boundary, status)
        status.assert_not_called()
        boundary.assert_not_called()

    def test_filter_policy_rejects_missing_duplicate_or_wrong_kernel_status(self):
        boundary = Mock(side_effect=boundary_report)
        status = Mock()
        policy = self.prepare_filter_policy(FILTER_RECEIPT, boundary, status)
        challenge = harness.FixtureTempFilePolicyChallenge(PROBE, ENROLLMENT)
        for wrong in (
            None, FILTER_STATUS[:-1], FILTER_STATUS + b'Seccomp:\t2\n',
            FILTER_STATUS.replace(b'Tgid:\t41', b'Tgid:\t42'),
            FILTER_STATUS.replace(b'Pid:\t41', b'Pid:\t42'),
            FILTER_STATUS.replace(b'TracerPid:\t0', b'TracerPid:\t7'),
            FILTER_STATUS.replace(b'Threads:\t1', b'Threads:\t2'),
            FILTER_STATUS.replace(b'NoNewPrivs:\t1', b'NoNewPrivs:\t0'),
            FILTER_STATUS.replace(b'Seccomp:\t2', b'Seccomp:\t0'),
            FILTER_STATUS.replace(b'Seccomp_filters:\t1\n', b''),
            FILTER_STATUS.replace(b'Seccomp_filters:\t1', b'Seccomp_filters:\t2'),
            FILTER_STATUS + b'Overflow:' + b'x' * harness.MAX_REFERENCE_STATUS_BYTES,
        ):
            with self.subTest(status=repr(wrong)[:110]):
                status.return_value = wrong
                self.assertIsNone(policy(challenge))
        status.return_value = FILTER_STATUS
        self.assertEqual(policy(challenge), policy_report(challenge))

    def test_filter_policy_withholds_coverage_on_boundary_replay_or_drift(self):
        boundary = Mock(side_effect=boundary_report)
        status = Mock(return_value=FILTER_STATUS)
        policy = self.prepare_filter_policy(FILTER_RECEIPT, boundary, status)
        challenge = harness.FixtureTempFilePolicyChallenge(PROBE, ENROLLMENT)
        self.assertIsNone(policy(challenge._replace(enrollment_digest=b'x' * 32)))
        for change in ({'external_references_excluded': False}, {'close_path_quiesced': False},
                       {'close_path_quiesced': 1}):
            boundary.side_effect = lambda request: boundary_report(request)._replace(**change)
            self.assertIsNone(policy(challenge))
        status.assert_not_called()
        before = None

        def replay(request):
            nonlocal before
            if before is None:
                before = boundary_report(request)
            return before

        boundary.side_effect = replay
        self.assertIsNone(policy(challenge))
        status.assert_called_once_with(ENROLLMENT)
        boundary.side_effect = lambda request: boundary_report(request)._replace(
            fence=harness.FixtureCleanupFenceReadback(request.probe.scope._replace(fence_ns=101), 'REVOKED_QUIESCED'),
        )
        self.assertIsNone(policy(challenge))

    def test_registry_keeps_cleanup_pending_until_final_descriptor_closes(self):
        verify, calls, ops = self.prepare_enrollment()
        calls.read_status.return_value = FILTER_STATUS
        read_status = native.prepare_fixture_temp_file_status_reader(PIN, PROCESS, 10, ops=ops)
        policy = self.prepare_filter_policy(FILTER_RECEIPT, boundary_report, read_status)
        temp = self.prepare_source(self.observe, self.prepare_coverage(policy, verify))
        sources = tuple(
            temp if kind == temp.kind else harness.FixtureResourceInventorySource(
                kind, f'fixture-mock-reader-{index}', f'fixture-mock-owner-{index}', Mock(return_value=None),
            )
            for index, kind in enumerate(harness.FixtureNonProcessResources._fields)
        )
        readers = harness.prepare_fixture_resource_absence_readers(
            PLAN, TEMPLATE.cgroup_digest, TEMPLATE.resource_generation, sources,
        )
        registry = harness.prepare_fixture_cleanup_registry(
            PLAN, TEMPLATE.cgroup_digest, TEMPLATE.resource_generation, self.clock, readers,
        )
        ticket = registry.owner.reserve_writer('temporary_files')
        self.assertTrue(registry.owner.finish_writer(ticket, RESOURCE))
        force = Mock()
        watchdog = harness.FixtureCanaryWatchdog(
            PLAN, harness.FixtureWatchdogPorts(lambda _: registry.owner.revoke_at(100), force),
        )
        self.assertEqual(watchdog.stop(BINDING, 100)['watchdogState'], 'STOPPING')
        fence = registry.observer.read_fence()
        ports = harness.FixtureCleanupCollectorPorts(
            self.clock, registry.observer.read_fence, Mock(return_value=False), registry.observer.read_resources,
        )
        for slots in (('3', '4'), ('4',), ()):
            self.calls.list_slots.return_value = slots
            self.assertIs(registry.owner.verify_absent(fence, ticket), not slots)
            inventory = harness.collect_fixture_cleanup_inventory(fence.scope, ports)
            self.assertEqual(inventory.resources.temporary_files, int(bool(slots)))
            report = watchdog.poll(100, inventory=inventory)
            self.assertEqual(report['watchdogState'], 'STOPPING' if slots else 'STOPPED')
            self.assertEqual(report['watchdogCleanup'], 'UNCERTAIN' if slots else 'VERIFIED')
            self.assertEqual(report['status'], 'HOLD')
            self.assertIs(report['liveLaunchPermitted'], False)
            self.assertEqual(report['qualifyingBuilderReceiptsAdded'], 0)
        force.assert_not_called()


if __name__ == '__main__':
    unittest.main()
