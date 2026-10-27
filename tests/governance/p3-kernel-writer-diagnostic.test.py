import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import types
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/p3-kernel-writer-diagnostic.py'
spec = importlib.util.spec_from_file_location('kernel_writer_diagnostic', SOURCE)
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)
RELEASE = '6.17.0-1022-azure'
KERNEL = os.uname_result(('Linux', 'UNRELATED_NODE_MARKER', RELEASE, 'UNRELATED_VERSION_MARKER', 'x86_64'))
PACKAGE = ('linux-image-' + RELEASE + '\t6.17.0-1022.22\tlinux-signed-azure\t6.17.0-1022.22\tinstalled\n').encode()


def unit_bytes(unit):
    return ('Id=' + unit + '\nLoadState=loaded\nActiveState=inactive\nSubState=dead\n'
            'UnitFileState=static\nNeedDaemonReload=no\nDropInPaths=/private/UNRELATED_MARKER.conf\n'
            'TriggeredBy=example.timer\n').encode()


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='dosai-kernel-writer-fixture-')
        self.root = Path(self.temp.name)
        for path in ['proc/sys/kernel', 'proc/sys/fs/binfmt_misc', 'proc/4242/ns']:
            (self.root / path).mkdir(parents=True, exist_ok=True)
        (self.root / 'proc/sys/kernel/osrelease').write_text(RELEASE + '\n')
        (self.root / 'proc/version_signature').write_text('Ubuntu 6.17.0-1022.22-azure 6.17.1\n')
        (self.root / 'proc/4242/ns/mnt').symlink_to('mnt:[100]')
        (self.root / 'proc/4242/ns/user').symlink_to('user:[101]')
        info = (self.root / 'proc/sys/fs/binfmt_misc').stat()
        self.device = '%d:%d' % (os.major(info.st_dev), os.minor(info.st_dev))
        self.mount = '42 1 %s / /proc/sys/fs/binfmt_misc rw,nosuid shared:1 - binfmt_misc binfmt_misc rw\n' % self.device
        (self.root / 'proc/4242/mountinfo').write_text(self.mount)
        self.fd = os.open(str(self.root), os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(os.close, self.fd)
        self.calls = []

    def query(self, argv, deadline):
        self.calls.append(argv)
        return PACKAGE if argv[0] == '/usr/bin/dpkg-query' else unit_bytes(argv[-1])

    def collect(self, query=None):
        return diag.collect(self.fd, 4242, KERNEL, {'fixture_only': True}, time.monotonic() + 7,
                            query_function=query or self.query)

    def test_complete_observations_never_authenticate_kernel_or_exclude_writers(self):
        result = self.collect()
        self.assertTrue(result['diagnostic_only'])
        self.assertTrue(all(v is False for v in result['proofs'].values()))
        self.assertEqual(len(self.calls), 5)
        self.assertEqual(result['kernel']['installed_package']['status'], 'OBSERVED')
        self.assertEqual(result['kernel']['installed_package']['data']['source_package'], 'linux-signed-azure')
        self.assertEqual(result['registry']['mnt'], 'mnt:[100]')
        self.assertEqual(result['writer_inventory_scope'], 'FIXED_UNITS_ONLY_NON_ATOMIC')
        self.assertEqual(len(result['writer_units']), 4)
        self.assertNotIn('UNRELATED_MARKER', diag.encode(result))
        self.assertNotIn('UNRELATED_NODE_MARKER', diag.encode(result))
        self.assertNotIn('UNRELATED_VERSION_MARKER', diag.encode(result))
        self.assertIn('UNLISTED_PRIVILEGED_WRITERS_NOT_EXCLUDED', result['gaps'])

    def test_absent_signature_package_or_unit_is_unknown_not_a_clean_boundary(self):
        (self.root / 'proc/version_signature').unlink()
        def unavailable(argv, deadline):
            raise FileNotFoundError('DO_NOT_EMIT_RAW_ERROR')
        result = self.collect(unavailable)
        self.assertEqual(result['kernel']['version_signature']['status'], 'UNKNOWN')
        self.assertEqual(result['kernel']['installed_package']['status'], 'UNKNOWN')
        self.assertTrue(all(u['observation']['status'] == 'UNKNOWN' for u in result['writer_units']))
        self.assertFalse(result['proofs']['single_writer_exclusion_proven'])
        self.assertNotIn('DO_NOT_EMIT_RAW_ERROR', diag.encode(result))

    def test_native_osrelease_and_mount_device_must_match(self):
        with self.assertRaises(diag.Rejected):
            diag.collect(self.fd, 4242, os.uname_result(('Linux', 'UNRELATED_NODE_MARKER', RELEASE, 'UNRELATED_VERSION_MARKER', 'aarch64')), {}, time.monotonic()+7, self.query)
        (self.root / 'proc/sys/kernel/osrelease').write_text('different\n')
        with self.assertRaises(diag.Rejected): self.collect()
        (self.root / 'proc/sys/kernel/osrelease').write_text(RELEASE+'\n')
        (self.root / 'proc/4242/mountinfo').write_text(self.mount.replace(self.device, '999:999'))
        with self.assertRaises(diag.Rejected): self.collect()

    def test_namespace_and_topology_changes_during_collection_reject(self):
        def changing(argv, deadline):
            link = self.root / 'proc/4242/ns/user'
            link.unlink(); link.symlink_to('user:[999]')
            return self.query(argv, deadline)
        with self.assertRaises(diag.Rejected): self.collect(changing)

    def test_links_fifo_traversal_and_invalid_namespace_are_rejected(self):
        path = self.root / 'proc/sys/kernel/osrelease'
        path.unlink(); path.symlink_to(self.root / 'proc/version_signature')
        with self.assertRaises(OSError): self.collect()
        path.unlink(); os.mkfifo(str(path))
        with self.assertRaises(diag.Rejected): self.collect()
        with self.assertRaises(diag.Rejected): diag.directory(self.fd, ('proc', '..'))
        link = self.root / 'proc/4242/ns/mnt'; link.unlink(); link.symlink_to('/private/UNRELATED_MARKER')
        with self.assertRaises(diag.Rejected): diag.namespaces(self.fd, 4242)

    def test_mount_parser_rejects_stacked_submount_unknown_fs_and_excessive_input(self):
        for raw in [self.mount+self.mount, self.mount.replace(' - binfmt_misc ', ' - ext4 '),
                    self.mount+'43 42 0:1 / /proc/sys/fs/binfmt_misc/entry rw - tmpfs tmpfs rw\n',
                    'bad\n', self.mount*513]:
            with self.assertRaises(diag.Rejected): diag.mount_identity(raw.encode(), self.device, 1)

    def test_fixed_file_bounds_and_deadlines(self):
        (self.root / 'proc/sys/kernel/osrelease').write_bytes(b'x'*257)
        with self.assertRaises(diag.Rejected): self.collect()
        with self.assertRaises(diag.Rejected): diag.read_fixed(self.fd, ('proc','4242','mountinfo'), 1, time.monotonic()+7)
        with self.assertRaises(diag.Rejected): diag.read_fixed(self.fd, ('proc','4242','mountinfo'), 65536, time.monotonic()-1)
        with self.assertRaises(diag.Rejected): diag.encode({'data': 'x'*65536})
        with self.assertRaises(diag.Rejected): diag.expired(None,None)

    def test_package_identity_does_not_accept_another_kernel_or_malformed_version(self):
        for raw in [PACKAGE.replace(RELEASE.encode(), b'other'), PACKAGE.replace(b'installed', b'config-files'),
                    PACKAGE+PACKAGE, PACKAGE.replace(b'6.17.0-1022.22', b'bad version'), b'\xff', b'x'*4097]:
            with self.assertRaises((diag.Rejected, UnicodeError)): diag.package_record(raw, RELEASE)

    def test_unit_unknown_duplicate_and_hostile_properties_remain_unknown(self):
        unit = diag.UNITS[0]
        for raw in [unit_bytes(unit)+b'Id=duplicate\n', unit_bytes(unit).replace(b'inactive', b'unrecognized-state'),
                    unit_bytes(unit)+b'Unexpected=1\n', unit_bytes(unit).replace(b'Id='+unit.encode(), b'Id=other.service'),
                    unit_bytes(unit).replace(b'dead', b'bad\x1bstate'), b'x'*4097]:
            result = diag.safe_observation(lambda r=raw: diag.unit_record(r, unit))
            self.assertEqual(result['status'], 'UNKNOWN')
            self.assertNotIn('data', result)
        self.assertEqual(diag.unit_record(unit_bytes(unit), unit)['trigger_count'], 1)

    def test_commands_are_only_exact_queries_and_never_accept_paths_or_wildcards(self):
        commands = diag.commands(RELEASE)
        self.assertEqual(len(commands), 5)
        self.assertEqual(commands[0][-1], 'linux-image-'+RELEASE)
        self.assertEqual({c[-1] for c in commands[1:]}, set(diag.UNITS))
        for value in ['../escape', '*', 'x;touch y', '-option', '6.17\nsecret']:
            with self.assertRaises(diag.Rejected): diag.commands(value)
        with patch.object(diag.subprocess, 'Popen') as popen:
            for argv in [('/bin/sh', '-c', 'anything'), ('/usr/bin/systemctl', 'restart', diag.UNITS[0]),
                         ('/usr/bin/dpkg-query', '--show', '*')]:
                with self.assertRaises(diag.Rejected): diag.query(argv, time.monotonic()+1)
            popen.assert_not_called()

    def test_bounded_query_terminates_only_its_owned_child_on_overflow(self):
        child = Mock(); child.stdout.fileno.return_value=99; child.poll.return_value=None
        with patch.object(diag.subprocess, 'Popen', return_value=child) as popen, \
             patch.object(diag.select, 'select', return_value=([child.stdout],[],[])), \
             patch.object(diag.os, 'read', return_value=b'x'*4097):
            with self.assertRaises(diag.Rejected): diag.query(diag.commands(RELEASE)[0], time.monotonic()+2)
            child.kill.assert_called_once(); child.wait.assert_called_once()
            self.assertEqual(popen.call_args.kwargs['stderr'], diag.subprocess.DEVNULL)
            self.assertEqual(popen.call_args.kwargs['env'], {'LANG':'C','LC_ALL':'C','PATH':'/usr/bin:/bin'})
            self.assertNotIn('shell', popen.call_args.kwargs)

    def test_query_timeout_does_not_retry_and_nonzero_output_is_not_admitted(self):
        child=Mock(); child.stdout.fileno.return_value=99; child.poll.return_value=None
        with patch.object(diag.subprocess,'Popen',return_value=child) as popen, \
             patch.object(diag.select,'select',return_value=([],[],[])):
            with self.assertRaises(diag.Rejected): diag.query(diag.commands(RELEASE)[0],time.monotonic()+2)
            popen.assert_called_once(); child.kill.assert_called_once()
        child=Mock(); child.stdout.fileno.return_value=99; child.poll.return_value=1; child.wait.return_value=1
        with patch.object(diag.subprocess,'Popen',return_value=child), \
             patch.object(diag.select,'select',return_value=([child.stdout],[],[])), \
             patch.object(diag.os,'read',return_value=b''):
            with self.assertRaises(diag.Rejected): diag.query(diag.commands(RELEASE)[0],time.monotonic()+2)
            child.kill.assert_not_called()

    def test_cli_rejects_arguments_before_opening_paths_or_launching_queries(self):
        with patch.object(diag.sys,'argv',['diagnostic','/caller/path']), \
             patch.object(diag,'collect') as collect, patch.object(diag.sys,'stderr'):
            self.assertEqual(diag.main(),2); collect.assert_not_called()

    def test_source_has_no_write_service_control_network_or_secret_collection(self):
        source=SOURCE.read_text(); tree=ast.parse(source)
        attributes={node.attr for node in ast.walk(tree) if isinstance(node,ast.Attribute)}
        self.assertTrue({'write','unlink','remove','mkdir','chmod','chown','execve'}.isdisjoint(attributes))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'system':
                self.assertIsInstance(node.func.value, ast.Name)
                self.assertEqual(node.func.value.id, 'platform')
        for forbidden in ['sudo','cmdline','/environ','/proc/*','URLSession','requests','socket','shell=True']:
            self.assertNotIn(forbidden,source)
        self.assertEqual(source.count('subprocess.Popen('),1)
        self.assertIn("'single_writer_exclusion_proven': False",source)
        record=json.loads((ROOT/'docs/architecture/p3-kernel-writer-diagnostic-source-record.json').read_text())
        self.assertEqual(record['status'],'PREPARED_INACTIVE_NOT_DISPATCHED')
        self.assertTrue(all(value is False for value in record['authorities'].values()))
        self.assertTrue(all(value is False for value in record['proofs'].values()))
        for path,digest in record['inputs'].items():
            self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),digest)
        self.assertEqual(hashlib.sha256((ROOT/'.github/workflows/p3-native-builder-host-feasibility.yml').read_bytes()).hexdigest(),
                         '1e8daa3e67ff54200dda1f0c587dfc1b9501341ddfb8608d4a0b52fbb03da53c')


if __name__=='__main__': unittest.main()
