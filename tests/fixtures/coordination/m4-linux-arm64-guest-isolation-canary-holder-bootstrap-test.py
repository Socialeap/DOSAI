"""Offline holder bootstrap and installation receipt checks."""

import importlib.util
import os
from pathlib import Path
import re
import select
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch


TOOLS = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot'
SOURCE = TOOLS / 'm4-linux-arm64-guest-isolation-canary-harness.py'
spec = importlib.util.spec_from_file_location('canary_harness', SOURCE)
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)
NATIVE_SOURCE = TOOLS / 'm4-linux-arm64-guest-isolation-canary-watchdog-terminator.py'
native_spec = importlib.util.spec_from_file_location('canary_native', NATIVE_SOURCE)
native = importlib.util.module_from_spec(native_spec)
native_spec.loader.exec_module(native)

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
PINS = harness.FixtureTempFileBootstrapPins((11, 21), (11, 22), (12, 23), (12, 24))
REGISTRATION = harness.FixtureTempFileBootstrapRegistration(
    TEMPLATE, RESOURCE, b'd' * 32, b'e' * 32, 'fixture-policy', b'f' * 32, b'g' * 32, 41, PINS, 275,
)
FRAME = b'DOSAITF1' + REGISTRATION.nonce + b''.join(
    number.to_bytes(8, 'little') for number in (41, 11, 21, 11, 22, 12, 23, 12, 24)
)
STATUS = (
    b'Name:\tfixture\nPid:\t41\nTgid:\t41\nTracerPid:\t0\nThreads:\t1\n'
    b'NoNewPrivs:\t1\nSeccomp:\t2\nSeccomp_filters:\t1\n'
)


def launch_record(challenge):
    return harness.FixtureTempFileLaunchReadback(
        challenge, REGISTRATION.executable_digest, harness.TEMP_REFERENCE_FILTER_DIGEST, 0, True,
    )


def setup_record(challenge):
    return harness.FixtureTempFileSetupReadback(challenge, PINS.setup, FRAME, True)


class HolderBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.calls = Mock()
        self.calls.monotonic_ns.side_effect = [100, 101]
        self.calls.read_launch.side_effect = launch_record
        self.calls.read_setup.side_effect = setup_record
        self.calls.verify_enrollment.return_value = True
        self.calls.read_status.return_value = STATUS
        self.calls.observe_file.return_value = ('PRESENT', 1)
        self.ports = harness.FixtureTempFileBootstrapPorts(*(
            getattr(self.calls, name) for name in harness.FixtureTempFileBootstrapPorts._fields
        ))

    def test_native_source_orders_exclusive_creation_frame_filter_and_eof(self):
        source = (TOOLS / 'm4-linux-arm64-guest-isolation-canary-holder-bootstrap.c').read_text()
        self.assertEqual(len(FRAME), 112)
        self.assertEqual(harness.TEMP_HOLDER_SETUP_FRAME.size, 112)
        self.assertIn('sizeof(struct holder_setup_frame) == 112', source)
        self.assertIn('filesystem.f_type == PIPEFS_MAGIC', source)
        self.assertIn('O_RDONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600', source)
        self.assertIn('file.st_nlink != 1', source)
        self.assertNotRegex(source, r'\bmain\s*\(')
        sequence = (
            'SYS_close_range, 6U, UINT_MAX, CLOSE_RANGE_UNSHARE', 'openat(DIRECTORY_FD, "fixture-canary.tmp"',
            'write(SETUP_FD, &frame, sizeof(frame))', 'dosai_install_temp_file_reference_filter();',
            'holder_call(SYS_close, SETUP_FD', 'holder_call(SYS_read, CONTROL_FD',
            'holder_call(SYS_close, FILE_FD',
        )
        indices = [source.index(fragment) for fragment in sequence]
        self.assertEqual(indices, sorted(indices))
        after_filter = source.split('dosai_install_temp_file_reference_filter();', 1)[1]
        self.assertEqual(
            re.findall(r'holder_call\(SYS_([a-z_]+)', after_filter), ['close', 'read', 'close', 'read'],
        )
        self.assertNotRegex(after_filter, r'\b(?:write|openat|syscall|unlink)\s*\(')

    def test_registration_fails_before_io_for_scope_alias_and_invalid_pins(self):
        for changes in (
            {'nonce': bytearray(REGISTRATION.nonce)}, {'executable_digest': b''}, {'pid': True},
            {'deadline_ns': PLAN.binding.deadline_ns + 1},
            {'binding': RESOURCE._replace(kind='sockets')},
            {'pins': PINS._replace(control=PINS.setup)}, {'pins': PINS._replace(file=(20, 22))},
            {'pins': PINS._replace(file=(11, True))},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION._replace(**changes), self.ports)
        self.assertEqual(self.calls.mock_calls, [])

    def test_exact_frame_and_installed_process_issue_one_receipt(self):
        issue = harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, self.ports)
        self.assertEqual(self.calls.mock_calls, [])
        receipt = issue()
        self.assertEqual(receipt, harness.FixtureTempFileFilterReceipt(
            REGISTRATION.enrollment_digest, REGISTRATION.policy_generation, harness.TEMP_REFERENCE_FILTER_DIGEST,
            REGISTRATION.pid, 0, True, True,
        ))
        self.assertEqual([name for name, _, _ in self.calls.mock_calls], [
            'monotonic_ns', 'read_launch', 'read_setup', 'verify_enrollment', 'read_status', 'observe_file',
            'verify_enrollment', 'read_launch', 'monotonic_ns',
        ])
        self.assertEqual(self.calls.verify_enrollment.call_args_list, [
            call(REGISTRATION.enrollment_digest, REGISTRATION.observation_digest),
            call(REGISTRATION.enrollment_digest, REGISTRATION.observation_digest),
        ])
        self.assertIsNone(issue())
        self.assertEqual(self.calls.read_setup.call_count, 1)

        def read_boundary(challenge):
            fence = harness.FixtureCleanupFenceReadback(challenge.probe.scope, 'REVOKED_QUIESCED')
            return harness.FixtureTempFileBoundaryReadback(challenge, fence, True, True)

        policy = harness.prepare_fixture_temp_file_filter_policy(
            TEMPLATE, RESOURCE, REGISTRATION.observation_digest, REGISTRATION.enrollment_digest,
            REGISTRATION.policy_generation, receipt, read_boundary, lambda _: STATUS,
        )
        probe = harness.FixtureResourceProbe(TEMPLATE._replace(fence_ns=100), RESOURCE)
        report = policy(harness.FixtureTempFilePolicyChallenge(probe, REGISTRATION.enrollment_digest))
        self.assertTrue(report.kernel_holds_excluded)

    def test_unverified_eof_and_malformed_or_replayed_frames_do_not_reach_kernel_confirmation(self):
        for changes in (
            {'eof': False}, {'eof': 1}, {'pipe_pin': PINS.control}, {'frame': FRAME[:-1]},
            {'frame': FRAME + b'x'}, {'frame': bytearray(FRAME)}, {'frame': b'XS' + FRAME[2:]},
            {'frame': FRAME[:8] + b'x' * 32 + FRAME[40:]},
            {'frame': FRAME[:40] + (42).to_bytes(8, 'little') + FRAME[48:]},
            {'frame': FRAME[:64] + b'\x00' * 16 + FRAME[80:]},
            {'challenge': harness.FixtureTempFileBootstrapChallenge(REGISTRATION)},
        ):
            with self.subTest(changes=repr(changes)[:120]):
                self.calls.monotonic_ns.side_effect = [100, 101]
                self.calls.read_setup.side_effect = lambda challenge: setup_record(challenge)._replace(**changes)
                self.assertIsNone(harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, self.ports)())
        self.calls.verify_enrollment.assert_not_called()
        self.calls.read_status.assert_not_called()

    def test_eof_after_early_exit_or_inactive_filter_does_not_issue_receipt(self):
        for raw in (None, STATUS.replace(b'Seccomp:\t2', b'Seccomp:\t0'),
                    STATUS.replace(b'Seccomp_filters:\t1', b'Seccomp_filters:\t2'),
                    STATUS.replace(b'Pid:\t41', b'Pid:\t42')):
            with self.subTest(status=raw):
                self.calls.monotonic_ns.side_effect = [100, 101]
                self.calls.read_status.return_value = raw
                self.assertIsNone(harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, self.ports)())
        self.calls.observe_file.assert_not_called()

    def test_reference_state_launch_provenance_and_closeout_are_all_required(self):
        for file in (None, ('PRESENT', True), ('PRESENT', 2), ('VACANT', 0), ('REPLACED', 1)):
            with self.subTest(file=file):
                self.calls.monotonic_ns.side_effect = [100, 101]
                self.calls.observe_file.return_value = file
                self.assertIsNone(harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, self.ports)())
        self.calls.observe_file.return_value = ('PRESENT', 1)
        for changes in (
            {'executable_digest': b'x' * 32}, {'program_digest': b'x' * 32},
            {'prior_filters': 1}, {'prior_filters': False}, {'exclusive_bootstrap': False},
            {'challenge': harness.FixtureTempFileBootstrapChallenge(REGISTRATION)},
        ):
            with self.subTest(changes=changes):
                self.calls.monotonic_ns.side_effect = [100, 101]
                self.calls.read_launch.side_effect = lambda challenge: launch_record(challenge)._replace(**changes)
                self.assertIsNone(harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, self.ports)())
        self.calls.read_launch.side_effect = launch_record
        self.calls.verify_enrollment.side_effect = [True, False]
        self.calls.monotonic_ns.side_effect = [100, 101]
        self.assertIsNone(harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, self.ports)())

    def test_late_unavailable_or_backwards_evidence_is_consumed_without_receipt(self):
        for ticks in ([True], [REGISTRATION.deadline_ns], [100, 99], [100, REGISTRATION.deadline_ns]):
            with self.subTest(ticks=ticks):
                self.calls.monotonic_ns.side_effect = ticks
                issue = harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, self.ports)
                self.assertIsNone(issue())
                calls = list(self.calls.mock_calls)
                self.assertIsNone(issue())
                self.assertEqual(self.calls.mock_calls, calls)
        self.calls.monotonic_ns.side_effect = [100, 101]
        self.calls.read_setup.side_effect = OSError('unavailable')
        self.assertIsNone(harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, self.ports)())


class HolderSetupPipeTests(unittest.TestCase):
    def setUp(self):
        self.calls = Mock()
        self.pin = native.FixtureHandlePin(*PINS.setup)
        self.facts = native.DescriptorFacts(
            self.pin, stat.S_IFIFO, native.PIPEFS_MAGIC, False, os.O_RDONLY | os.O_NONBLOCK,
        )
        self.calls.duplicate.return_value = 17
        self.calls.describe.return_value = self.facts
        self.calls.poll.return_value = select.POLLIN | select.POLLHUP
        self.calls.read.side_effect = [FRAME, b'']
        self.ops = native.TempFileSetupPipeOps(*(
            getattr(self.calls, name) for name in native.TempFileSetupPipeOps._fields
        ))
        self.clock = Mock(return_value=100)

    def capture(self):
        return native.prepare_fixture_temp_file_setup_pipe_capture(self.pin, 7, REGISTRATION.nonce, ops=self.ops)

    def test_registration_and_wrong_scope_perform_no_io(self):
        for pin, fd, nonce in ((self.pin, 2, REGISTRATION.nonce), (self.pin, 7, bytearray(REGISTRATION.nonce)),
                               (self.pin._replace(inode=0), 7, REGISTRATION.nonce)):
            with self.subTest(pin=pin, fd=fd), self.assertRaises(ValueError):
                native.prepare_fixture_temp_file_setup_pipe_capture(pin, fd, nonce, ops=self.ops)
        capture = self.capture()
        self.assertEqual(capture(b'x' * 32, PINS.setup), ('REJECTED', None))
        self.assertEqual(capture(REGISTRATION.nonce, PINS.control), ('REJECTED', None))
        self.assertEqual(self.calls.mock_calls, [])

    def test_only_the_pinned_nonblocking_anonymous_read_end_is_polled(self):
        for facts in (
            self.facts._replace(pin=self.pin._replace(inode=99)), self.facts._replace(mode=stat.S_IFSOCK),
            self.facts._replace(filesystem=0), self.facts._replace(inheritable=True),
            self.facts._replace(flags=os.O_RDONLY), self.facts._replace(flags=os.O_WRONLY | os.O_NONBLOCK),
            self.facts._replace(flags=os.O_RDWR | os.O_NONBLOCK),
        ):
            with self.subTest(facts=facts):
                self.calls.describe.return_value = facts
                self.assertEqual(self.capture()(REGISTRATION.nonce, PINS.setup), ('REJECTED', None))
        self.calls.poll.assert_not_called()
        self.calls.read.assert_not_called()

    def test_buffered_data_waits_for_hangup_and_eof_is_read_once(self):
        capture = self.capture()
        self.calls.poll.side_effect = [0, select.POLLIN, select.POLLIN | select.POLLHUP]
        for _ in range(2):
            self.assertEqual(capture(REGISTRATION.nonce, PINS.setup), ('PENDING', None))
        self.calls.read.assert_not_called()
        self.assertEqual(capture(REGISTRATION.nonce, PINS.setup), ('READY', FRAME))
        self.assertEqual(self.calls.read.call_args_list, [call(17, 113), call(17, 1)])
        self.assertEqual(capture(REGISTRATION.nonce, PINS.setup), ('REJECTED', None))
        self.assertEqual(self.calls.close.call_args_list, [call(17)] * 3)

    def test_poll_errors_and_partial_extra_or_unterminated_streams_fail_closed(self):
        for event in (select.POLLERR | select.POLLHUP, select.POLLNVAL, -1, True):
            with self.subTest(event=event):
                self.calls.poll.return_value = event
                self.assertEqual(self.capture()(REGISTRATION.nonce, PINS.setup), ('REJECTED', None))
        self.calls.read.assert_not_called()
        self.calls.poll.return_value = select.POLLHUP
        for parts in (
            [b''], [FRAME[:-1], b''], [FRAME + b'x'], [FRAME, b'x'],
            [FRAME, BlockingIOError('writer open')], [FRAME, InterruptedError('interrupted')],
            [bytearray(FRAME)], [FRAME[:8] + b'x' * 32 + FRAME[40:], b''],
        ):
            with self.subTest(parts=repr(parts)[:90]):
                self.calls.read.side_effect = parts
                capture = self.capture()
                self.assertEqual(capture(REGISTRATION.nonce, PINS.setup), ('REJECTED', None))
                observed = self.calls.read.call_count
                self.assertEqual(capture(REGISTRATION.nonce, PINS.setup), ('REJECTED', None))
                self.assertEqual(self.calls.read.call_count, observed)

    def test_fragmentation_is_bounded_and_pipe_identity_is_rechecked(self):
        self.calls.read.side_effect = [bytes((byte,)) for byte in FRAME] + [b'']
        self.assertEqual(self.capture()(REGISTRATION.nonce, PINS.setup), ('READY', FRAME))
        self.assertEqual(self.calls.read.call_count, 113)
        self.assertEqual(self.calls.read.call_args_list[0], call(17, 113))
        self.assertEqual(self.calls.read.call_args_list[-1], call(17, 1))
        self.calls.describe.side_effect = [self.facts, self.facts._replace(flags=os.O_RDONLY)]
        self.calls.read.side_effect = [FRAME, b'']
        self.assertEqual(self.capture()(REGISTRATION.nonce, PINS.setup), ('REJECTED', None))
        self.calls.describe.side_effect = None
        self.calls.close.side_effect = OSError('unavailable')
        self.calls.read.side_effect = [FRAME, b'']
        self.assertEqual(self.capture()(REGISTRATION.nonce, PINS.setup), ('REJECTED', None))

    def test_native_poll_uses_zero_timeout_and_rejects_another_descriptor(self):
        poller = Mock()
        poller.poll.return_value = [(17, select.POLLIN | select.POLLHUP)]
        with patch.object(native, '_linux_arm64_descriptor_reader', return_value=Mock()), \
                patch.object(native.select, 'poll', return_value=poller):
            ops = native._linux_arm64_temp_file_setup_pipe_ops()
            self.assertEqual(ops.poll(17), select.POLLIN | select.POLLHUP)
            poller.register.assert_called_once_with(17, select.POLLIN)
            poller.poll.assert_called_once_with(0)
            poller.poll.return_value = [(18, select.POLLHUP)]
            with self.assertRaises(ValueError):
                ops.poll(17)
        with patch.object(native.os, 'uname', return_value=SimpleNamespace(sysname='Linux', machine='x86_64')), \
                patch.object(native.os, 'dup') as duplicate:
            capture = native.prepare_fixture_temp_file_setup_pipe_capture(self.pin, 7, REGISTRATION.nonce)
            self.assertEqual(capture(REGISTRATION.nonce, PINS.setup), ('REJECTED', None))
            duplicate.assert_not_called()

    def test_ready_frame_is_delivered_only_to_exact_issuer_once(self):
        self.calls.poll.side_effect = [select.POLLIN, select.POLLIN | select.POLLHUP]
        reader = harness.prepare_fixture_temp_file_setup_reader(REGISTRATION, self.clock, self.capture())
        challenge = harness.FixtureTempFileBootstrapChallenge(REGISTRATION)
        self.assertEqual(reader.poll(), 'PENDING')
        self.assertIsNone(reader.read_setup(challenge))
        self.calls.read.assert_not_called()
        self.assertEqual(reader.poll(), 'READY')
        self.assertIsNone(reader.read_setup(challenge._replace(registration=REGISTRATION._replace())))
        ports = harness.FixtureTempFileBootstrapPorts(
            self.clock, launch_record, reader.read_setup, Mock(return_value=True),
            Mock(return_value=STATUS), Mock(return_value=('PRESENT', 1)),
        )
        receipt = harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, ports)()
        self.assertTrue(receipt.installed)
        self.assertEqual(reader.poll(), 'CONSUMED')
        self.assertIsNone(reader.read_setup(challenge))
        self.assertEqual(self.calls.poll.call_args_list, [call(17), call(17)])

    def test_bad_frame_timeout_and_clock_rollback_never_release_readback(self):
        challenge = harness.FixtureTempFileBootstrapChallenge(REGISTRATION)
        for result, ticks in (
            (('READY', FRAME[:40] + (42).to_bytes(8, 'little') + FRAME[48:]), [100, 101]),
            (('PENDING', FRAME), [100, 101]), (('READY', FRAME), [100, 99]),
            (('READY', FRAME), [100, REGISTRATION.deadline_ns]), (None, [100, 101]),
        ):
            with self.subTest(result=repr(result)[:90], ticks=ticks):
                reader = harness.prepare_fixture_temp_file_setup_reader(
                    REGISTRATION, Mock(side_effect=ticks), Mock(return_value=result),
                )
                self.assertEqual(reader.poll(), 'REJECTED')
                self.assertIsNone(reader.read_setup(challenge))
        reader = harness.prepare_fixture_temp_file_setup_reader(REGISTRATION, self.clock, self.capture())
        self.assertEqual(reader.poll(), 'READY')
        self.clock.return_value = REGISTRATION.deadline_ns
        self.assertIsNone(reader.read_setup(challenge))
        self.assertEqual(reader.poll(), 'REJECTED')


if __name__ == '__main__':
    unittest.main()
