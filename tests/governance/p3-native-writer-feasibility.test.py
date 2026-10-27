"""Combined negative fixtures; never sample a host or invoke an observation query."""
import importlib.util
from pathlib import Path
import time
import unittest
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


support = load('kernel_fixture_support', ROOT / 'tests/governance/p3-kernel-writer-diagnostic.test.py')
diag = load('attributed_kernel_source', ROOT / 'scripts/p3-kernel-writer-diagnostic-v2.py')


class FeasibilityTests(unittest.TestCase):
    def setUp(self):
        support.DiagnosticTests.setUp(self)

    def collect(self, query):
        return diag.collect(self.fd, 4242, support.KERNEL, {'fixture_only': True},
                            time.monotonic() + 7, query_function=query)

    def test_one_fixed_code_cannot_identify_the_exact_mount_topology(self):
        examples = {
            'autofs_plus_binfmt': '41 1 0:41 / /proc/sys/fs/binfmt_misc rw - autofs systemd-1 rw\n' + self.mount,
            'non_root_binfmt': self.mount.replace(' / /proc/', ' /subdir /proc/'),
            'other_filesystem': self.mount.replace(' - binfmt_misc ', ' - tmpfs '),
        }
        for name, mountinfo in examples.items():
            with self.subTest(name=name), self.assertRaises(diag.Rejected) as raised:
                diag.mount_identity(mountinfo.encode('ascii'), self.device, 1)
            self.assertEqual(raised.exception.code, 'MOUNTINFO_TARGET_FS_OR_ROOT')
        # All three distinct synthetic causes share the observed code. None is a host finding.

    def test_early_mount_rejection_leaves_later_observations_unknown(self):
        (self.root / 'proc/4242/mountinfo').write_text(
            '41 1 0:41 / /proc/sys/fs/binfmt_misc rw - autofs systemd-1 rw\n' + self.mount)
        (self.root / 'proc/version_signature').unlink()
        (self.root / 'proc/4242/ns/mnt').unlink()
        query = Mock(side_effect=OSError('DO_NOT_EMIT_QUERY_MARKER'))
        with self.assertRaises(diag.Rejected) as raised:
            self.collect(query)
        self.assertEqual(raised.exception.code, 'MOUNTINFO_TARGET_FS_OR_ROOT')
        query.assert_not_called()
        self.assertEqual(diag.failure_line(raised.exception),
                         'DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2:MOUNTINFO_TARGET_FS_OR_ROOT')

    def test_complete_package_and_inactive_units_never_establish_source_or_writer_trust(self):
        def query(argv, deadline):
            return support.PACKAGE if argv[0] == '/usr/bin/dpkg-query' else support.unit_bytes(argv[-1])
        result = self.collect(query)
        self.assertEqual(result['kernel']['installed_package']['status'], 'OBSERVED')
        self.assertTrue(all(unit['observation']['data']['active_state'] == 'inactive'
                            for unit in result['writer_units']))
        self.assertEqual(result['writer_inventory_scope'], 'FIXED_UNITS_ONLY_NON_ATOMIC')
        self.assertTrue(all(value is False for value in result['proofs'].values()))
        self.assertIn('UNLISTED_PRIVILEGED_WRITERS_NOT_EXCLUDED', result['gaps'])
        self.assertIn('VENDOR_SOURCE_AND_PATCH_MATCH_NOT_VERIFIED', result['gaps'])


if __name__ == '__main__': unittest.main()
