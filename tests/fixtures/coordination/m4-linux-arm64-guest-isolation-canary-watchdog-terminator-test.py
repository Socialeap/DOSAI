"""Offline owned-capsule termination tests with substituted kernel operations."""

from contextlib import ExitStack
import ctypes
import errno
import fcntl
import importlib.util
import os
from pathlib import Path
import signal
import socket
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch


TOOLS = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot'
PREFIX = 'm4-linux-arm64-guest-isolation-canary-watchdog-'


def load_source(suffix):
    spec = importlib.util.spec_from_file_location(suffix, TOOLS / (PREFIX + suffix + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


with (patch.object(ctypes, 'CDLL', side_effect=AssertionError('Native library used at import')),
      patch.object(os, 'uname', side_effect=AssertionError('Platform read at import')),
      patch.object(os, 'write', side_effect=AssertionError('Descriptor written at import'))):
    terminator = load_source('terminator')
transport = load_source('transport')

GROUP = terminator.FixtureHandlePin(7, 51)
KILL = terminator.FixtureHandlePin(7, 52)
PID_ONE = terminator.FixtureHandlePin(8, 61)
PID_TWO = terminator.FixtureHandlePin(8, 62)
CAPSULE = terminator.FixtureCapsuleBinding('SYNTHETIC_ONLY', b'd' * 32, 'fixture-private-capsule', GROUP, KILL)
MEMBERS = (
    terminator.FixtureOwnedMember('fixture-private-start-one', PID_ONE),
    terminator.FixtureOwnedMember('fixture-private-start-two', PID_TWO),
)
PLAN = terminator.FixtureTerminationPlan(CAPSULE, MEMBERS)
HANDLES = terminator.FixtureTerminationHandles(41, 42, (43, 44))
OWNERSHIP = terminator.FixtureTerminationOwnership(CAPSULE, 'REVOKED', MEMBERS, True, True)
FACTS = {
    141: terminator.DescriptorFacts(GROUP, stat.S_IFDIR | 0o500, 0x63677270, False, os.O_RDONLY),
    142: terminator.DescriptorFacts(KILL, stat.S_IFREG | 0o200, 0x63677270, False, os.O_WRONLY),
    143: terminator.DescriptorFacts(PID_ONE, stat.S_IFREG, 0x50494446, False, os.O_RDONLY),
    144: terminator.DescriptorFacts(PID_TWO, stat.S_IFREG, 0x50494446, False, os.O_RDONLY),
}
GATES = (
    'cleanupVerified', 'physicalIsolationVerified', 'hostQualified', 'provisioningAuthorized',
    'hostMutationAuthorized', 'guestExecutionAuthorized', 'signInAuthorized', 'modelRequestsAuthorized',
    'bridgeActivationAuthorized', 'liveLaunchPermitted',
)


class OwnedTerminatorTests(unittest.TestCase):
    def setUp(self):
        self.receive = Mock(return_value=('GRACEFUL', 'ACCEPTED'))
        self.ownership = Mock(return_value=OWNERSHIP)
        self.facts = dict(FACTS)
        self.ops = terminator.TerminationOps(
            Mock(side_effect=lambda fd: fd + 100), Mock(), Mock(side_effect=lambda fd: self.facts[fd]),
            Mock(return_value=(KILL, stat.S_IFREG)), Mock(return_value=None), Mock(return_value=1),
        )

    def prepare(self, plan=PLAN, handles=HANDLES):
        return terminator.prepare_fixture_owned_terminator(plan, handles, self.receive, self.ownership, ops=self.ops)

    def assert_report(self, report, result):
        self.assertEqual(report['schema'], 'DOSAI_LINUX_ARM64_GUEST_CANARY_TERMINATOR_V1')
        self.assertEqual(report['status'], 'HOLD')
        self.assertEqual(report['scope'], 'SOURCE_ONLY')
        self.assertEqual(report['termination'], result)
        self.assertEqual(report['qualifyingBuilderReceiptsAdded'], 0)
        for gate in GATES:
            self.assertIs(report[gate], False, gate)
        self.assertNotIn('fixture-private', repr(report))

    def assert_no_ops(self):
        for operation in self.ops:
            operation.assert_not_called()

    def test_prepare_is_inert_and_checks_pins_fd_aliases_and_member_bound(self):
        self.assertTrue(callable(self.prepare()))
        for plan, handles in (
            (PLAN._replace(capsule=CAPSULE._replace(origin='LIVE')), HANDLES),
            (PLAN._replace(capsule=CAPSULE._replace(digest=b'short')), HANDLES),
            (PLAN._replace(capsule=CAPSULE._replace(kill_control=GROUP)), HANDLES),
            (PLAN._replace(members=MEMBERS * 9), HANDLES),
            (PLAN._replace(members=(MEMBERS[0], MEMBERS[0])), HANDLES),
            (PLAN, HANDLES._replace(kill_fd=41)),
            (PLAN, HANDLES._replace(directory_fd=1)),
        ):
            with self.assertRaisesRegex(ValueError, '^Invalid synthetic owned terminator configuration\\.$'):
                self.prepare(plan, handles)
        self.receive.assert_not_called()
        self.ownership.assert_not_called()
        self.assert_no_ops()

    def test_pending_malformed_rejected_and_unbound_frames_never_read_ownership(self):
        self.receive.side_effect = [
            None, ('GRACEFUL', 'REJECTED'), ('RUN', 'ACCEPTED'), {'pid': 314, 'phase': 'FORCE'},
            RuntimeError('fixture-private-frame'),
        ]
        handle = self.prepare()
        self.assert_report(handle(), 'PENDING')
        for _ in range(4):
            self.assert_report(handle(), 'FRAME_REJECTED')
        self.assertEqual(self.receive.call_args_list, [call(CAPSULE.digest)] * 5)
        self.ownership.assert_not_called()
        self.assert_no_ops()

    def test_active_or_stale_capsule_cannot_signal_and_consumed_frame_cannot_retry(self):
        for owner in (
            OWNERSHIP._replace(state='ACTIVE'),
            OWNERSHIP._replace(capsule=CAPSULE._replace(capsule_generation='fixture-stale')),
            OWNERSHIP._replace(capsule=CAPSULE._replace(digest=b'g' * 32)),
            OWNERSHIP._replace(members=MEMBERS[::-1]),
            OWNERSHIP._replace(subtree_owned=False),
            OWNERSHIP._replace(control_plane_outside=1),
            {'granted': True, 'state': 'REVOKED'},
        ):
            self.ownership.return_value = owner
            handle = self.prepare()
            self.assert_report(handle(), 'OWNERSHIP_REJECTED')
            self.assert_report(handle(), 'FRAME_CONSUMED')
        self.assert_no_ops()

    def test_graceful_signals_registered_pidfds_once_and_closes_only_owned_copies(self):
        handle = self.prepare()
        self.assert_report(handle(), 'GRACEFUL_REQUESTED')
        self.assertEqual(self.ops.duplicate.call_args_list, [call(41), call(43), call(44)])
        self.assertEqual(self.ops.signal_term.call_args_list, [call(143), call(144)])
        self.assertEqual(self.ops.close.call_args_list, [call(144), call(143), call(141)])
        self.assert_report(handle(), 'FRAME_CONSUMED')
        self.ops.write_kill.assert_not_called()

    def test_pidfd_substitution_legacy_filesystem_or_inheritance_never_partially_signals(self):
        for facts in (
            FACTS[144]._replace(pin=terminator.FixtureHandlePin(8, 99)),
            FACTS[144]._replace(filesystem=0x09041934),
            FACTS[144]._replace(inheritable=True),
        ):
            self.facts[144] = facts
            self.assert_report(self.prepare()(), 'DELIVERY_UNCERTAIN')
        self.ops.signal_term.assert_not_called()

    def test_scope_change_between_member_signals_stops_further_effects(self):
        self.ownership.side_effect = [OWNERSHIP, OWNERSHIP, OWNERSHIP._replace(state='ACTIVE')]
        handle = self.prepare()
        self.assert_report(handle(), 'DELIVERY_UNCERTAIN')
        self.ops.signal_term.assert_called_once_with(143)
        self.assertEqual(self.ops.close.call_args_list, [call(144), call(143), call(141)])

    def test_member_exit_is_uncertain_and_does_not_disable_force(self):
        self.ops.signal_term.side_effect = [ProcessLookupError(errno.ESRCH, 'fixture-private'), None]
        self.receive.side_effect = [('GRACEFUL', 'ACCEPTED'), ('FORCE', 'ACCEPTED')]
        handle = self.prepare()
        self.assert_report(handle(), 'DELIVERY_UNCERTAIN')
        self.assertEqual(self.ops.signal_term.call_args_list, [call(143), call(144)])
        self.assert_report(handle(), 'FORCE_REQUESTED')
        self.ops.write_kill.assert_called_once_with(142)

    def test_force_targets_the_bound_cgroup_control_with_no_pidfd_roster_dependency(self):
        self.ownership.return_value = OWNERSHIP._replace(members=())
        self.receive.side_effect = [('FORCE', 'ACCEPTED'), ('GRACEFUL', 'ACCEPTED'), ('FORCE', 'ACCEPTED')]
        handle = self.prepare()
        self.assert_report(handle(), 'FORCE_REQUESTED')
        self.assertEqual(self.ops.duplicate.call_args_list, [call(41), call(42)])
        self.ops.stat_kill_control.assert_called_once_with(141)
        self.ops.write_kill.assert_called_once_with(142)
        self.assertEqual(self.ops.close.call_args_list, [call(142), call(141)])
        self.assert_report(handle(), 'FRAME_CONSUMED')
        self.assert_report(handle(), 'FRAME_CONSUMED')
        self.ops.signal_term.assert_not_called()

    def test_wrong_group_filesystem_or_descriptor_pins_do_not_write(self):
        self.receive.return_value = ('FORCE', 'ACCEPTED')
        for fd, altered in (
            (141, FACTS[141]._replace(pin=terminator.FixtureHandlePin(7, 99))),
            (141, FACTS[141]._replace(filesystem=0x27E0EB)),
            (142, FACTS[142]._replace(filesystem=0xEF53)),
            (142, FACTS[142]._replace(mode=stat.S_IFDIR)),
            (142, FACTS[142]._replace(flags=os.O_RDWR)),
        ):
            self.facts = {**FACTS, fd: altered}
            self.assert_report(self.prepare()(), 'DELIVERY_UNCERTAIN')
        self.ops.write_kill.assert_not_called()

    def test_wrong_fixed_control_and_revoked_ownership_loss_do_not_write(self):
        self.receive.return_value = ('FORCE', 'ACCEPTED')
        for metadata in ((terminator.FixtureHandlePin(7, 99), stat.S_IFREG), (KILL, stat.S_IFLNK)):
            self.ops.stat_kill_control.return_value = metadata
            self.assert_report(self.prepare()(), 'DELIVERY_UNCERTAIN')
        self.ops.stat_kill_control.return_value = (KILL, stat.S_IFREG)
        self.ownership.side_effect = [OWNERSHIP, OWNERSHIP._replace(control_plane_outside=False)]
        self.assert_report(self.prepare()(), 'DELIVERY_UNCERTAIN')
        self.ops.write_kill.assert_not_called()

    def test_partial_write_or_cleanup_failure_leaves_delivery_uncertain_and_consumed(self):
        self.receive.return_value = ('FORCE', 'ACCEPTED')
        for returned in (0, True):
            self.ops.write_kill.return_value = returned
            handle = self.prepare()
            self.assert_report(handle(), 'DELIVERY_UNCERTAIN')
            self.assert_report(handle(), 'FRAME_CONSUMED')
        self.ops.write_kill.return_value = 1
        self.ops.close.side_effect = OSError(errno.EIO, 'fixture-private-close')
        handle = self.prepare()
        self.assert_report(handle(), 'DELIVERY_UNCERTAIN')
        self.assert_report(handle(), 'FRAME_CONSUMED')
        self.assertEqual(self.ops.write_kill.call_count, 3)

    def test_native_bindings_only_use_fixed_sigterm_and_single_byte_control_write(self):
        def filesystem(fd, buffer):
            buffer._obj.filesystem = FACTS[fd].filesystem
            return 0

        def metadata(fd):
            facts = FACTS[fd]
            return SimpleNamespace(st_dev=facts.pin.device, st_ino=facts.pin.inode, st_mode=facts.mode)

        library = SimpleNamespace(fstatfs=Mock(side_effect=filesystem))
        operations = (
            (os, 'uname', Mock(return_value=SimpleNamespace(sysname='Linux', machine='aarch64'))),
            (ctypes, 'CDLL', Mock(return_value=library)),
            (os, 'dup', self.ops.duplicate), (os, 'close', self.ops.close),
            (os, 'fstat', Mock(side_effect=metadata)),
            (os, 'get_inheritable', Mock(return_value=False)),
            (os, 'stat', Mock(return_value=metadata(142))),
            (fcntl, 'fcntl', Mock(side_effect=lambda fd, _: FACTS[fd].flags)),
            (signal, 'pidfd_send_signal', Mock()),
            (os, 'write', Mock(return_value=1)),
        )
        self.receive.side_effect = [('GRACEFUL', 'ACCEPTED'), ('FORCE', 'ACCEPTED')]
        with ExitStack() as patches:
            for module, name, fake in operations:
                patches.enter_context(patch.object(module, name, fake, create=True))
            handle = terminator.prepare_fixture_owned_terminator(PLAN, HANDLES, self.receive, self.ownership)
            os.uname.assert_not_called()
            ctypes.CDLL.assert_not_called()
            self.assert_report(handle(), 'GRACEFUL_REQUESTED')
            self.assert_report(handle(), 'FORCE_REQUESTED')
            self.assertEqual(signal.pidfd_send_signal.call_args_list, [
                call(143, signal.SIGTERM, None, 0), call(144, signal.SIGTERM, None, 0),
            ])
            os.stat.assert_called_once_with('cgroup.kill', dir_fd=141, follow_symlinks=False)
            os.write.assert_called_once_with(142, b'1')
            self.assertEqual([item.args[0] for item in library.fstatfs.call_args_list], [141, 143, 144, 141, 142])

    def test_non_linux_arm64_never_loads_native_control_bindings(self):
        with (patch.object(os, 'uname', return_value=SimpleNamespace(sysname='Linux', machine='x86_64')),
              patch.object(ctypes, 'CDLL') as library):
            handle = terminator.prepare_fixture_owned_terminator(PLAN, HANDLES, self.receive, self.ownership)
            self.assert_report(handle(), 'DELIVERY_UNCERTAIN')
        library.assert_not_called()

    def test_authenticated_transport_binds_receiver_to_exact_capsule(self):
        def lane(fd):
            endpoint = Mock()
            endpoint.family = socket.AF_UNIX
            endpoint.getsockopt.return_value = socket.SOCK_SEQPACKET
            endpoint.get_inheritable.return_value = False
            endpoint.fileno.return_value = fd
            endpoint.send.side_effect = lambda frame, flags: len(frame)
            return endpoint

        tx_grace, tx_force, rx_grace, rx_force = (lane(fd) for fd in (51, 52, 53, 54))
        session = transport.FixtureTerminationSession('SYNTHETIC_ONLY', b'n' * 16, CAPSULE.digest)
        linux = SimpleNamespace(sysname='Linux', machine='aarch64')
        with (patch.object(os, 'uname', return_value=linux),
              patch.object(os, 'fstat', side_effect=lambda fd: SimpleNamespace(st_dev=1, st_ino=fd)),
              patch.object(socket, 'socket', side_effect=AssertionError('Opened socket'))):
            sender = transport.LinuxArm64TerminationTransport(
                session, b'k' * 32, tx_grace, tx_force, role='WATCHDOG',
            )
            receiver = transport.LinuxArm64TerminationTransport(
                session, b'k' * 32, rx_grace, rx_force, role='TERMINATOR',
            )
            sender.send('FORCE', CAPSULE.digest)
            frame = tx_force.send.call_args.args[0]
            rx_force.recvmsg.return_value = (frame, [], 0, '')
            wrong = terminator.prepare_fixture_owned_terminator(
                PLAN._replace(capsule=CAPSULE._replace(digest=b'x' * 32)),
                HANDLES, receiver.receive_bound_priority, self.ownership, ops=self.ops,
            )
            self.assert_report(wrong(), 'FRAME_REJECTED')
            rx_force.recvmsg.assert_not_called()
            self.ownership.assert_not_called()
            self.assert_no_ops()

            handle = terminator.prepare_fixture_owned_terminator(
                PLAN, HANDLES, receiver.receive_bound_priority, self.ownership, ops=self.ops,
            )
            self.assert_report(handle(), 'FORCE_REQUESTED')
            self.assert_report(handle(), 'PENDING')
        self.ops.write_kill.assert_called_once_with(142)
        rx_grace.recvmsg.assert_not_called()


if __name__ == '__main__':
    unittest.main()
