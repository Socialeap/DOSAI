"""Offline timer, termination framing, and watchdog integration tests."""

import ctypes
import errno
import importlib.util
import os
from pathlib import Path
import socket
import struct
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch


TOOLS = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot'
PREFIX = 'm4-linux-arm64-guest-isolation-canary-'


def load_source(suffix):
    spec = importlib.util.spec_from_file_location(suffix, TOOLS / (PREFIX + suffix + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


harness = load_source('harness')
with (patch.object(ctypes, 'CDLL', side_effect=AssertionError('Native library used at import')),
      patch.object(os, 'uname', side_effect=AssertionError('Platform sampled at import')),
      patch.object(socket, 'socket', side_effect=AssertionError('Socket opened at import'))):
    transport = load_source('watchdog-transport')

LINUX = SimpleNamespace(sysname='Linux', machine='aarch64')
REQUEST = harness.CanaryRequest('HOST_FILE_READ', 'CONTROL_BEFORE', 1, 'a' * 64, 'fixture-control')
BINDING = harness.FixtureAttemptBinding(REQUEST, 'fixture-supervisor', 'b' * 64, 300)
PLAN = harness.FixtureWatchdogPlan(
    'SYNTHETIC_ONLY', BINDING, 'fixture-capsule', 'fixture-watchdog', 'fixture-verifier', 600_000_000,
)
DIGEST = harness.fixture_watchdog_binding_digest(PLAN)
SESSION = transport.FixtureTerminationSession('SYNTHETIC_ONLY', b'n' * 16, DIGEST)
KEY = b'k' * 32
GRACE = 250_000_000
FRAME_BYTES = 98


class LinuxTimerTests(unittest.TestCase):
    def setUp(self):
        self.libc = SimpleNamespace(timerfd_create=Mock(return_value=31), timerfd_settime=Mock(return_value=0))

    def open_timer(self):
        with (patch.object(os, 'uname', return_value=LINUX),
              patch.object(ctypes, 'CDLL', return_value=self.libc) as library):
            timer = transport.LinuxArm64WatchdogTimer()
        library.assert_called_once_with(None, use_errno=True)
        return timer

    def test_linux_arm64_is_required_before_binding_any_native_symbol(self):
        with (patch.object(os, 'uname', return_value=SimpleNamespace(sysname='Linux', machine='x86_64')),
              patch.object(ctypes, 'CDLL') as library):
            with self.assertRaisesRegex(OSError, '^Linux ARM64 is required'):
                transport.LinuxArm64WatchdogTimer()
        library.assert_not_called()

    def test_timer_is_nonblocking_cloexec_monotonic_and_one_shot_absolute(self):
        timer = self.open_timer()
        self.libc.timerfd_create.assert_called_once_with(time.CLOCK_MONOTONIC, os.O_NONBLOCK | os.O_CLOEXEC)
        self.assertEqual(timer.fileno(), 31)
        timer.arm(4_000_000_123)
        fd, flags, spec, old = self.libc.timerfd_settime.call_args.args
        self.assertEqual((fd, flags, old), (31, 1, None))
        self.assertEqual((spec._obj.value.seconds, spec._obj.value.nanoseconds), (4, 123))
        self.assertEqual((spec._obj.interval.seconds, spec._obj.interval.nanoseconds), (0, 0))
        timer.arm(None)
        disarmed = self.libc.timerfd_settime.call_args.args[2]._obj
        self.assertEqual((disarmed.value.seconds, disarmed.value.nanoseconds), (0, 0))
        with patch.object(os, 'close') as close:
            timer.close()
            timer.close()
        close.assert_called_once_with(31)
        with self.assertRaises(ValueError):
            timer.fileno()

    def test_deadlines_reject_zero_bool_and_out_of_range_before_any_syscall(self):
        timer = self.open_timer()
        for deadline in (0, True, -1, 2**64):
            with self.assertRaises(ValueError):
                timer.arm(deadline)
        self.libc.timerfd_settime.assert_not_called()

    def test_expiration_requires_one_native_endian_count_and_ignores_eagain(self):
        timer = self.open_timer()
        timer.arm(300)
        with patch.object(os, 'read', side_effect=[
            BlockingIOError(errno.EAGAIN, 'fixture-private'), struct.pack('=Q', 1), struct.pack('=Q', 1),
        ]) as read:
            self.assertFalse(timer.consume())
            self.assertTrue(timer.consume())
            with self.assertRaises(ValueError):
                timer.consume()
        self.assertEqual(read.call_args_list, [call(31, 8)] * 3)
        for data in (b'', b'1234567', struct.pack('=Q', 0), struct.pack('=Q', 2)):
            timer.arm(300)
            with patch.object(os, 'read', return_value=data):
                with self.assertRaises(ValueError):
                    timer.consume()

    def test_native_arm_error_is_reported_without_assuming_a_timer(self):
        timer = self.open_timer()
        self.libc.timerfd_settime.return_value = -1
        with patch.object(ctypes, 'get_errno', return_value=errno.EINVAL):
            with self.assertRaisesRegex(OSError, 'Watchdog timer could not be armed'):
                timer.arm(300)


def lane(fd):
    endpoint = Mock()
    endpoint.family = socket.AF_UNIX
    endpoint.getsockopt.return_value = socket.SOCK_SEQPACKET
    endpoint.get_inheritable.return_value = False
    endpoint.getpeername.return_value = ''
    endpoint.fileno.return_value = fd
    endpoint.send.side_effect = lambda data, flags: len(data)
    endpoint.recvmsg.side_effect = BlockingIOError(errno.EAGAIN, 'fixture-private')
    return endpoint


class TerminationTransportTests(unittest.TestCase):
    def setUp(self):
        self.grace = lane(41)
        self.force = lane(42)
        self.metadata = {fd: SimpleNamespace(st_dev=7, st_ino=fd + 10) for fd in (41, 42, 43, 44)}
        uname = patch.object(os, 'uname', return_value=LINUX)
        fstat = patch.object(os, 'fstat', side_effect=lambda fd: self.metadata[fd])
        socket_open = patch.object(socket, 'socket', side_effect=AssertionError('Unexpected socket construction'))
        for patcher in (uname, fstat, socket_open):
            patcher.start()
            self.addCleanup(patcher.stop)

    def channel(self, session=SESSION, key=KEY, endpoints=None, *, role='WATCHDOG'):
        return transport.LinuxArm64TerminationTransport(
            session, key, *(endpoints if endpoints is not None else (self.grace, self.force)), role=role,
        )

    @staticmethod
    def queue(endpoint, frame, ancillary=None, flags=0):
        endpoint.recvmsg.side_effect = None
        endpoint.recvmsg.return_value = frame, [] if ancillary is None else ancillary, flags, ''

    def test_only_distinct_connected_noninheritable_unix_seqpacket_lanes_are_admitted(self):
        self.assertIsNotNone(self.channel())
        self.grace.getsockopt.assert_called_with(socket.SOL_SOCKET, socket.SO_TYPE)
        for invalid in (
            SESSION._replace(origin='LIVE'), SESSION._replace(nonce=b'short'),
            SESSION._replace(binding_digest='b' * 64),
        ):
            with self.assertRaises(ValueError):
                self.channel(invalid)
        for mode in (socket.SOCK_STREAM, socket.SOCK_DGRAM):
            self.force.getsockopt.return_value = mode
            with self.assertRaises(ValueError):
                self.channel()
        self.force.getsockopt.return_value = socket.SOCK_SEQPACKET
        self.force.get_inheritable.return_value = True
        with self.assertRaises(ValueError):
            self.channel()
        self.force.get_inheritable.return_value = False
        self.metadata[42] = self.metadata[41]
        with self.assertRaises(ValueError):
            self.channel()
        self.grace.send.assert_not_called()
        self.force.send.assert_not_called()

    def test_binding_validation_and_nonblocking_one_shot_send(self):
        channel = self.channel()
        for mode, digest in (('RUN', DIGEST), ('GRACEFUL', b'x' * 32), ('FORCE', b'z')):
            with self.assertRaises(ValueError):
                channel.send(mode, digest)
        self.grace.send.assert_not_called()
        self.force.send.assert_not_called()
        channel.send('GRACEFUL', DIGEST)
        frame, flags = self.grace.send.call_args.args
        self.assertEqual(len(frame), FRAME_BYTES)
        self.assertEqual(flags, socket.MSG_DONTWAIT | socket.MSG_NOSIGNAL)
        with self.assertRaises(ValueError):
            channel.send('GRACEFUL', DIGEST)
        self.grace.send.assert_called_once()

    def test_replaced_endpoint_consumes_failed_send_and_force_remains_available(self):
        channel = self.channel()
        self.metadata[41] = SimpleNamespace(st_dev=7, st_ino=999)
        with self.assertRaisesRegex(OSError, 'delivery uncertain'):
            channel.send('GRACEFUL', DIGEST)
        self.grace.send.assert_not_called()
        with self.assertRaises(ValueError):
            channel.send('GRACEFUL', DIGEST)
        channel.send('FORCE', DIGEST)
        self.force.send.assert_called_once()

    def test_force_can_preempt_graceful_without_downgrade(self):
        sender = self.channel()
        sender.send('FORCE', DIGEST)
        with self.assertRaises(ValueError):
            sender.send('GRACEFUL', DIGEST)
        with self.assertRaises(ValueError):
            sender.send('FORCE', DIGEST)
        self.grace.send.assert_not_called()

        grace_rx, force_rx = lane(43), lane(44)
        self.queue(force_rx, self.force.send.call_args.args[0])
        self.queue(grace_rx, b'x' * FRAME_BYTES)
        receiver = self.channel(endpoints=(grace_rx, force_rx), role='TERMINATOR')
        self.assertEqual(receiver.receive_priority(), ('FORCE', 'ACCEPTED'))
        self.assertIsNone(receiver.receive_priority())
        force_rx.recvmsg.assert_called_once_with(FRAME_BYTES, 0, socket.MSG_DONTWAIT)
        grace_rx.recvmsg.assert_not_called()

    def test_tampered_truncated_ancillary_or_stale_packet_closes_only_its_lane(self):
        for transform, ancillary, flags in (
            (lambda frame: frame[:-1] + bytes([frame[-1] ^ 1]), [], 0),
            (lambda frame: frame[:-1], [], 0),
            (lambda frame: frame, [], socket.MSG_TRUNC),
            (lambda frame: frame, [], socket.MSG_CTRUNC),
            (lambda frame: frame, [(socket.SOL_SOCKET, socket.SCM_RIGHTS, b'')], 0),
            (lambda _: b'', [], 0),
        ):
            sender = self.channel()
            sender.send('GRACEFUL', DIGEST)
            sender.send('FORCE', DIGEST)
            grace_rx, force_rx = lane(43), lane(44)
            self.queue(grace_rx, transform(self.grace.send.call_args.args[0]), ancillary, flags)
            receiver = self.channel(endpoints=(grace_rx, force_rx), role='TERMINATOR')
            self.assertEqual(receiver.receive_priority(), ('GRACEFUL', 'REJECTED'))
            self.queue(force_rx, self.force.send.call_args.args[0])
            self.assertEqual(receiver.receive_priority(), ('FORCE', 'ACCEPTED'))
            self.assertIsNone(receiver.receive_priority())
            grace_rx.recvmsg.assert_called_once()

    def test_other_nonce_key_binding_or_lane_is_not_an_authenticated_request(self):
        sender = self.channel()
        sender.send('GRACEFUL', DIGEST)
        frame = self.grace.send.call_args.args[0]
        for session, key, received_lane in (
            (SESSION._replace(nonce=b'y' * 16), KEY, 'GRACEFUL'),
            (SESSION, b'w' * 32, 'GRACEFUL'),
            (SESSION._replace(binding_digest=b'a' * 32), KEY, 'GRACEFUL'),
            (SESSION, KEY, 'FORCE'),
        ):
            grace_rx, force_rx = lane(43), lane(44)
            self.queue(grace_rx if received_lane == 'GRACEFUL' else force_rx, frame)
            receiver = self.channel(session, key, (grace_rx, force_rx), role='TERMINATOR')
            self.assertEqual(receiver.receive_priority(), (received_lane, 'REJECTED'))
            self.assertIsNone(receiver.receive_priority())

    def test_full_or_partial_graceful_delivery_does_not_starve_force(self):
        for failure in (BlockingIOError(errno.EAGAIN, 'fixture-private'), 1):
            channel = self.channel()
            if isinstance(failure, Exception):
                self.grace.send.side_effect = failure
            else:
                self.grace.send.side_effect = None
                self.grace.send.return_value = failure
            with self.assertRaisesRegex(OSError, '^Watchdog termination delivery uncertain\\.$'):
                channel.send('GRACEFUL', DIGEST)
            channel.send('FORCE', DIGEST)
            with self.assertRaises(ValueError):
                channel.send('GRACEFUL', DIGEST)
            self.force.send.assert_called()
            self.grace.send.reset_mock()
            self.force.send.reset_mock()

    def test_roles_reject_reverse_direction_before_socket_io(self):
        sender = self.channel()
        receiver = self.channel(role='TERMINATOR')
        with self.assertRaises(ValueError):
            sender.receive_priority()
        with self.assertRaises(ValueError):
            receiver.send('FORCE', DIGEST)
        with self.assertRaises(ValueError):
            self.channel(role='RENDERER')
        for endpoint in (self.grace, self.force):
            endpoint.recvmsg.assert_not_called()
            endpoint.send.assert_not_called()

    def test_graceful_receipt_leaves_force_lane_available(self):
        sender = self.channel()
        sender.send('GRACEFUL', DIGEST)
        sender.send('FORCE', DIGEST)
        grace_rx, force_rx = lane(43), lane(44)
        self.queue(grace_rx, self.grace.send.call_args.args[0])
        receiver = self.channel(endpoints=(grace_rx, force_rx), role='TERMINATOR')
        self.assertEqual(receiver.receive_priority(), ('GRACEFUL', 'ACCEPTED'))
        self.queue(force_rx, self.force.send.call_args.args[0])
        self.assertEqual(receiver.receive_priority(), ('FORCE', 'ACCEPTED'))
        self.assertIsNone(receiver.receive_priority())


class WatchdogTimerDispatchTests(unittest.TestCase):
    def setUp(self):
        self.graceful = Mock()
        self.force = Mock()
        self.watchdog = harness.FixtureCanaryWatchdog(
            PLAN, harness.FixtureWatchdogPorts(self.graceful, self.force),
        )
        self.timer = Mock()
        self.timer.consume.return_value = True
        self.clock = Mock(return_value=100)
        self.dispatch = transport.WatchdogTimerDispatch(self.watchdog, self.timer, self.clock)

    def test_deadline_grace_cleanup_and_terminal_disarm_progress_without_worker(self):
        self.assertEqual(self.dispatch.update()['watchdogState'], 'ACTIVE')
        self.clock.return_value = 300
        self.assertEqual(self.dispatch.ready()['watchdogState'], 'STOPPING')
        self.clock.return_value = 300 + GRACE
        self.assertEqual(self.dispatch.ready()['watchdogState'], 'STOPPING')
        self.clock.return_value = PLAN.cleanup_deadline_ns
        report = self.dispatch.ready()
        self.assertEqual(report['watchdogState'], 'QUARANTINED')
        self.assertEqual(report['status'], 'HOLD')
        self.assertFalse(report['guestExecutionAuthorized'])
        self.assertEqual(report['qualifyingBuilderReceiptsAdded'], 0)
        self.assertEqual(self.timer.arm.call_args_list, [
            call(300), call(300 + GRACE), call(PLAN.cleanup_deadline_ns), call(None),
        ])
        self.graceful.assert_called_once_with(PLAN)
        self.force.assert_called_once_with(PLAN)

    def test_not_ready_or_wrong_stop_binding_cannot_rearm_or_terminate(self):
        self.timer.consume.return_value = False
        self.assertIsNone(self.dispatch.ready())
        self.clock.assert_not_called()
        self.assertEqual(self.dispatch.stop(BINDING._replace(target_digest='d' * 64))['reason'],
                         'WATCHDOG_BINDING_REJECTED')
        self.timer.arm.assert_not_called()
        self.graceful.assert_not_called()
        self.force.assert_not_called()

    def test_owner_stop_and_verified_inventory_disarm_timer_before_deadline(self):
        first = self.dispatch.stop(BINDING)
        self.assertEqual(first['reason'], 'OWNER_STOP_REQUESTED')
        self.clock.return_value = 101
        clean = harness.FixtureCleanupInventory(
            PLAN.origin, PLAN.binding, PLAN.capsule_generation, PLAN.watchdog_generation, PLAN.verifier_generation,
            100, 101, True, harness.FixtureOwnedResources(0, 0, 0, 0, 0, 0, 0),
        )
        report = self.dispatch.update(inventory=clean)
        self.assertEqual(report['watchdogState'], 'STOPPED')
        self.assertEqual(report['watchdogCleanup'], 'VERIFIED')
        self.assertEqual(self.timer.arm.call_args_list, [call(100 + GRACE), call(None)])
        self.graceful.assert_called_once_with(PLAN)
        self.force.assert_not_called()

    def test_timer_arm_or_read_failure_revokes_and_escalates_only_once(self):
        for stage in ('arm', 'consume'):
            force = Mock()
            watchdog = harness.FixtureCanaryWatchdog(PLAN, harness.FixtureWatchdogPorts(Mock(), force))
            timer = Mock()
            getattr(timer, stage).side_effect = RuntimeError('fixture-private-timer')
            dispatch = transport.WatchdogTimerDispatch(watchdog, timer, self.clock)
            report = dispatch.update() if stage == 'arm' else dispatch.ready()
            self.assertEqual(report['reason'], 'WATCHDOG_TIMER_UNAVAILABLE')
            self.assertEqual(report['watchdogState'], 'QUARANTINED')
            self.assertEqual(watchdog.scope_readback(BINDING).state, 'REVOKED')
            self.assertNotIn('fixture-private', repr(report))
            dispatch.ready()
            force.assert_called_once_with(PLAN)

    def test_timer_expiry_routes_to_force_when_grace_channel_is_full(self):
        grace, force = lane(41), lane(42)
        grace.send.side_effect = BlockingIOError(errno.EAGAIN, 'fixture-private-grace')
        with (patch.object(os, 'uname', return_value=LINUX),
              patch.object(os, 'fstat', side_effect=lambda fd: SimpleNamespace(st_dev=7, st_ino=fd))):
            sender = transport.LinuxArm64TerminationTransport(SESSION, KEY, grace, force, role='WATCHDOG')
            watchdog = harness.FixtureCanaryWatchdog(PLAN, harness.FixtureWatchdogPorts(
                lambda plan: sender.send('GRACEFUL', harness.fixture_watchdog_binding_digest(plan)),
                lambda plan: sender.send('FORCE', harness.fixture_watchdog_binding_digest(plan)),
            ))
            dispatch = transport.WatchdogTimerDispatch(watchdog, self.timer, self.clock)
            dispatch.update()
            self.clock.return_value = 300
            report = dispatch.ready()
            self.assertEqual(report['watchdogState'], 'STOPPING')
            self.assertEqual(report['watchdogCleanup'], 'UNCERTAIN')
            self.assertEqual(self.timer.arm.call_args_list, [call(300), call(PLAN.cleanup_deadline_ns)])
            grace.send.assert_called_once()
            force.send.assert_called_once()
            self.clock.return_value = PLAN.cleanup_deadline_ns
            self.assertEqual(dispatch.ready()['watchdogState'], 'QUARANTINED')
            force.send.assert_called_once()


if __name__ == '__main__':
    unittest.main()
