import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/p3-binfmt-diagnostic.py'
spec = importlib.util.spec_from_file_location('binfmt_diagnostic', SOURCE)
diagnostic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostic)

MAGIC = b'enabled\ninterpreter /usr/bin/qemu-aarch64-static\nflags: POCF\noffset 0\nmagic 7f454c46\nmask ffffffff\n'
EXTENSION = b'disabled\ninterpreter /usr/bin/example\nflags: \nextension .exe\n'


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='dosai-binfmt-fixture-')
        self.root = Path(self.temp.name)
        (self.root / 'status').write_bytes(b'enabled\n')
        (self.root / 'register').write_bytes(b'NEVER_READ_THIS_CONTROL_FILE')
        self.fd = os.open(str(self.root), os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(os.close, self.fd)

    def collect(self):
        return diagnostic.collect(self.fd, time.monotonic() + 1.5)

    def test_empty_inventory_is_diagnostic_only(self):
        result = self.collect()
        self.assertEqual(result, {'global_enabled': True, 'entries': []})
        line = diagnostic.encode(result, {})
        decoded = json.loads(line[len(diagnostic.PREFIX):])
        self.assertTrue(decoded['diagnostic_only'])
        self.assertNotIn('PASS_CANDIDATE_HOSTS_ONLY', line)
        self.assertNotIn('DOSAI_HOST_OBSERVATION_V1', line)

    def test_enabled_disabled_qemu_and_extension_entries(self):
        for name, data in [('qemu-aarch64', MAGIC), ('ordinary', EXTENSION)]:
            (self.root / name).write_bytes(data)
        result = self.collect()['entries']
        self.assertEqual([e['name'] for e in result], ['ordinary', 'qemu-aarch64'])
        self.assertEqual([e['enabled'] for e in result], [False, True])
        self.assertEqual(result[1]['sha256'], hashlib.sha256(MAGIC).hexdigest())
        self.assertEqual((self.root / 'register').read_bytes(), b'NEVER_READ_THIS_CONTROL_FILE')

    def test_global_disabled_is_reported_not_admitted(self):
        (self.root / 'status').write_bytes(b'disabled\n')
        (self.root / 'ordinary').write_bytes(EXTENSION)
        self.assertFalse(self.collect()['global_enabled'])
        self.assertEqual(len(self.collect()['entries']), 1)

    def test_unknown_duplicate_hostile_and_invalid_encoding_rejected(self):
        cases = [MAGIC + b'extra x\n', MAGIC.replace(b'offset 0', b'offset 0\noffset 1'),
                 MAGIC.replace(b'POCF', b'Z'), MAGIC.replace(b'POCF', b'PP'),
                 MAGIC.replace(b'/usr/bin/qemu-aarch64-static', b'../../escape'),
                 MAGIC.replace(b'/usr/bin/qemu-aarch64-static', b'/usr/bin/evil\x1b[0m'),
                 MAGIC.replace(b'/usr/bin/qemu-aarch64-static', b'/bin/$(touch x)'),
                 MAGIC.replace(b'offset 0', b'offset 999'), MAGIC.replace(b'7f454c46', b'bad'),
                 MAGIC.replace(b'ffffffff', b'ff'), MAGIC[:-1], b'\xff\n']
        for data in cases:
            with self.subTest(data=data):
                with self.assertRaises((diagnostic.Rejected, UnicodeError)):
                    diagnostic.parse_entry('fixture', data)

    def test_maximum_entry_and_output_bounds(self):
        for i in range(32):
            (self.root / ('entry%02d' % i)).write_bytes(EXTENSION)
        self.assertEqual(len(self.collect()['entries']), 32)
        (self.root / 'entry32').write_bytes(EXTENSION)
        with self.assertRaises(diagnostic.Rejected):
            self.collect()
        with self.assertRaises(diagnostic.Rejected):
            diagnostic.encode({'data': 'x' * diagnostic.MAX_OUTPUT}, {})

    def test_oversized_unreadable_and_special_files_rejected(self):
        path = self.root / 'entry'
        path.write_bytes(b'x' * 4097)
        with self.assertRaises(diagnostic.Rejected):
            self.collect()
        path.unlink()
        path.symlink_to(self.root / 'status')
        with self.assertRaises(diagnostic.Rejected):
            self.collect()
        path.unlink()
        os.mkfifo(str(path))
        with self.assertRaises(diagnostic.Rejected):
            self.collect()
        path.unlink()
        path.write_bytes(EXTENSION)
        with patch.object(diagnostic, 'read_entry', side_effect=PermissionError()):
            with self.assertRaises(PermissionError):
                self.collect()

    def test_inventory_changes_and_deadline_rejected(self):
        original = diagnostic.snapshot
        calls = [0]
        def changing(fd, deadline):
            calls[0] += 1
            if calls[0] == 2:
                (self.root / 'late').write_bytes(EXTENSION)
            return original(fd, deadline)
        with patch.object(diagnostic, 'snapshot', side_effect=changing):
            with self.assertRaises(diagnostic.Rejected):
                self.collect()
        with self.assertRaises(diagnostic.Rejected):
            diagnostic.collect(self.fd, time.monotonic() - 1)

    def test_replaced_entry_and_mid_scan_changes_rejected(self):
        path = self.root / 'entry'
        path.write_bytes(EXTENSION)
        real_read = diagnostic.os.read
        def replacing(fd, count):
            value = real_read(fd, count)
            if value == EXTENSION:
                path.unlink()
                path.write_bytes(EXTENSION)
            return value
        with patch.object(diagnostic.os, 'read', side_effect=replacing):
            with self.assertRaises(diagnostic.Rejected):
                self.collect()

    def test_controls_required_and_status_strict(self):
        for value in [b'', b'enabled', b'unknown\n', b'enabled\nextra\n']:
            (self.root / 'status').write_bytes(value)
            with self.assertRaises(diagnostic.Rejected):
                self.collect()
        (self.root / 'status').unlink()
        with self.assertRaises(diagnostic.Rejected):
            self.collect()

    def test_context_is_exact_and_does_not_dump_ambient_environment(self):
        env = {'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1',
               'GITHUB_JOB': 'builder_host_a', 'GITHUB_SHA': 'a' * 40,
               'ImageOS': 'ubuntu24', 'ImageVersion': '20261012.334.1',
               'DOSAI_RUNNER_ENVIRONMENT': 'github-hosted', 'DOSAI_RUNNER_OS': 'Linux',
               'DOSAI_RUNNER_ARCH': 'X64', 'UNRELATED_TEST_MARKER': 'DO_NOT_EMIT'}
        with patch.dict(os.environ, env, clear=True), patch.object(diagnostic.platform, 'system', return_value='Linux'), patch.object(diagnostic.platform, 'machine', return_value='x86_64'):
            self.assertNotIn('UNRELATED_TEST_MARKER', diagnostic.context())
            os.environ['DOSAI_RUNNER_ARCH'] = 'ARM64'
            with self.assertRaises(diagnostic.Rejected):
                diagnostic.context()

    def test_cli_rejects_arguments_without_collecting(self):
        with patch.object(diagnostic.sys, 'argv', ['diagnostic', '/caller/path']), patch.object(diagnostic, 'collect') as collect, patch.object(diagnostic.sys, 'stderr'):
            self.assertEqual(diagnostic.main(), 2)
            collect.assert_not_called()

    def test_every_fixed_root_component_refuses_symlinks(self):
        # Traverse only the test directory; no live /proc inspection occurs.
        target = self.root / 'target'
        target.mkdir()
        alias = self.root / 'alias'
        alias.symlink_to(target, target_is_directory=True)
        components = self.root.parts[1:] + ('alias',)
        with patch.object(diagnostic, 'ROOT_COMPONENTS', components):
            with self.assertRaises(OSError):
                diagnostic.open_root()

    def test_source_has_read_only_fixed_authority(self):
        tree = ast.parse(SOURCE.read_text())
        imports = {alias.name for node in ast.walk(tree) if isinstance(node, ast.Import)
                   for alias in node.names}
        self.assertEqual(imports, {'hashlib', 'json', 'os', 'platform', 're',
                                  'signal', 'stat', 'sys', 'time'})
        forbidden = {'write', 'unlink', 'remove', 'rename', 'mkdir', 'system',
                     'execv', 'execve', 'spawn', 'popen', 'chmod', 'chown',
                     'eval', 'exec', '__import__'}
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, 'id', '')
                if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'platform' and name == 'system':
                    continue  # OS identity read, not os.system process execution.
                self.assertNotIn(name, forbidden)
        self.assertEqual(diagnostic.ROOT_COMPONENTS, ('proc', 'sys', 'fs', 'binfmt_misc'))
        with self.assertRaises(diagnostic.Rejected):
            diagnostic.expired(None, None)

    def test_candidate_shell_programs_are_syntax_valid(self):
        source = (ROOT / 'docs/proposals/p3-native-builder-host-feasibility-diagnostic.yml').read_text()
        programs = []
        for segment in source.split('        run: |\n')[1:]:
            lines = []
            for line in segment.splitlines():
                if line and not line.startswith('          '):
                    break
                lines.append(line[10:] if line else '')
            programs.append('\n'.join(lines) + '\n')
        self.assertEqual(len(programs), 2)
        for program in programs:
            result = subprocess.run(['/bin/bash', '-n'], input=program.encode(),
                                    capture_output=True, timeout=2)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_activated_candidate_only_adds_diagnostics_to_historical_workflow(self):
        original = (ROOT / 'docs/proposals/p3-native-builder-host-feasibility-pre-diagnostic.yml').read_text()
        self.assertEqual(hashlib.sha256(original.encode()).hexdigest(),
                         '6d04426acf2f30e406a4d948861951813146c20f80196e315feec070cf101d63')
        record = json.loads((ROOT / 'docs/architecture/p3-binfmt-diagnostic-source-record.json').read_text())
        self.assertEqual(record['status'], 'PREPARED_INACTIVE_NOT_DISPATCHED')
        self.assertTrue(record['existing_rejection_preserved'])
        self.assertTrue(record['authorities'])
        self.assertTrue(all(value is False for value in record['authorities'].values()))
        for path, expected_digest in record['inputs'].items():
            historical_path = 'docs/proposals/p3-native-builder-host-feasibility-pre-diagnostic.yml' if path == '.github/workflows/p3-native-builder-host-feasibility.yml' else path
            self.assertEqual(hashlib.sha256((ROOT / historical_path).read_bytes()).hexdigest(), expected_digest)
        code = SOURCE.read_text()
        snippet = "          timeout --signal=KILL 5s python3 -I -B - <<'DOSAI_BINFMT_PY' || fail BINFMT_DIAGNOSTIC_REJECTED\n"
        snippet += ''.join(('          ' + line if line else '') + '\n' for line in code.splitlines())
        snippet += '          DOSAI_BINFMT_PY\n'
        anchor = '          active_binfmt="$(find /proc/sys/fs/binfmt_misc'
        expected = original.replace(anchor, snippet + anchor)
        candidate = (ROOT / 'docs/proposals/p3-native-builder-host-feasibility-diagnostic.yml').read_text()
        self.assertEqual(candidate, expected)
        self.assertEqual((ROOT / '.github/workflows/p3-native-builder-host-feasibility.yml').read_text(), candidate)
        self.assertEqual(candidate.count('|| fail BINFMT_MISC_INTERPRETER_ACTIVE'), 2)
        self.assertEqual(candidate.count('no_active_binfmt_misc_interpreters:true'), 2)
        self.assertNotIn('sudo', candidate)
        self.assertNotIn('uses:', candidate)
        # Diagnostic output never changes the original rejection, even if disabled.
        gate = next(line.strip() for line in original.splitlines() if 'active_binfmt="$(find' in line)
        gate += '\ntest -z "$active_binfmt" || exit 1'
        gate = gate.replace('/proc/sys/fs/binfmt_misc', '"$1"')
        empty = subprocess.run(['/bin/bash', '-c', gate, 'fixture', str(self.root)],
                               capture_output=True, timeout=2)
        self.assertEqual(empty.returncode, 0)
        for data in (MAGIC, EXTENSION):
            (self.root / 'entry').write_bytes(data)
            run = subprocess.run(['/bin/bash', '-c', gate, 'fixture', str(self.root)],
                                 capture_output=True, timeout=2)
            self.assertEqual(run.returncode, 1)


if __name__ == '__main__':
    unittest.main()
