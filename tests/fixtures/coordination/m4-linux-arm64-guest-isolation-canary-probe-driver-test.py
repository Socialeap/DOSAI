"""Offline tests for the Linux ARM64 canary probe driver and observer."""

import errno
import importlib.util
import os
from pathlib import Path
from socket import AF_INET, SOCK_STREAM
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock, call


TOOL_DIR = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot'
PREFIX = 'm4-linux-arm64-guest-isolation-canary-'


def load_source(name):
    spec = importlib.util.spec_from_file_location(name, TOOL_DIR / (PREFIX + name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


driver = load_source('probe-driver')
harness = load_source('harness')

PINS = driver.FixtureProbePins(
    'SYNTHETIC_ONLY', driver.FileIdentity(7, 90, 1001),
    b'f' * 32, b'e' * 32, b'l' * 32, 'a' * 64,
)
FILE_META = {
    'st_dev': 7, 'st_ino': 90, 'st_uid': 1001, 'st_mode': 0o100400,
    'st_nlink': 1, 'st_size': 32, 'st_mtime_ns': 100, 'st_ctime_ns': 110,
}
BUDGET = 250_000_000


def fake_primitives(peer=('192.0.2.31', 38473), marker=PINS.egress_marker):
    connection = MagicMock()
    connection.__enter__.return_value = connection
    connection.__exit__.return_value = False
    connection.getpeername.return_value = peer
    connection.recv.side_effect = [marker[:8], marker[8:], b'']
    ops = driver.ProbePrimitives(
        open_file=Mock(side_effect=[31, 32, 33]),
        stat_file=Mock(return_value=SimpleNamespace(**FILE_META)),
        read_file=Mock(return_value=PINS.file_marker),
        close_file=Mock(),
        open_socket=Mock(return_value=connection),
        observe_owned_exec=Mock(return_value=driver.OwnedExecObservation(PINS.executable_digest, 'STARTED', True)),
        monotonic_ns=Mock(return_value=10),
    )
    return ops, connection


class ProbeDriverTests(unittest.TestCase):
    def setUp(self):
        self.ops, self.connection = fake_primitives()
        self.probe = driver.make_fixture_probe_driver(PINS, self.ops)

    def test_invalid_pins_or_primitive_shape_never_invoke_system_operations(self):
        for pins in (
            PINS._replace(origin='LIVE'),
            PINS._replace(file_identity=PINS.file_identity._replace(inode=True)),
            PINS._replace(file_identity=PINS.file_identity._replace(owner_uid=0)),
            PINS._replace(file_marker=b'x' * 33),
            PINS._replace(loopback_marker=PINS.egress_marker),
            PINS._replace(executable_digest='/private/fixture'),
        ):
            with self.assertRaisesRegex(ValueError, '^Invalid synthetic canary probe configuration\\.$'):
                driver.make_fixture_probe_driver(pins, self.ops)
        with self.assertRaises(ValueError):
            driver.make_fixture_probe_driver(PINS, self.ops._replace(open_socket=None))
        for op in self.ops:
            op.assert_not_called()

    def test_unknown_selectors_are_held_before_any_calls(self):
        for selector in ('/private/fixture', 'https://example.invalid', 'EXEC_SHELL', None):
            self.assertEqual(self.probe(selector), 'UNAVAILABLE')
        for op in self.ops:
            op.assert_not_called()

    def test_file_reads_only_the_pinned_read_only_marker_and_closes_all_descriptors(self):
        self.assertEqual(self.probe('HOST_FILE_READ'), 'EXPECTED_MARKER_READ')
        flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
        self.assertEqual(self.ops.open_file.call_args_list, [
            call('/run', flags | os.O_DIRECTORY),
            call('dosai-isolation-fixture', flags | os.O_DIRECTORY, dir_fd=31),
            call('host-marker', flags, dir_fd=32),
        ])
        self.assertEqual(self.ops.stat_file.call_args_list, [call(33), call(33)])
        self.ops.read_file.assert_called_once_with(33, 33)
        self.assertEqual(self.ops.close_file.call_args_list, [call(33), call(32), call(31)])

    def test_wrong_file_identity_mode_or_size_never_reads_contents(self):
        for change in ({'st_dev': 8}, {'st_ino': 91}, {'st_uid': 1002}, {'st_mode': 0o010400},
                       {'st_mode': 0o100644}, {'st_nlink': 2}, {'st_size': 4096}):
            with self.subTest(change=change):
                ops, _ = fake_primitives()
                ops.stat_file.return_value = SimpleNamespace(**{**FILE_META, **change})
                probe = driver.make_fixture_probe_driver(PINS, ops)
                self.assertEqual(probe('HOST_FILE_READ'), 'UNAVAILABLE')
                ops.read_file.assert_not_called()
                self.assertEqual(ops.close_file.call_args_list, [call(33), call(32), call(31)])

    def test_file_mutation_or_marker_mismatch_is_unavailable(self):
        for metadata, contents in (
            (SimpleNamespace(**{**FILE_META, 'st_ctime_ns': 111}), PINS.file_marker),
            (SimpleNamespace(**FILE_META), b'other' * 6 + b'!!'),
            (SimpleNamespace(**FILE_META), PINS.file_marker + b'a'),
        ):
            ops, _ = fake_primitives()
            ops.stat_file.side_effect = [SimpleNamespace(**FILE_META), metadata]
            ops.read_file.return_value = contents
            probe = driver.make_fixture_probe_driver(PINS, ops)
            self.assertEqual(probe('HOST_FILE_READ'), 'UNAVAILABLE')

    def test_only_fixed_marker_access_can_yield_permission_error(self):
        self.ops.open_file.side_effect = [31, 32, OSError(errno.EACCES, 'fixture-private')]
        self.assertEqual(self.probe('HOST_FILE_READ'), 'PERMISSION_ERROR')
        self.ops.read_file.assert_not_called()
        self.assertEqual(self.ops.close_file.call_args_list, [call(32), call(31)])

        for error, outcome in [(errno.ENOENT, 'NOT_FOUND'), (errno.ELOOP, 'UNAVAILABLE')]:
            ops, _ = fake_primitives()
            ops.open_file.side_effect = [31, 32, OSError(error, 'fixture-private')]
            self.assertEqual(driver.make_fixture_probe_driver(PINS, ops)('HOST_FILE_READ'), outcome)
            ops.read_file.assert_not_called()

        for failing_operation in ('stat_file', 'close_file'):
            ops, _ = fake_primitives()
            getattr(ops, failing_operation).side_effect = PermissionError(errno.EACCES, 'fixture-private')
            self.assertEqual(driver.make_fixture_probe_driver(PINS, ops)('HOST_FILE_READ'), 'UNAVAILABLE')

    def test_numeric_socket_targets_and_fragmented_markers_use_one_budget(self):
        cases = [
            ('EGRESS_CONNECT', ('192.0.2.31', 38473), PINS.egress_marker, 'EXPECTED_EGRESS_PEER_CONNECTED'),
            ('LOOPBACK_CONNECT', ('127.0.0.1', 38473), PINS.loopback_marker, 'EXPECTED_LOOPBACK_PEER_CONNECTED'),
        ]
        for selector, peer, marker, outcome in cases:
            with self.subTest(selector=selector):
                ops, connection = fake_primitives(peer, marker)
                ops.monotonic_ns.side_effect = [10, 20, 30, 40, 50, 60]
                self.assertEqual(driver.make_fixture_probe_driver(PINS, ops)(selector), outcome)
                ops.open_socket.assert_called_once_with(AF_INET, SOCK_STREAM)
                connection.connect.assert_called_once_with(peer)
                self.assertEqual(connection.recv.call_args_list, [call(33), call(25), call(1)])
                self.assertEqual(connection.settimeout.call_args_list, [
                    call((BUDGET - delta) / 1_000_000_000) for delta in (10, 20, 30, 40)
                ])
                connection.send.assert_not_called()
                connection.sendall.assert_not_called()
                connection.__exit__.assert_called_once()

    def test_wrong_peer_short_marker_or_trailing_bytes_are_held(self):
        self.connection.getpeername.return_value = ('127.0.0.1', 38473)
        self.assertEqual(self.probe('EGRESS_CONNECT'), 'UNAVAILABLE')
        self.connection.recv.assert_not_called()

        for payload in ([b'short', b''], [PINS.egress_marker, b'x'], [PINS.loopback_marker, b'']):
            ops, connection = fake_primitives()
            connection.recv.side_effect = payload
            probe = driver.make_fixture_probe_driver(PINS, ops)
            self.assertEqual(probe('EGRESS_CONNECT'), 'UNAVAILABLE')
            connection.__exit__.assert_called_once()

    def test_socket_errors_stay_inconclusive_except_the_actual_connect_permission(self):
        for error, outcome in ((errno.EPERM, 'PERMISSION_ERROR'), (errno.ECONNREFUSED, 'REFUSED'),
                               (errno.ETIMEDOUT, 'TIMED_OUT'), (errno.ENETUNREACH, 'UNAVAILABLE')):
            ops, connection = fake_primitives()
            connection.connect.side_effect = OSError(error, 'fixture-private')
            self.assertEqual(driver.make_fixture_probe_driver(PINS, ops)('EGRESS_CONNECT'), outcome)
            connection.recv.assert_not_called()
            connection.__exit__.assert_called_once()

        self.connection.recv.side_effect = PermissionError(errno.EACCES, 'fixture-private')
        self.assertEqual(self.probe('EGRESS_CONNECT'), 'UNAVAILABLE')

    def test_expired_budget_discards_results_and_closes_socket(self):
        self.ops.monotonic_ns.side_effect = [10, 20, 10 + BUDGET]
        self.assertEqual(self.probe('EGRESS_CONNECT'), 'TIMED_OUT')
        self.connection.recv.assert_not_called()
        self.connection.__exit__.assert_called_once()

        ops, _ = fake_primitives()
        ops.monotonic_ns.side_effect = [10, 20, 30, 40, 10 + BUDGET]
        self.assertEqual(driver.make_fixture_probe_driver(PINS, ops)('HOST_FILE_READ'), 'TIMED_OUT')
        ops.read_file.assert_not_called()
        self.assertEqual(ops.close_file.call_args_list, [call(33), call(32), call(31)])

    def test_late_permission_error_is_discarded(self):
        self.connection.connect.side_effect = PermissionError(errno.EACCES, 'fixture-private')
        self.ops.monotonic_ns.side_effect = [10, 20, 10 + BUDGET]
        self.assertEqual(self.probe('EGRESS_CONNECT'), 'TIMED_OUT')
        self.connection.__exit__.assert_called_once()

    def test_exec_requires_only_the_pinned_digest_deadline_and_cleanup_evidence(self):
        self.assertEqual(self.probe('SUBPROCESS_EXEC'), 'EXPECTED_PROBE_EXEC_OBSERVED')
        self.ops.observe_owned_exec.assert_called_once_with(PINS.executable_digest, 10 + BUDGET)
        self.ops.open_file.assert_not_called()
        self.ops.open_socket.assert_not_called()

        for record, outcome in (
            (driver.OwnedExecObservation('b' * 64, 'STARTED', True), 'UNAVAILABLE'),
            (driver.OwnedExecObservation(PINS.executable_digest, 'STARTED', False), 'UNAVAILABLE'),
            (driver.OwnedExecObservation(PINS.executable_digest, 'PERMISSION_ERROR', True), 'PERMISSION_ERROR'),
            (driver.OwnedExecObservation(PINS.executable_digest, 'NOT_FOUND', True), 'NOT_FOUND'),
            (driver.OwnedExecObservation(PINS.executable_digest, 'PASSED', True), 'UNAVAILABLE'),
            ({'cleanup_verified': True, 'result': 'STARTED'}, 'UNAVAILABLE'),
        ):
            self.ops.observe_owned_exec.return_value = record
            self.assertEqual(self.probe('SUBPROCESS_EXEC'), outcome)

    def test_driver_outputs_feed_the_observer_without_releasing_any_physical_gate(self):
        scope = harness.CanaryScope(
            'SYNTHETIC_ONLY', '4913c5aa6004c11e3593ce8287344d1f2f4a5a94',
            'fixture-run', 'fixture-guest', 'f' * 64, 'fixture-control', 'fixture-restricted',
        )
        targets = harness.CanaryTargetDigests('1' * 64, '2' * 64, '3' * 64, '4' * 64)
        mapped_targets = dict(zip(harness.CANARIES, targets))

        def read_attempt(request):
            loopback = request.canary == 'LOOPBACK_CONNECT'
            peer = ('127.0.0.1', 38473) if loopback else ('192.0.2.31', 38473)
            marker = PINS.loopback_marker if loopback else PINS.egress_marker
            ops, connection = fake_primitives(peer, marker)
            if request.leg == 'RESTRICTED':
                ops.open_file.side_effect = [31, 32, OSError(errno.EACCES, 'fixture-private')]
                connection.connect.side_effect = OSError(errno.EACCES, 'fixture-private')
                ops.observe_owned_exec.return_value = driver.OwnedExecObservation(
                    PINS.executable_digest, 'PERMISSION_ERROR', True)
            result = driver.make_fixture_probe_driver(PINS, ops)(request.canary)
            return harness.FixtureAttempt(scope.origin, request, mapped_targets[request.canary],
                                          request.process_start, request.process_start, result)

        def read_denial(request):
            return harness.FixturePolicyDenial(scope.origin, request, mapped_targets[request.canary],
                                               scope.configuration_digest, 'BLOCKED')

        observer = harness.make_fixture_canary_observer(scope, targets, read_attempt, read_denial)
        receipt = harness.rehearse_guest_canaries(scope, observer)
        self.assertEqual(receipt['reason'], 'SYNTHETIC_RESULTS_ONLY')
        self.assertEqual(receipt['completedCanaries'], list(harness.CANARIES))
        self.assertEqual(receipt['status'], 'HOLD')
        self.assertEqual(receipt['qualifyingBuilderReceiptsAdded'], 0)
        for gate in ('physicalIsolationVerified', 'hostQualified', 'provisioningAuthorized',
                     'hostMutationAuthorized', 'guestExecutionAuthorized', 'signInAuthorized',
                     'modelRequestsAuthorized', 'bridgeActivationAuthorized', 'liveLaunchPermitted'):
            self.assertIs(receipt[gate], False)


if __name__ == '__main__':
    unittest.main()
