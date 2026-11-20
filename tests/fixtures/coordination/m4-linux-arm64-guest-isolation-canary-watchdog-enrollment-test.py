"""Offline enrollment tests with substituted socket metadata and entropy."""

import errno
import importlib.util
import os
from pathlib import Path
import socket
import struct
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch


SOURCE = (Path(__file__).resolve().parents[3]
          / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-watchdog-transport.py')
spec = importlib.util.spec_from_file_location('watchdog_transport', SOURCE)
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)

PEERCRED = 17
LINUX = SimpleNamespace(sysname='Linux', machine='aarch64')
WATCHDOG = transport.FixtureProcessPin('fixture-watchdog', 100, 1001, 1001, 320)
TERMINATOR = transport.FixtureProcessPin('fixture-terminator', 101, 1002, 1002, 332)
PINNED = {fd: transport.FixtureSocketPin(9, 1000 + fd) for fd in (41, 42, 43, 44)}
PLAN = transport.FixtureTerminationEnrollmentPlan(
    'SYNTHETIC_ONLY', 'fixture-enrollment', b'b' * 32,
    transport.FixtureTerminationRolePin(WATCHDOG, PINNED[41], PINNED[42]),
    transport.FixtureTerminationRolePin(TERMINATOR, PINNED[43], PINNED[44]),
    1000,
)
FIXTURE_NONCE = b'n' * 16
FIXTURE_KEY = b'k' * 32


def peer_bytes(process):
    return struct.pack('=iII', process.pid, process.uid, process.gid)


def lane(fd, peer):
    endpoint = Mock()
    endpoint.family = socket.AF_UNIX
    endpoint.get_inheritable.return_value = False
    endpoint.getpeername.return_value = ''
    endpoint.fileno.return_value = fd

    def option(level, name, *size):
        if level == socket.SOL_SOCKET and name == socket.SO_TYPE and not size:
            return socket.SOCK_SEQPACKET
        if level == socket.SOL_SOCKET and name == PEERCRED and size == (12,):
            return peer_bytes(peer)
        raise AssertionError('Unexpected socket option')

    endpoint.getsockopt.side_effect = option
    endpoint.send.side_effect = lambda data, flags: len(data)
    endpoint.recvmsg.side_effect = BlockingIOError(errno.EAGAIN, 'fixture-private-pending')
    return endpoint


class WatchdogEnrollmentTests(unittest.TestCase):
    def substitute(self, module, name, replacement, **kwargs):
        patcher = patch.object(module, name, replacement, **kwargs)
        patcher.start()
        self.addCleanup(patcher.stop)
        return replacement

    def setUp(self):
        self.uname = self.substitute(os, 'uname', Mock(return_value=LINUX))
        self.stat = self.substitute(os, 'fstat', Mock(side_effect=self.fstat))
        self.open_socket = self.substitute(socket, 'socket', Mock(side_effect=AssertionError('Socket created')))
        self.substitute(socket, 'SO_PEERCRED', PEERCRED, create=True)
        self.clock = Mock(return_value=100)
        self.random = Mock(side_effect=[FIXTURE_NONCE, FIXTURE_KEY])
        self.ownership = Mock(return_value=PLAN)
        self.identities = dict(PINNED)
        self.watchdog = transport.FixtureTerminationLanes(lane(41, TERMINATOR), lane(42, TERMINATOR))
        self.terminator = transport.FixtureTerminationLanes(lane(43, WATCHDOG), lane(44, WATCHDOG))

    def fstat(self, fd):
        pin = self.identities[fd]
        return SimpleNamespace(st_dev=pin.device, st_ino=pin.inode)

    def prepare(self, plan=PLAN, watchdog=None, terminator=None):
        return transport.prepare_fixture_termination_enrollment(
            plan, self.watchdog if watchdog is None else watchdog,
            self.terminator if terminator is None else terminator,
            self.ownership, clock_ns=self.clock, random_bytes=self.random,
        )

    def assert_no_frames(self):
        self.open_socket.assert_not_called()
        for endpoint in (*self.watchdog, *self.terminator):
            endpoint.send.assert_not_called()
            endpoint.recvmsg.assert_not_called()

    def assert_rejected_once(self, enroll):
        with self.assertRaisesRegex(OSError, '^Synthetic watchdog enrollment rejected\\.$'):
            enroll()
        reads, random_calls = self.stat.call_count, self.random.call_count
        with self.assertRaisesRegex(ValueError, '^Synthetic watchdog enrollment consumed\\.$'):
            enroll()
        self.assertEqual(self.stat.call_count, reads)
        self.assertEqual(self.random.call_count, random_calls)
        self.assert_no_frames()

    def test_prepare_is_inert_and_does_not_generate_credentials(self):
        self.assertTrue(callable(self.prepare()))
        for reader in (self.uname, self.stat, self.clock, self.ownership, self.random):
            reader.assert_not_called()
        self.assert_no_frames()

    def test_valid_enrollment_runs_both_roles_and_lanes_through_existing_transport(self):
        enroll = self.prepare()
        session = enroll()
        self.assertEqual(self.random.call_args_list, [call(16), call(32)])
        self.assertEqual(self.ownership.call_count, 4)
        for endpoint in (*self.watchdog, *self.terminator):
            self.assertEqual(endpoint.getsockopt.call_args_list.count(call(socket.SOL_SOCKET, PEERCRED, 12)), 2)
        self.assert_no_frames()
        self.assertNotIn(FIXTURE_KEY.decode('ascii'), repr(session))
        self.assertNotIn(FIXTURE_NONCE.decode('ascii'), repr(session))
        with self.assertRaises(ValueError):
            enroll()

        session.watchdog.send('GRACEFUL', PLAN.binding_digest)
        packet = self.watchdog.graceful.send.call_args.args[0]
        self.terminator.graceful.recvmsg.side_effect = None
        self.terminator.graceful.recvmsg.return_value = (packet, [], 0, '')
        self.assertEqual(session.terminator.receive_priority(), ('GRACEFUL', 'ACCEPTED'))

        session.watchdog.send('FORCE', PLAN.binding_digest)
        packet = self.watchdog.force.send.call_args.args[0]
        self.terminator.force.recvmsg.side_effect = None
        self.terminator.force.recvmsg.return_value = (packet, [], 0, '')
        self.assertEqual(session.terminator.receive_priority(), ('FORCE', 'ACCEPTED'))

    def test_shape_alias_and_reused_role_pid_reject_before_any_reads(self):
        plans = (
            PLAN._replace(origin='LIVE'), PLAN._replace(generation=WATCHDOG.generation),
            PLAN._replace(binding_digest=b'short'), PLAN._replace(admission_deadline_ns=True),
            PLAN._replace(watchdog=PLAN.watchdog._replace(force=PLAN.terminator.graceful)),
            PLAN._replace(terminator=PLAN.terminator._replace(process=TERMINATOR._replace(pid=WATCHDOG.pid))),
            PLAN._replace(watchdog=PLAN.watchdog._replace(process=WATCHDOG._replace(uid=0))),
        )
        for plan in plans:
            with self.assertRaisesRegex(ValueError, '^Invalid synthetic watchdog enrollment\\.$'):
                self.prepare(plan)
        for reader in (self.uname, self.stat, self.clock, self.ownership, self.random):
            reader.assert_not_called()

    def test_non_linux_arm64_blocks_before_endpoints_and_entropy(self):
        self.uname.return_value = SimpleNamespace(sysname='Linux', machine='x86_64')
        self.assert_rejected_once(self.prepare())
        self.stat.assert_not_called()
        self.clock.assert_not_called()
        self.random.assert_not_called()

    def test_swapped_lanes_or_substituted_socket_cannot_obtain_session_material(self):
        switched = transport.FixtureTerminationLanes(self.watchdog.force, self.watchdog.graceful)
        self.assert_rejected_once(self.prepare(watchdog=switched))
        self.identities[44] = PINNED[43]
        self.assert_rejected_once(self.prepare())
        self.random.assert_not_called()

    def test_native_peer_credentials_must_match_exactly(self):
        endpoint = self.terminator.force
        original = endpoint.getsockopt.side_effect
        for raw in (
            peer_bytes(WATCHDOG._replace(pid=WATCHDOG.pid + 1)),
            peer_bytes(WATCHDOG._replace(uid=WATCHDOG.uid + 1)),
            peer_bytes(WATCHDOG._replace(gid=WATCHDOG.gid + 1)),
            peer_bytes(WATCHDOG)[:-1],
            peer_bytes(WATCHDOG) + b'x',
        ):
            endpoint.getsockopt.side_effect = lambda level, name, *size: (
                raw if name == PEERCRED else original(level, name, *size))
            self.assert_rejected_once(self.prepare())
        self.random.assert_not_called()

    def test_recycled_pid_or_changed_registration_blocks_before_native_metadata(self):
        for readback in (
            PLAN._replace(terminator=PLAN.terminator._replace(
                process=TERMINATOR._replace(start_ticks=TERMINATOR.start_ticks + 1))),
            PLAN._replace(generation='fixture-other-enrollment'),
            PLAN._replace(binding_digest=b'w' * 32),
            {'binding_digest': PLAN.binding_digest, 'authorized': True},
        ):
            self.ownership.return_value = readback
            self.assert_rejected_once(self.prepare())
        self.stat.assert_not_called()
        self.random.assert_not_called()

    def test_ownership_is_rechecked_after_metadata_before_randomness(self):
        self.ownership.side_effect = [PLAN, PLAN._replace(generation='fixture-replaced')]
        self.assert_rejected_once(self.prepare())
        self.assertEqual(self.stat.call_count, 4)
        self.random.assert_not_called()

    def test_expiry_and_clock_rollback_consume_enrollment_without_publication(self):
        for samples in ([1000], [200, 199]):
            self.clock.side_effect = samples
            self.assert_rejected_once(self.prepare())
        self.random.assert_not_called()

        self.clock.side_effect = [100, 100, 101, 1000]
        self.assert_rejected_once(self.prepare())
        self.assertEqual(self.random.call_args_list, [call(16), call(32)])

    def test_malformed_session_material_stops_without_creating_a_partial_session(self):
        self.random.side_effect = [b'fixture-private-nonce']
        self.assert_rejected_once(self.prepare())
        self.random.assert_called_once_with(16)

        self.random.reset_mock()
        self.random.side_effect = [FIXTURE_NONCE, b'fixture-private-key']
        self.assert_rejected_once(self.prepare())
        self.assertEqual(self.random.call_args_list, [call(16), call(32)])

    def test_post_construction_drift_retires_both_unpublished_roles(self):
        original = transport.LinuxArm64TerminationTransport
        constructed = []

        def build(*args, **kwargs):
            role = original(*args, **kwargs)
            constructed.append(role)
            return role

        self.ownership.side_effect = [PLAN, PLAN, PLAN, PLAN._replace(generation='fixture-drift')]
        with patch.object(transport, 'LinuxArm64TerminationTransport', side_effect=build):
            self.assert_rejected_once(self.prepare())
        self.assertEqual(len(constructed), 2)
        with self.assertRaises(ValueError):
            constructed[0].send('FORCE', PLAN.binding_digest)
        self.assertIsNone(constructed[1].receive_priority())
        self.assert_no_frames()

    def test_retirement_and_fresh_enrollment_reject_old_frames(self):
        first = self.prepare()()
        first.watchdog.send('FORCE', PLAN.binding_digest)
        old = self.watchdog.force.send.call_args.args[0]
        first.retire()
        first.retire()
        with self.assertRaises(ValueError):
            first.watchdog.send('GRACEFUL', PLAN.binding_digest)
        self.assertIsNone(first.terminator.receive_priority())

        second_plan = PLAN._replace(generation='fixture-next-enrollment')
        self.ownership.return_value = second_plan
        self.random.side_effect = [b'm' * 16, b'z' * 32]
        second = self.prepare(second_plan)()
        self.terminator.force.recvmsg.side_effect = None
        self.terminator.force.recvmsg.return_value = (old, [], 0, '')
        self.assertEqual(second.terminator.receive_priority(), ('FORCE', 'REJECTED'))


if __name__ == '__main__':
    unittest.main()
