"""Offline fixtures only: no live proc, package or service-manager queries."""
import ast
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import time
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/p3-kernel-writer-diagnostic-v2.py'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


support = load('original_kernel_fixture_support', ROOT / 'tests/governance/p3-kernel-writer-diagnostic.test.py')
diag = load('kernel_writer_attribution', SOURCE)
v1 = support.diag
FIXTURES = json.loads((ROOT / 'tests/fixtures/p3/kernel-writer-attribution-v2.json').read_text())


class AttributionTests(unittest.TestCase):
    def setUp(self):
        support.DiagnosticTests.setUp(self)

    def query(self, argv, deadline):
        return support.DiagnosticTests.query(self, argv, deadline)

    def collect(self, query=None, module=diag, kernel=support.KERNEL, deadline=None):
        return module.collect(self.fd, 4242, kernel, {'fixture_only': True},
                              time.monotonic() + 7 if deadline is None else deadline,
                              query_function=query or self.query)

    def rejected(self, code, function, *args, **kwargs):
        with self.assertRaises(diag.Rejected) as raised:
            function(*args, **kwargs)
        self.assertEqual(raised.exception.code, code)
        self.assertEqual(diag.failure_line(raised.exception),
                         'DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2:' + code)
        return raised.exception

    def test_representative_mount_fixtures_preserve_original_acceptance(self):
        self.assertTrue(FIXTURES['synthetic_only'])
        self.assertFalse(FIXTURES['host_failure_cause_confirmed'])
        for case in FIXTURES['mount_cases']:
            with self.subTest(case=case['name']):
                raw = case['mountinfo'].replace('{device}', self.device).encode('ascii')
                (self.root / 'proc/4242/mountinfo').write_bytes(raw)
                self.calls.clear()
                if case['rejection'] is None:
                    self.assertEqual(self.collect(), self.collect(module=v1))
                else:
                    self.rejected(case['rejection'], self.collect)
                    with self.assertRaises(v1.Rejected):
                        self.collect(module=v1)
                    self.assertEqual(self.calls, [])

    def test_success_bytes_and_authority_fields_are_unchanged(self):
        result = self.collect()
        self.assertEqual(diag.encode(result), v1.encode(self.collect(module=v1)))
        self.assertTrue(result['diagnostic_only'])
        self.assertTrue(all(value is False for value in result['proofs'].values()))
        self.assertEqual(result['writer_inventory_scope'], 'FIXED_UNITS_ONLY_NON_ATOMIC')
        self.assertEqual(diag.commands(support.RELEASE), v1.commands(support.RELEASE))
        self.assertEqual((diag.MAX_QUERY_BYTES, diag.MAX_OUTPUT_BYTES), (4096, 65536))

    def test_optional_query_failures_stay_unknown_without_raw_error(self):
        (self.root / 'proc/version_signature').unlink()
        def unavailable(argv, deadline):
            self.calls.append(argv)
            raise OSError('DO_NOT_EMIT_QUERY_MARKER')
        result = self.collect(unavailable)
        self.assertEqual(diag.encode(result), v1.encode(self.collect(unavailable, module=v1)))
        self.assertEqual(result['kernel']['installed_package']['status'], 'UNKNOWN')
        self.assertTrue(all(unit['observation']['status'] == 'UNKNOWN' for unit in result['writer_units']))
        self.assertNotIn('DO_NOT_EMIT_QUERY_MARKER', diag.encode(result))
        self.assertEqual(len(self.calls), 10)  # Five per independent fixture collection; no retry.

    def test_missing_release_is_attributed_before_queries(self):
        (self.root / 'proc/sys/kernel/osrelease').unlink()
        self.rejected('KERNEL_RELEASE_READ', self.collect)
        self.assertEqual(self.calls, [])

    def test_oversized_and_symlink_release_remain_rejected(self):
        path = self.root / 'proc/sys/kernel/osrelease'
        path.write_bytes(b'x' * 257)
        self.rejected('KERNEL_RELEASE_READ', self.collect)
        with self.assertRaises(v1.Rejected): self.collect(module=v1)
        path.unlink()
        path.symlink_to(self.root / 'proc/version_signature')
        self.rejected('KERNEL_RELEASE_READ', self.collect)
        with self.assertRaises(OSError): self.collect(module=v1)

    def test_release_mismatch_is_distinct_from_unavailable_file(self):
        (self.root / 'proc/sys/kernel/osrelease').write_text('DO_NOT_EMIT_RELEASE_MARKER\n')
        self.rejected('KERNEL_RELEASE_MISMATCH', self.collect)
        self.assertEqual(self.calls, [])

    def test_native_and_release_command_preconditions_reject(self):
        other = os.uname_result(('Linux', 'ignored', support.RELEASE, 'ignored', 'aarch64'))
        self.rejected('NATIVE_PLATFORM', self.collect, kernel=other)
        unsafe = os.uname_result(('Linux', 'ignored', '../DO_NOT_EMIT_MARKER', 'ignored', 'x86_64'))
        self.rejected('COMMAND_PROJECTION', self.collect, kernel=unsafe)
        self.assertEqual(self.calls, [])

    def test_missing_registry_is_attributed(self):
        (self.root / 'proc/sys/fs/binfmt_misc').rmdir()
        self.rejected('REGISTRY_OPEN', self.collect)
        self.assertEqual(self.calls, [])

    def test_missing_mountinfo_is_attributed(self):
        (self.root / 'proc/4242/mountinfo').unlink()
        self.rejected('MOUNTINFO_READ', self.collect)
        self.assertEqual(self.calls, [])

    def test_mount_encoding_row_bound_and_inode_checks_stay_closed(self):
        for raw, code in [(b'\xff', 'MOUNTINFO_ENCODING'),
                          (b'bad\x1brow\n', 'MOUNTINFO_ENCODING'),
                          (self.mount.encode() * 513, 'MOUNTINFO_ROW_LIMIT')]:
            self.rejected(code, diag.mount_identity, raw, self.device, 1)
            with self.assertRaises((v1.Rejected, UnicodeError)):
                v1.mount_identity(raw, self.device, 1)
        self.rejected('MOUNTINFO_DEVICE_OR_INODE_MISMATCH', diag.mount_identity,
                      self.mount.encode(), self.device, 0)

    def test_missing_namespace_directory_and_link_are_distinct(self):
        link = self.root / 'proc/4242/ns/mnt'
        link.unlink()
        self.rejected('NAMESPACE_LINK_READ', self.collect)
        (self.root / 'proc/4242/ns/user').unlink()
        (self.root / 'proc/4242/ns').rmdir()
        self.rejected('NAMESPACE_READ', self.collect)

    def test_hostile_namespace_text_is_not_emitted(self):
        link = self.root / 'proc/4242/ns/mnt'
        link.unlink()
        link.symlink_to('/private/DO_NOT_EMIT_NAMESPACE_MARKER')
        error = self.rejected('NAMESPACE_ID_FORMAT', self.collect)
        self.assertNotIn('MARKER', diag.failure_line(error))
        self.assertEqual(self.calls, [])

    def test_namespace_recheck_detects_change_after_queries(self):
        def changing(argv, deadline):
            if not self.calls:
                link = self.root / 'proc/4242/ns/user'
                link.unlink()
                link.symlink_to('user:[999]')
            return self.query(argv, deadline)
        self.rejected('REGISTRY_RECHECK_CHANGED', self.collect, changing)
        self.assertEqual(len(self.calls), 5)

    def test_release_recheck_detects_changed_and_missing_content(self):
        path = self.root / 'proc/sys/kernel/osrelease'
        def changing(argv, deadline):
            path.write_text('changed\n')
            return self.query(argv, deadline)
        self.rejected('KERNEL_RELEASE_RECHECK_MISMATCH', self.collect, changing)
        path.write_text(support.RELEASE + '\n')
        def missing(argv, deadline):
            if path.exists(): path.unlink()
            return self.query(argv, deadline)
        self.rejected('KERNEL_RELEASE_RECHECK_READ', self.collect, missing)

    def test_deadline_and_output_failure_codes_do_not_expose_data(self):
        self.rejected('COLLECTION_DEADLINE', self.collect, deadline=time.monotonic() - 1)
        self.rejected('PROCESS_DEADLINE', diag.expired, None, None)
        self.rejected('QUERY_DEADLINE', diag.check, time.monotonic() - 1, 'QUERY_DEADLINE')
        self.rejected('OUTPUT_BOUND_OR_ENCODING', diag.at, 'OUTPUT_BOUND_OR_ENCODING',
                      diag.encode, {'data': 'DO_NOT_EMIT_OUTPUT_MARKER' * 4096})

    def test_context_requires_exact_first_attempt_and_native_fixed_fields(self):
        valid = {'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_JOB': 'builder_host_a',
                 'GITHUB_SHA': 'a' * 40, 'ImageOS': 'ubuntu24', 'ImageVersion': '20261023.334.3',
                 'DOSAI_RUNNER_ENVIRONMENT': 'github-hosted', 'DOSAI_RUNNER_OS': 'Linux',
                 'DOSAI_RUNNER_ARCH': 'X64'}
        with patch.dict(diag.os.environ, valid, clear=True):
            self.assertEqual(diag.context(), v1.context())
        for key in valid:
            invalid = dict(valid, **{key: 'DO_NOT_EMIT CONTEXT_MARKER\n'})
            with self.subTest(key=key), patch.dict(diag.os.environ, invalid, clear=True):
                self.rejected('CONTEXT_INVALID', diag.context)
        with patch.dict(diag.os.environ, dict(valid, GITHUB_RUN_ATTEMPT='2'), clear=True):
            self.rejected('CONTEXT_INVALID', diag.context)

    def test_failure_output_is_one_allowlisted_code_even_for_hostile_exceptions(self):
        for error in [OSError('DO_NOT_EMIT_ERROR_MARKER\nFORGED:record'),
                      diag.Rejected('DO_NOT_EMIT_ERROR_MARKER'), diag.Rejected(['hostile'])]:
            self.assertEqual(diag.failure_line(error),
                             'DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2:UNEXPECTED_FAILURE')
        error = diag.Rejected()
        error.code = 'DO_NOT_EMIT_MUTATED_MARKER'
        self.assertNotIn('MARKER', diag.failure_line(error))
        def hostile(): raise OSError('DO_NOT_EMIT_ERROR_MARKER')
        self.rejected('REGISTRY_STAT', diag.at, 'REGISTRY_STAT', hostile)
        def nested(): raise diag.Rejected('MOUNTINFO_ROW_FORMAT')
        self.rejected('MOUNTINFO_ROW_FORMAT', diag.at, 'MOUNTINFO_READ', nested)
        self.assertTrue(all(len(diag.failure_line(diag.Rejected(code))) < 128 for code in diag.FAILURE_CODES))

    def test_cli_rejects_before_root_open_and_prints_only_fixed_failure(self):
        stderr = io.StringIO()
        with patch.object(diag.sys, 'argv', ['diagnostic', '/caller/path']), \
             patch.object(diag.os, 'open') as opened, patch.object(diag, 'collect') as collected, \
             patch.object(diag.signal, 'setitimer'), patch.object(diag.sys, 'stderr', stderr):
            self.assertEqual(diag.main(), 2)
            opened.assert_not_called()
            collected.assert_not_called()
        self.assertEqual(stderr.getvalue(), 'DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2:ENTRY_PRECONDITION\n')

    def test_cli_root_open_failure_has_no_raw_error_or_query(self):
        stderr = io.StringIO()
        with patch.object(diag.sys, 'argv', ['diagnostic']), \
             patch.object(diag.platform, 'system', return_value='Linux'), \
             patch.object(diag.sys, 'flags', Mock(isolated=True)), \
             patch.object(diag.sys, 'dont_write_bytecode', True), \
             patch.object(diag.signal, 'signal'), patch.object(diag.signal, 'setitimer'), \
             patch.object(diag, 'context', return_value={'fixture_only': True}), \
             patch.object(diag.os, 'open', side_effect=OSError('DO_NOT_EMIT_ROOT_MARKER')), \
             patch.object(diag, 'collect') as collected, patch.object(diag.sys, 'stderr', stderr):
            self.assertEqual(diag.main(), 2)
            collected.assert_not_called()
        self.assertEqual(stderr.getvalue(), 'DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2:ROOT_OPEN\n')

    def test_cli_unexpected_exception_still_fails_closed_without_details(self):
        stderr = io.StringIO()
        with patch.object(diag.sys, 'argv', ['diagnostic']), \
             patch.object(diag.platform, 'system', return_value='Linux'), \
             patch.object(diag.sys, 'flags', Mock(isolated=True)), \
             patch.object(diag.sys, 'dont_write_bytecode', True), \
             patch.object(diag.signal, 'signal'), patch.object(diag.signal, 'setitimer'), \
             patch.object(diag, 'context', side_effect=ValueError('DO_NOT_EMIT_UNEXPECTED_MARKER')), \
             patch.object(diag.os, 'open') as opened, patch.object(diag.sys, 'stderr', stderr):
            self.assertEqual(diag.main(), 2)
            opened.assert_not_called()
        self.assertEqual(stderr.getvalue(), 'DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2:UNEXPECTED_FAILURE\n')

    def test_queries_reject_control_commands_before_launch(self):
        with patch.object(diag.subprocess, 'Popen') as popen:
            for argv in [('/bin/sh', '-c', 'anything'),
                         ('/usr/bin/systemctl', 'stop', diag.UNITS[0]),
                         ('/usr/bin/dpkg-query', '--show', '*')]:
                with self.assertRaises(diag.Rejected): diag.query(argv, time.monotonic() + 1)
            popen.assert_not_called()

    def test_mocked_query_overflow_retains_bounds_environment_and_owned_cleanup(self):
        child = Mock()
        child.stdout.fileno.return_value = 99
        child.poll.return_value = None
        with patch.object(diag.subprocess, 'Popen', return_value=child) as popen, \
             patch.object(diag.select, 'select', return_value=([child.stdout], [], [])), \
             patch.object(diag.os, 'read', return_value=b'x' * 4097):
            with self.assertRaises(diag.Rejected):
                diag.query(diag.commands(support.RELEASE)[0], time.monotonic() + 2)
            popen.assert_called_once()
            child.kill.assert_called_once()
            child.wait.assert_called_once()
            self.assertEqual(popen.call_args.kwargs['env'], {'LANG': 'C', 'LC_ALL': 'C', 'PATH': '/usr/bin:/bin'})
            self.assertEqual(popen.call_args.kwargs['stderr'], diag.subprocess.DEVNULL)
            self.assertNotIn('shell', popen.call_args.kwargs)

    def test_source_is_inactive_read_only_and_bound_to_unchanged_active_inputs(self):
        source = SOURCE.read_text()
        tree = ast.parse(source)
        attributes = {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)}
        self.assertTrue({'write', 'unlink', 'remove', 'mkdir', 'chmod', 'chown', 'execve'}.isdisjoint(attributes))
        for forbidden in ['sudo', 'cmdline', '/environ', 'requests', 'socket', 'shell=True']:
            self.assertNotIn(forbidden, source)
        self.assertEqual(source.count('subprocess.Popen('), 1)
        record = json.loads((ROOT / 'docs/architecture/p3-kernel-writer-attribution-source-record.json').read_text())
        self.assertEqual(record['status'], 'PREPARED_INACTIVE_NOT_DISPATCHED')
        self.assertFalse(record['observed_failure']['rejection_stage_known'])
        self.assertEqual(set(record['failure_codes']), diag.FAILURE_CODES)
        self.assertTrue(all(value is False for value in record['authorities'].values()))
        for path, digest in record['inputs'].items():
            self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), digest, path)
        for path in (ROOT / '.github/workflows').glob('*.yml'):
            self.assertNotIn('p3-kernel-writer-diagnostic-v2.py', path.read_text())
            self.assertNotIn('DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2', path.read_text())


if __name__ == '__main__': unittest.main()
