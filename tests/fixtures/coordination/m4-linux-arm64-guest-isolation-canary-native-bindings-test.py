"""Offline binding tests. Native file and socket operations are substituted."""

import errno
import importlib.util
import os
from pathlib import Path
import socket
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock, call, patch


SOURCE = (Path(__file__).resolve().parents[3]
          / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-probe-driver.py')
spec = importlib.util.spec_from_file_location('probe_driver', SOURCE)
driver = importlib.util.module_from_spec(spec)
with (patch.object(os, 'uname', side_effect=AssertionError('uname at import')),
      patch.object(os, 'open', side_effect=AssertionError('open at import')),
      patch.object(socket, 'socket', side_effect=AssertionError('socket at import'))):
    spec.loader.exec_module(driver)

PINS = driver.FixtureProbePins(
    'SYNTHETIC_ONLY', driver.FileIdentity(7, 90, 1001),
    b'f' * 32, b'e' * 32, b'l' * 32, 'a' * 64,
)
LINUX = SimpleNamespace(sysname='Linux', machine='aarch64')
FILE_META = SimpleNamespace(
    st_dev=7, st_ino=90, st_uid=1001, st_mode=0o100400,
    st_nlink=1, st_size=32, st_mtime_ns=100, st_ctime_ns=110,
)


class NativeBindingTests(unittest.TestCase):
    def substitute(self, module, name, replacement):
        patcher = patch.object(module, name, replacement)
        patcher.start()
        self.addCleanup(patcher.stop)
        return replacement

    def setUp(self):
        self.uname = self.substitute(os, 'uname', Mock(return_value=LINUX))
        self.owner = object()
        self.thread = self.substitute(driver, 'current_thread', Mock(return_value=self.owner))
        self.clock = self.substitute(driver, 'monotonic_ns', Mock(return_value=11))
        self.open_file = self.substitute(os, 'open', Mock(side_effect=[31, 32, 33]))
        self.stat_file = self.substitute(os, 'fstat', Mock(return_value=FILE_META))
        self.read_file = self.substitute(os, 'read', Mock(return_value=PINS.file_marker))
        self.close_file = self.substitute(os, 'close', Mock())
        self.connection = MagicMock()
        self.connection.__enter__.return_value = self.connection
        self.connection.__exit__.return_value = False
        self.connection.getpeername.return_value = ('192.0.2.31', 38473)
        self.connection.recv.side_effect = [PINS.egress_marker, b'']
        self.socket = self.substitute(socket, 'socket', Mock(return_value=self.connection))
        self.resolve = self.substitute(socket, 'getaddrinfo', Mock(side_effect=AssertionError('DNS used')))
        self.scope = Mock(return_value=True)
        self.exec_probe = Mock(return_value=driver.OwnedExecObservation(PINS.executable_digest, 'STARTED', True))

    def prepare(self, canary='HOST_FILE_READ'):
        return driver.prepare_linux_arm64_canary_attempt(PINS, canary, self.scope, self.exec_probe)

    def assert_no_probe_calls(self):
        for operation in (self.clock, self.open_file, self.stat_file, self.read_file,
                          self.close_file, self.socket, self.exec_probe, self.resolve):
            operation.assert_not_called()

    def test_preparation_only_checks_platform_and_rejects_non_arm64_linux(self):
        self.assertTrue(callable(self.prepare()))
        self.uname.assert_called_once()
        self.scope.assert_not_called()
        self.assert_no_probe_calls()

        for platform in (SimpleNamespace(sysname='Darwin', machine='arm64'),
                         SimpleNamespace(sysname='Linux', machine='x86_64')):
            self.uname.return_value = platform
            with self.assertRaisesRegex(OSError, '^Linux ARM64 is required for native canaries\\.$'):
                self.prepare()
        self.scope.assert_not_called()
        self.assert_no_probe_calls()

    def test_invalid_pins_selectors_and_missing_dependencies_stop_before_platform_probe(self):
        for pins, selector, guard, exec_probe in (
            (PINS._replace(origin='LIVE'), 'HOST_FILE_READ', self.scope, self.exec_probe),
            (PINS, 'https://example.invalid', self.scope, self.exec_probe),
            (PINS, '/private/fixture', self.scope, self.exec_probe),
            (PINS, 'SUBPROCESS_EXEC', None, self.exec_probe),
            (PINS, 'SUBPROCESS_EXEC', self.scope, None),
        ):
            with self.assertRaisesRegex(ValueError, '^Invalid native canary binding configuration\\.$'):
                driver.prepare_linux_arm64_canary_attempt(pins, selector, guard, exec_probe)
        self.uname.assert_not_called()
        self.scope.assert_not_called()
        self.assert_no_probe_calls()

    def test_denied_ambiguous_or_failed_scope_consumes_one_attempt_without_operations(self):
        for decision in (False, 1, 'ACTIVE'):
            with self.subTest(decision=decision):
                attempt = self.prepare()
                self.scope.return_value = decision
                self.assertEqual(attempt(), 'UNAVAILABLE')
                self.scope.return_value = True
                self.assertEqual(attempt(), 'UNAVAILABLE')
        self.scope.side_effect = PermissionError(errno.EACCES, 'fixture-private')
        self.assertEqual(self.prepare()(), 'UNAVAILABLE')
        self.assert_no_probe_calls()

    def test_other_thread_cannot_use_attempt_and_owner_only_executes_once(self):
        attempt = self.prepare()
        self.thread.return_value = object()
        self.assertEqual(attempt(), 'UNAVAILABLE')
        self.scope.assert_not_called()
        self.assert_no_probe_calls()
        self.thread.return_value = self.owner
        self.assertEqual(attempt(), 'EXPECTED_MARKER_READ')
        self.assertEqual(attempt(), 'UNAVAILABLE')
        self.read_file.assert_called_once_with(33, 33)

    def test_file_bindings_use_fixed_descriptor_relative_operations_and_close(self):
        self.assertEqual(self.prepare()(), 'EXPECTED_MARKER_READ')
        flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
        self.assertEqual(self.open_file.call_args_list, [
            call('/run', flags | os.O_DIRECTORY),
            call('dosai-isolation-fixture', flags | os.O_DIRECTORY, dir_fd=31),
            call('host-marker', flags, dir_fd=32),
        ])
        self.assertEqual(self.stat_file.call_args_list, [call(33), call(33)])
        self.read_file.assert_called_once_with(33, 33)
        self.assertEqual(self.close_file.call_args_list, [call(33), call(32), call(31)])
        self.assertTrue(self.scope.call_args_list)
        self.assertTrue(all(item == call('HOST_FILE_READ') for item in self.scope.call_args_list))
        self.socket.assert_not_called()
        self.exec_probe.assert_not_called()

    def test_file_scope_revocation_discards_read_and_preserves_descriptor_cleanup(self):
        def finish_read(*_):
            self.scope.return_value = False
            return PINS.file_marker

        self.read_file.side_effect = finish_read
        self.assertEqual(self.prepare()(), 'UNAVAILABLE')
        self.stat_file.assert_called_once_with(33)
        self.read_file.assert_called_once_with(33, 33)
        self.assertEqual(self.close_file.call_args_list, [call(33), call(32), call(31)])

    def test_scope_change_between_budget_and_open_never_opens_file(self):
        self.scope.side_effect = [True, False]
        self.assertEqual(self.prepare()(), 'UNAVAILABLE')
        self.clock.assert_called_once()
        self.open_file.assert_not_called()
        self.close_file.assert_not_called()

    def test_native_socket_bindings_use_only_fixed_peers_without_name_resolution_or_send(self):
        for canary, peer, marker, result in (
            ('EGRESS_CONNECT', ('192.0.2.31', 38473), PINS.egress_marker, 'EXPECTED_EGRESS_PEER_CONNECTED'),
            ('LOOPBACK_CONNECT', ('127.0.0.1', 38473), PINS.loopback_marker, 'EXPECTED_LOOPBACK_PEER_CONNECTED'),
        ):
            with self.subTest(canary=canary):
                self.connection.reset_mock()
                self.socket.reset_mock()
                self.connection.getpeername.return_value = peer
                self.connection.recv.side_effect = [marker, b'']
                self.assertEqual(self.prepare(canary)(), result)
                self.socket.assert_called_once_with(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP)
                self.connection.connect.assert_called_once_with(peer)
                self.assertEqual(self.connection.recv.call_args_list, [call(33), call(1)])
                self.connection.__exit__.assert_called_once()
                for operation in (self.connection.send, self.connection.sendall, self.connection.bind,
                                  self.connection.listen, self.resolve):
                    operation.assert_not_called()
        self.open_file.assert_not_called()
        self.exec_probe.assert_not_called()

    def test_socket_guard_exception_during_connection_is_unavailable_and_closes(self):
        def revoke(_):
            self.scope.side_effect = PermissionError(errno.EACCES, 'fixture-private-scope')

        self.connection.settimeout.side_effect = revoke
        self.assertEqual(self.prepare('EGRESS_CONNECT')(), 'UNAVAILABLE')
        self.connection.connect.assert_not_called()
        self.connection.recv.assert_not_called()
        self.connection.__exit__.assert_called_once()

    def test_kernel_permission_on_actual_connect_remains_a_raw_outcome(self):
        self.connection.connect.side_effect = PermissionError(errno.EACCES, 'fixture-private-kernel')
        self.assertEqual(self.prepare('EGRESS_CONNECT')(), 'PERMISSION_ERROR')
        self.connection.recv.assert_not_called()
        self.connection.__exit__.assert_called_once()

    def test_exec_delegates_pinned_digest_and_deadline_and_checks_returned_cleanup(self):
        attempt = self.prepare('SUBPROCESS_EXEC')
        self.assertEqual(attempt(), 'EXPECTED_PROBE_EXEC_OBSERVED')
        self.assertEqual(attempt(), 'UNAVAILABLE')
        self.exec_probe.assert_called_once_with(PINS.executable_digest, 250_000_011)
        self.open_file.assert_not_called()
        self.socket.assert_not_called()

        self.exec_probe.return_value = driver.OwnedExecObservation(PINS.executable_digest, 'STARTED', False)
        self.assertEqual(self.prepare('SUBPROCESS_EXEC')(), 'UNAVAILABLE')


if __name__ == '__main__':
    unittest.main()
