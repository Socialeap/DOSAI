"""Offline fixtures. Linux kernel reads are substituted by mock sources."""

import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch


SOURCE = (Path(__file__).resolve().parents[3]
          / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-collectors.py')
spec = importlib.util.spec_from_file_location('linux_guest_metadata', SOURCE)
collector = importlib.util.module_from_spec(spec)
with patch.object(os, 'uname', side_effect=AssertionError('Unexpected OS probe on import')):
    spec.loader.exec_module(collector)

PROBE = collector.ProbeIdentity(1337, 459000, 'mnt:[4026533001]', 'net:[4026533002]', 'user:[4026533003]')
UID, GID = 1001, 1002
FLAGS = b'0000000000000000'
STATUS = (b'Name:\tfixture-private-name\nPid:\t1337\n'
          b'Uid:\t1001\t1001\t1001\t1001\nGid:\t1002\t1002\t1002\t1002\nGroups:\t1002\n'
          + b''.join(name + b':\t' + FLAGS + b'\n' for name in (b'CapInh', b'CapPrm', b'CapEff', b'CapBnd', b'CapAmb'))
          + b'NoNewPrivs:\t1\nSeccomp:\t2\n')
ROOT_MOUNT = b'30 20 253:1 / / rw - ext4 /dev/fixture-private-disk rw\n'
PROC_MOUNT = b'31 30 0:6 / /proc rw - proc proc rw\n'
MOUNTS = ROOT_MOUNT + PROC_MOUNT
NET_HEADER = (b'Inter-|   Receive | Transmit\n'
              b' face |bytes packets errs drop fifo frame compressed multicast|'
              b'bytes packets errs drop fifo colls carrier compressed\n')
COUNTERS = b'  0' * 16 + b'\n'
INTERFACES = NET_HEADER + b'    lo:' + COUNTERS
TASK_STAT = b'1337 (fixture) worker) S' + b' 0' * 18 + b' 459000 0 0\n'

FALSE_GATES = (
    'hostShareExclusionVerified', 'loopbackDenialVerified', 'egressDenialVerified', 'subprocessDenialVerified',
    'hostQualified', 'provisioningAuthorized', 'hostMutationAuthorized', 'guestExecutionAuthorized',
    'signInAuthorized', 'modelRequestsAuthorized', 'bridgeActivationAuthorized', 'liveLaunchPermitted',
)


class GuestMetadataTests(unittest.TestCase):
    def setUp(self):
        self.source = Mock(spec=collector.LinuxArm64GuestMetadata)
        self.source.identity.return_value = PROBE
        self.source.status.return_value = STATUS
        self.source.mountinfo.return_value = MOUNTS
        self.source.interfaces.return_value = INTERFACES

    def collect(self, expected=PROBE, uid=UID, gid=GID):
        result = collector.collect_guest_isolation(self.source, expected, uid, gid)
        self.assertEqual(result['schema'], 'DOSAI_LINUX_ARM64_GUEST_METADATA_V1')
        self.assertEqual(result['status'], 'HOLD')
        self.assertEqual(result['scope'], 'SOURCE_ONLY')
        self.assertEqual(result['qualifyingBuilderReceiptsAdded'], 0)
        for gate in FALSE_GATES:
            self.assertIs(result[gate], False, gate)
        self.assertNotIn('fixture-private', repr(result))
        self.assertNotIn(PROBE.mount_namespace, repr(result))
        return result

    def assert_empty_projection(self, result, reason):
        self.assertEqual(result['reason'], reason)
        for field in ('credentials', 'mounts', 'interfaces'):
            self.assertEqual(result[field], 'UNAVAILABLE')

    def test_matching_metadata_leaves_all_gates_held(self):
        result = self.collect()
        self.assertEqual(result['reason'], 'METADATA_ONLY')
        self.assertEqual(result['credentials'], 'REVIEWED_RESTRICTION_FLAGS_OBSERVED')
        self.assertEqual(result['mounts'], 'NO_LISTED_MOUNT_REVIEW_INDICATOR_OBSERVED')
        self.assertEqual(result['interfaces'], 'ONLY_LO_NAME_OBSERVED')
        self.assertEqual(self.source.mock_calls, [
            call.identity(), call.status(), call.mountinfo(), call.interfaces(), call.identity(),
        ])

    def test_invalid_expected_scope_does_not_read_metadata(self):
        cases = [
            (None, UID, GID),
            (PROBE._replace(start_ticks=0), UID, GID),
            (PROBE._replace(user_namespace='mnt:[4026533003]'), UID, GID),
            (PROBE, 0, GID),
            (PROBE, UID, 0),
            (PROBE, True, GID),
        ]
        for expected, uid, gid in cases:
            with self.subTest(expected=expected, uid=uid, gid=gid):
                self.assert_empty_projection(self.collect(expected, uid, gid), 'REVIEWED_PROBE_IDENTITY_REQUIRED')
        self.assertEqual(self.source.mock_calls, [])

    def test_stale_or_moved_probe_stops_before_metadata_reads(self):
        for identity in (PROBE._replace(start_ticks=459001), PROBE._replace(network_namespace='net:[4026533010]')):
            with self.subTest(identity=identity):
                self.source.identity.return_value = identity
                self.assert_empty_projection(self.collect(), 'PROBE_IDENTITY_MISMATCH')
        self.source.status.assert_not_called()
        self.source.mountinfo.assert_not_called()
        self.source.interfaces.assert_not_called()

    def test_after_read_identity_change_discards_every_projection(self):
        for field, value in [('start_ticks', 459001), ('mount_namespace', 'mnt:[4026533010]'),
                             ('network_namespace', 'net:[4026533010]'), ('user_namespace', 'user:[4026533010]')]:
            with self.subTest(field=field):
                self.source.identity.side_effect = [PROBE, PROBE._replace(**{field: value})]
                self.assert_empty_projection(self.collect(), 'PROBE_IDENTITY_CHANGED')

    def test_raw_source_diagnostics_are_discarded(self):
        for method in (self.source.status, self.source.mountinfo, self.source.interfaces):
            method.side_effect = PermissionError('fixture-private-raw-diagnostic')
            self.assert_empty_projection(self.collect(), 'PROBE_METADATA_UNAVAILABLE')
            method.side_effect = None

    def test_root_saved_ids_extra_groups_caps_and_missing_restrictions_are_detected(self):
        changes = [
            (b'Uid:\t1001\t1001\t1001\t1001', b'Uid:\t1001\t1001\t0\t1001'),
            (b'Gid:\t1002\t1002\t1002\t1002', b'Gid:\t1002\t1002\t0\t1002'),
            (b'Groups:\t1002', b'Groups:\t0 1002'),
            (b'CapEff:\t' + FLAGS, b'CapEff:\t0000000000000001'),
            (b'CapBnd:\t' + FLAGS, b'CapBnd:\t0000000000000001'),
            (b'NoNewPrivs:\t1', b'NoNewPrivs:\t0'),
            (b'Seccomp:\t2', b'Seccomp:\t0'),
        ]
        for before, after in changes:
            with self.subTest(field=before):
                self.source.status.return_value = STATUS.replace(before, after)
                self.assertEqual(self.collect()['credentials'], 'UNEXPECTED_RESTRICTION_FLAGS')

    def test_malformed_or_unbound_status_does_not_admit_partial_results(self):
        replacements = [
            STATUS.replace(b'1337', b'1338'), STATUS.replace(b'Seccomp:\t2\n', b''),
            STATUS + b'CapEff:\t' + FLAGS + b'\n', STATUS.replace(FLAGS, b'x' * 16),
            b'x' * collector.MAX_STATUS + b'\n',
        ]
        for raw in replacements:
            self.source.status.return_value = raw
            self.assert_empty_projection(self.collect(), 'PROBE_METADATA_UNAVAILABLE')
        self.source.mountinfo.assert_not_called()

    def test_mount_sharing_bind_and_stack_indicators(self):
        additions = [
            b'32 30 0:7 / /shares/fixture\\040private rw - virtiofs fixture-private-tag rw\n',
            b'32 30 0:7 / /share ro - 9p fixture-private-tag ro\n',
            b'32 30 253:1 /workspace /shared rw - ext4 /dev/fixture-private-disk rw\n',
            b'32 30 0:7 / /share rw - fuse.sshfs fixture-private-source rw\n',
            b'32 30 0:7 / / rw - overlay overlay rw\n',
        ]
        for mount in additions:
            self.source.mountinfo.return_value = MOUNTS + mount
            self.assertEqual(self.collect()['mounts'], 'MOUNT_REVIEW_INDICATOR_OBSERVED')

    def test_malformed_or_truncated_mount_tables_fail_closed(self):
        for raw in (MOUNTS[:-1], PROC_MOUNT, MOUNTS + ROOT_MOUNT,
                    MOUNTS.replace(b' - ', b' - - '), MOUNTS.replace(b' /proc ', b' /proc\\777 '),
                    MOUNTS.replace(b' rw - ', b' ro,rw - '), b'x' * collector.MAX_MOUNTS + b'\n'):
            self.source.mountinfo.return_value = raw
            self.assert_empty_projection(self.collect(), 'PROBE_METADATA_UNAVAILABLE')
        self.source.interfaces.assert_not_called()

    def test_interface_inventory_names_do_not_prove_network_denial(self):
        self.source.interfaces.return_value = INTERFACES + b'    fixture-private:' + COUNTERS
        result = self.collect()
        self.assertEqual(result['interfaces'], 'OTHER_INTERFACE_NAME_OBSERVED')

    def test_malformed_or_truncated_interface_inventory_is_unavailable(self):
        for raw in (NET_HEADER, INTERFACES + b'lo:' + COUNTERS, INTERFACES[:-1],
                    NET_HEADER + b'lo: 0\n', INTERFACES.replace(b'carrier', b''),
                    b'x' * collector.MAX_INTERFACES + b'\n'):
            self.source.interfaces.return_value = raw
            self.assert_empty_projection(self.collect(), 'PROBE_METADATA_UNAVAILABLE')


class NativeAdapterTests(unittest.TestCase):
    def test_non_linux_arm64_platform_rejects_before_proc_reads(self):
        with patch.object(collector, '_read_proc_file') as read_proc:
            for system, machine in [('Darwin', 'arm64'), ('Linux', 'x86_64')]:
                with patch.object(os, 'uname', return_value=SimpleNamespace(sysname=system, machine=machine)):
                    with self.assertRaisesRegex(OSError, '^Linux ARM64 is required\\.$'):
                        collector.LinuxArm64GuestMetadata()
            read_proc.assert_not_called()

    def test_native_adapter_reads_fixed_views_for_the_calling_task(self):
        platform = SimpleNamespace(sysname='Linux', machine='aarch64')
        views = {'stat': TASK_STAT, 'status': STATUS, 'mountinfo': MOUNTS, 'net/dev': INTERFACES}
        with (patch.object(os, 'uname', return_value=platform),
              patch.object(collector, 'get_native_id', return_value=PROBE.task_id),
              patch.object(collector, '_read_proc_file', side_effect=lambda name, bound: views[name]) as read_proc,
              patch.object(os, 'readlink', side_effect=PROBE[2:]) as readlink):
            source = collector.LinuxArm64GuestMetadata()
            self.assertEqual(source.identity(), PROBE)
            self.assertEqual(source.status(), STATUS)
            self.assertEqual(source.mountinfo(), MOUNTS)
            self.assertEqual(source.interfaces(), INTERFACES)
        self.assertEqual(read_proc.call_args_list, [
            call('stat', collector.MAX_TASK_STAT), call('status', collector.MAX_STATUS),
            call('mountinfo', collector.MAX_MOUNTS), call('net/dev', collector.MAX_INTERFACES),
        ])
        self.assertEqual(readlink.call_args_list, [
            call('/proc/thread-self/ns/mnt'), call('/proc/thread-self/ns/net'), call('/proc/thread-self/ns/user'),
        ])

    def test_task_stat_reader_rejects_stale_id_and_bad_start_time(self):
        for raw in (TASK_STAT.replace(b'1337', b'1338'), TASK_STAT.replace(b'459000', b'0'),
                    TASK_STAT.replace(b'459000', b'bad'), TASK_STAT[:-1], b'x' * (collector.MAX_TASK_STAT + 1)):
            with self.assertRaises(ValueError):
                collector._task_start_ticks(raw, PROBE.task_id)

    def test_proc_reader_uses_read_only_flags_and_rejects_nonregular_or_oversized_input(self):
        def fake_open(path, mode, *, opener):
            self.assertEqual(path, '/proc/thread-self/status')
            self.assertEqual(mode, 'rb')
            self.assertEqual(opener(path, os.O_TRUNC), 9)
            return stream

        flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
        stream = Mock()
        stream.__enter__ = Mock(return_value=stream)
        stream.__exit__ = Mock(return_value=False)
        stream.fileno.return_value = 9
        stream.read.return_value = STATUS
        with (patch.object(collector, 'open', create=True, side_effect=fake_open),
              patch.object(os, 'open', return_value=9) as open_fd,
              patch.object(os, 'fstat', return_value=SimpleNamespace(st_mode=0o100400)) as fstat):
            self.assertEqual(collector._read_proc_file('status', len(STATUS)), STATUS)
            open_fd.assert_called_once_with('/proc/thread-self/status', flags)
            stream.read.assert_called_once_with(len(STATUS) + 1)
            with self.assertRaises(ValueError):
                collector._read_proc_file('status', len(STATUS) - 1)
            fstat.return_value = SimpleNamespace(st_mode=0o010600)
            stream.read.reset_mock()
            with self.assertRaises(ValueError):
                collector._read_proc_file('status', len(STATUS))
            stream.read.assert_not_called()


if __name__ == '__main__':
    unittest.main()
