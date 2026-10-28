"""Offline inputs only. Never invoke the live collector entrypoint."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('topology', ROOT / 'scripts/p3-mount-topology-diagnostic-v1.py')
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)
BASE = '42 1 0:42 / /proc/sys/fs/binfmt_misc rw - binfmt_misc binfmt_misc rw\n'


class TopologyTests(unittest.TestCase):
    def project(self, text=BASE):
        return diag.project(text.encode('ascii'), 'mnt:[100]', 'user:[101]')

    def test_root_filesystem_and_automount_causes_are_distinguishable_without_qualification(self):
        for text, expected in [(BASE, [('binfmt_misc', 'FULL_ROOT')]),
            (BASE.replace(' / /proc', ' /subdir /proc'), [('binfmt_misc', 'OTHER_ROOT')]),
            (BASE.replace('binfmt_misc binfmt_misc rw', 'tmpfs tmpfs rw'), [('tmpfs', 'FULL_ROOT')]),
            ('41 1 0:41 / /proc/sys/fs/binfmt_misc rw - autofs systemd-1 rw\n' + BASE,
             [('autofs', 'FULL_ROOT'), ('binfmt_misc', 'FULL_ROOT')])]:
            result = self.project(text)
            self.assertEqual([(r['filesystem'], r['root_class']) for r in result['rows']], expected)
            self.assertFalse(result['qualification_proven'])
            self.assertFalse(result['execution_authorized'])
            self.assertFalse(result['single_writer_exclusion_proven'])
            self.assertEqual(result['builder_receipts'], 0)

    def test_missing_target_and_submounts_are_observed_not_accepted(self):
        result = self.project('1 2 0:1 / / rw - tmpfs tmpfs rw\n')
        self.assertEqual(result['target_rows'], 0)
        result = self.project(BASE + '43 42 0:43 / /proc/sys/fs/binfmt_misc/child ro - tmpfs tmpfs ro\n')
        self.assertEqual(result['submount_rows'], 1)
        self.assertEqual(result['rows'][-1]['access'], 'READ_ONLY')

    def test_arbitrary_paths_sources_and_roots_are_not_disclosed(self):
        text = BASE.replace(' / /proc', ' /PRIVATE_MARKER /proc')
        text += '50 1 0:50 / /PRIVATE_MARKER rw - tmpfs PRIVATE_MARKER rw\n'
        self.assertNotIn('PRIVATE_MARKER', str(self.project(text)))

    def test_malformed_duplicate_and_unbounded_inputs_reject(self):
        for data in [b'', b'bad', BASE.encode() * 2, b'\xff', b'x' * (diag.MAX_BYTES + 1),
                     BASE.replace('rw -', 'ro,rw -').encode(),
                     BASE.replace('42 1', '0 1').encode(),
                     BASE.replace(' / /proc', ' /bad\\077 /proc').encode(),
                     (BASE.rstrip() + '\t\n').encode(),
                     b'1 2 0:1 / / rw - tmpfs tmpfs rw\n' * (diag.MAX_ROWS + 1)]:
            with self.subTest(data=data[:20]), self.assertRaises((ValueError, UnicodeError)):
                diag.project(data, 'mnt:[100]', 'user:[101]')
        projected = ''.join(BASE.replace('42 1', str(i) + ' 1') for i in range(1, 34))
        with self.assertRaises(ValueError): self.project(projected)

    def test_namespace_types_and_native_identity_fail_closed_before_reads(self):
        for namespace in [None, ['mnt:[100]'], 'mnt:[0]', 'mnt:[100]\n']:
            with self.assertRaises(ValueError): diag.project(BASE.encode(), namespace, 'user:[101]')
        for identity in [('Darwin', 'arm64'), ('Linux', 'aarch64'), ('Linux', 'amd64')]:
            read = Mock()
            with self.assertRaises(ValueError): diag.collect(read, Mock(), lambda: identity)
            read.assert_not_called()

    def test_unreadable_timeout_and_namespace_change_reject(self):
        for error in [PermissionError(), TimeoutError(), OSError()]:
            with self.assertRaises(type(error)):
                diag.collect(Mock(side_effect=error), lambda name: name + ':[100]', lambda: ('Linux', 'x86_64'))
        ns = Mock(side_effect=['mnt:[100]', 'user:[101]', 'mnt:[200]', 'user:[101]'])
        with self.assertRaises(ValueError): diag.collect(lambda: BASE.encode(), ns, lambda: ('Linux', 'x86_64'))

    def test_main_fixed_failure_does_not_echo_errors_or_inputs(self):
        with patch.object(diag.sys, 'argv', ['diagnostic']), patch.object(diag.signal, 'signal'), \
             patch.object(diag.signal, 'alarm'), patch.object(diag, 'collect', side_effect=TimeoutError('PRIVATE_MARKER')), \
             patch('builtins.print') as output:
            self.assertEqual(diag.main(), 2)
            output.assert_called_once_with(diag.FAILURE, file=diag.sys.stderr)

    def test_bounded_reader_never_writes_and_closes_on_overflow(self):
        with patch.object(diag.os, 'open', return_value=9) as opened, \
             patch.object(diag.os, 'read', side_effect=[b'x' * diag.MAX_BYTES, b'x']), \
             patch.object(diag.os, 'close') as closed:
            with self.assertRaises(ValueError): diag.bounded_mountinfo()
            self.assertEqual(opened.call_args.args[0], '/proc/self/mountinfo')
            self.assertEqual(opened.call_args.args[1] & (diag.os.O_WRONLY | diag.os.O_RDWR), 0)
            closed.assert_called_once_with(9)


    def test_inactive_workflow_embeds_exact_collector_twice_and_has_no_effect_actions(self):
        workflow = (ROOT / 'docs/proposals/p3-mount-topology-diagnostics-v1.yml').read_text()
        source = (ROOT / 'scripts/p3-mount-topology-diagnostic-v1.py').read_text()
        marker = "<<'DOSAI_TOPOLOGY_PY'\n"
        self.assertEqual(workflow.count(marker), 2)
        for block in workflow.split(marker)[1:]:
            embedded = block.split('          DOSAI_TOPOLOGY_PY')[0]
            self.assertEqual(''.join(line[10:] + '\n' for line in embedded.splitlines()), source)
        self.assertEqual(workflow.count('runs-on: ubuntu-24.04'), 2)
        self.assertEqual(workflow.count('timeout-minutes: 5'), 2)
        self.assertIn('permissions: {}', workflow)
        self.assertNotIn('uses:', workflow)
        self.assertFalse((ROOT / '.github/workflows/p3-mount-topology-diagnostics-v1.yml').exists())


if __name__ == '__main__': unittest.main()
