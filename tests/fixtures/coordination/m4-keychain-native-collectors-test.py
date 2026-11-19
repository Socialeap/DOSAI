"""Offline-only tests. Each simulated API substitutes for a Darwin fact source."""

import ctypes
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch


SOURCE = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot/m4-keychain-native-collectors.py'
spec = importlib.util.spec_from_file_location('m4_metadata', SOURCE)
collector = importlib.util.module_from_spec(spec)
with patch.object(ctypes, 'CDLL', side_effect=AssertionError('Unexpected native library load')):
    spec.loader.exec_module(collector)

HOST = ('Mac16,10', '26A123')
LOGIN = (601, 42)
GRAPHICAL = (601, 601, 601, 42, collector.SESSION_HAS_GRAPHIC_ACCESS)
UNAVAILABLE = {
    'scope': 'SOURCE_ONLY', 'systemStore': 'UNAVAILABLE',
    'systemCredentialDenialVerified': False, 'hostQualified': False,
}


class QualificationCollectorsTest(unittest.TestCase):
    def setUp(self):
        self.source = Mock()
        self.source.host.return_value = ('arm64', *HOST)
        self.source.login.return_value = GRAPHICAL
        self.source.system_store_in_search_list.return_value = True

    def test_host_requires_the_reviewed_model_build_and_native_architecture(self):
        self.assertEqual(collector.collect_host(self.source, *HOST), 'MATCHED')
        for metadata in [('x86_64', *HOST), ('arm64', 'Mac16,11', HOST[1]), ('arm64', HOST[0], '26B1')]:
            self.source.host.return_value = metadata
            self.assertEqual(collector.collect_host(self.source, *HOST), 'MISMATCHED')

    def test_invalid_expected_platform_does_not_read_the_host(self):
        for target in [('Mac14,3', HOST[1]), (HOST[0], ''), (HOST[0], None), ({}, HOST[1])]:
            self.assertEqual(collector.collect_host(self.source, *target), 'REVIEWED_HOST_REQUIRED')
        self.source.host.assert_not_called()

    def test_mismatched_or_nonlocal_login_never_reads_search_list_metadata(self):
        for facts in [
            (0, 601, 601, 42, collector.SESSION_HAS_GRAPHIC_ACCESS),
            (601, 0, 601, 42, collector.SESSION_HAS_GRAPHIC_ACCESS),
            (601, 601, 602, 42, collector.SESSION_HAS_GRAPHIC_ACCESS),
            (601, 601, 601, 43, collector.SESSION_HAS_GRAPHIC_ACCESS),
            (601, 601, 601, 42, collector.SESSION_HAS_TTY),
            (601, 601, 601, 42, collector.SESSION_HAS_GRAPHIC_ACCESS | collector.SESSION_IS_ROOT),
            (601, 601, 601, 42, collector.SESSION_HAS_GRAPHIC_ACCESS | collector.SESSION_IS_REMOTE),
            (601, 601, 601, 42, 0x8000 | collector.SESSION_HAS_GRAPHIC_ACCESS),
        ]:
            self.source.login.return_value = facts
            self.assertEqual(collector.collect_system_store(self.source, *HOST, *LOGIN), UNAVAILABLE)
        self.source.system_store_in_search_list.assert_not_called()

    def test_reserved_or_invalid_login_ids_do_not_collect_login_metadata(self):
        for identity in [(0, 42), (1, True), (601, 0), (601, 0xfffffffe), (601, 0xffffffff)]:
            self.assertEqual(collector.collect_login(self.source, *identity), 'REVIEWED_LOGIN_REQUIRED')
        self.source.login.assert_not_called()

    def test_os_exception_holds_without_retaining_raw_diagnostics(self):
        self.source.host.side_effect = OSError('fixture-private-host')
        self.assertEqual(collector.collect_host(self.source, *HOST), 'UNAVAILABLE')
        self.source.host.side_effect = None
        self.source.login.side_effect = ValueError('fixture-private-login')
        self.assertEqual(collector.collect_login(self.source, *LOGIN), 'UNAVAILABLE')
        self.assertEqual(collector.collect_system_store(self.source, *HOST, *LOGIN), UNAVAILABLE)
        self.source.system_store_in_search_list.assert_not_called()

    def test_search_list_presence_and_absence_never_prove_enforcement(self):
        for observed, label in [
            (True, 'OBSERVED_IN_DEFAULT_SEARCH_LIST'), (False, 'NOT_OBSERVED_IN_DEFAULT_SEARCH_LIST'),
        ]:
            self.source.system_store_in_search_list.return_value = observed
            self.assertEqual(collector.collect_system_store(self.source, *HOST, *LOGIN),
                             {**UNAVAILABLE, 'systemStore': label})
        self.assertEqual(self.source.login.call_count, 4)

    def test_session_switch_or_missing_search_list_discards_observations(self):
        self.source.login.side_effect = [GRAPHICAL, (601, 601, 602, 42, GRAPHICAL[-1])]
        self.assertEqual(collector.collect_system_store(self.source, *HOST, *LOGIN), UNAVAILABLE)
        self.source.login.side_effect = None
        self.source.system_store_in_search_list.side_effect = OSError('fixture-private-store')
        self.assertEqual(collector.collect_system_store(self.source, *HOST, *LOGIN), UNAVAILABLE)

    def test_native_sysctl_binding_never_supplies_write_arguments(self):
        native = object.__new__(collector.DarwinMetadata)

        def sysctl(key, buffer, length, new_value, new_length):
            self.assertEqual(key, b'kern.osversion')
            self.assertIsNone(new_value)
            self.assertEqual(new_length, 0)
            buffer.value = b'26A123'
            length._obj.value = 7
            return 0

        native.sysctl = sysctl
        self.assertEqual(native.sysctl_text(b'kern.osversion'), '26A123')

    def test_native_login_uses_caller_security_session_and_releases_the_console_name(self):
        native = object.__new__(collector.DarwinMetadata)

        def session(selector, session_id, attributes):
            self.assertEqual(selector, 0xffffffff)
            session_id._obj.value = 42
            attributes._obj.value = collector.SESSION_HAS_GRAPHIC_ACCESS
            return 0

        def console_user(store, uid, gid):
            self.assertIsNone(store)
            self.assertIsNone(gid)
            uid._obj.value = 601
            return 21

        native.session = session
        native.console_user = console_user
        native.release = Mock()
        with patch.object(collector.os, 'getuid', return_value=601), \
                patch.object(collector.os, 'geteuid', return_value=601):
            self.assertEqual(native.login(), GRAPHICAL)
        native.release.assert_called_once_with(21)

    def test_store_metadata_classifies_without_returning_paths(self):
        native = object.__new__(collector.DarwinMetadata)

        def copy_search_list(stores):
            stores._obj.value = 1
            return 0

        def store_path(_store, length, buffer):
            path = b'/Library/Keychains/System.keychain'
            buffer.value = path
            length._obj.value = len(path)
            return 0

        native.copy_search_list = copy_search_list
        native.array_count = Mock(return_value=1)
        native.array_value = Mock(return_value=2)
        native.store_path = store_path
        native.release = Mock()
        self.assertIs(native.system_store_in_search_list(), True)
        native.release.assert_called_once()
        native.array_count.return_value = 33
        with self.assertRaises(ValueError):
            native.system_store_in_search_list()
        self.assertEqual(native.release.call_count, 2)


if __name__ == '__main__':
    unittest.main()
