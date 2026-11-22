"""Test descriptor enrollment and custody using the simulated ARM64 kernel."""

from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    'kernel_fixture', Path(__file__).with_name('m4-linux-arm64-guest-isolation-canary-holder-readback-syscalls-test.py'),
)
kernel_fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(kernel_fixture)
fixture = kernel_fixture.fixture
readback = kernel_fixture.readback
KernelFixture = kernel_fixture.KernelFixture
ROOT = fixture.ROOT_HANDLE
SEAL = fixture.SEAL
PLAN_DIGEST = sha256(fixture.PLAN).digest()
CUSTODIAN = b'c' * 32
TABLE = readback.FixtureReadbackTablePin(b'b' * 32, 1919, 452, b't' * 32)


class EnrollmentFixture:
    def __init__(self, plan=fixture.PLAN):
        self.plan = plan
        self.kernel = KernelFixture()
        files = tuple(
            readback.FixtureReadbackFilePin(path, self.kernel.tree.stats[path].inode, descriptor)
            for descriptor, path in ((12, fixture.LINKER), (13, fixture.LOADER))
        )
        self.enrollment = readback.FixtureReadbackEnrollment(
            'SYNTHETIC_ONLY', sha256(plan).digest(), SEAL, fixture.READER, CUSTODIAN, TABLE, ROOT, files, 10_000,
        )
        self.samples = []

    def observe(self, fd, digest):
        self.samples.append((fd, digest))
        return readback.FixtureReadbackCustody(self.enrollment, CUSTODIAN, len(self.samples), True, True)

    def prepare(self, *, observe=None, invoke=None, enrollment=None):
        return readback.prepare_fixture_holder_readback_enrollment(
            self.plan, self.enrollment if enrollment is None else enrollment,
            self.observe if observe is None else observe,
            invoke=self.kernel if invoke is None else invoke, clock=self.kernel.tree.monotonic_ns,
        )

    def collect(self, **kwargs):
        with patch.object(readback, 'PLAN_SHA256', sha256(self.plan).digest()):
            return self.prepare(**kwargs)()


class HolderReadbackEnrollmentTests(unittest.TestCase):
    def test_enrollment_uses_exact_borrowed_files_and_four_independent_custody_samples(self):
        rig = EnrollmentFixture()
        with patch.object(readback, 'PLAN_SHA256', PLAN_DIGEST):
            run = rig.prepare()
            self.assertEqual(rig.kernel.calls, [])
            self.assertEqual(rig.samples, [])
            result = run()
            self.assertIsNotNone(result)
            self.assertEqual(result.status, 'SOURCE_ONLY_HOLD')
            self.assertEqual(result.readback.status, 'SOURCE_ONLY_HOLD')
            self.assertEqual(rig.samples, [(ROOT, result.enrollment_digest)] * 4)
            self.assertEqual(set(rig.kernel.handles), {ROOT, 12, 13})
            reads = [call[1] for call in rig.kernel.calls if call[0] == 67]
            self.assertEqual(reads, [12, 12, 12, 13, 13] * 2)
            self.assertIsNone(run())
            self.assertEqual(len(rig.samples), 4)
        reordered = EnrollmentFixture()
        reordered.enrollment = reordered.enrollment._replace(files=reordered.enrollment.files[::-1])
        self.assertEqual(reordered.collect(), result)
        changed_table = EnrollmentFixture()
        changed_table.enrollment = changed_table.enrollment._replace(table=TABLE._replace(table_id=b'u' * 32))
        self.assertNotEqual(changed_table.collect().enrollment_digest, result.enrollment_digest)

    def test_missing_extra_duplicate_or_malformed_enrollment_is_rejected_before_touching_handles(self):
        rig = EnrollmentFixture()
        expected = rig.enrollment
        first, second = expected.files
        for update in (
            {'origin': 'NATIVE_LINUX_ARM64'}, {'plan_digest': b'x' * 32}, {'root_handle': 1},
            {'custodian_id': expected.reader_id}, {'custodian_id': expected.seal.writer_id},
            {'files': (first,)}, {'files': (first, second, first)}, {'files': (first, first)},
            {'files': (first, second._replace(descriptor=first.descriptor))},
            {'files': (first, second._replace(inode=first.inode))},
            {'files': (first, second._replace(inode=expected.seal.root_inode))},
            {'files': (first, second._replace(descriptor=expected.root_handle))},
            {'files': (first, second._replace(path=fixture.LOADER_ALIAS))},
        ):
            with self.subTest(update=update), patch.object(readback, 'PLAN_SHA256', PLAN_DIGEST):
                with self.assertRaises(ValueError):
                    rig.prepare(enrollment=expected._replace(**update))
        self.assertEqual(rig.kernel.calls, [])
        self.assertEqual(rig.samples, [])

    def test_custody_requires_the_exact_process_table_and_fenced_generation(self):
        for updates in (
            {'table': TABLE._replace(boot_id=b'x' * 32)}, {'table': TABLE._replace(pid=1920)},
            {'table': TABLE._replace(start_ticks=453)}, {'table': TABLE._replace(table_id=b'x' * 32)},
            {'seal': SEAL._replace(generation=SEAL.generation + 1)},
            {'seal': SEAL._replace(mount_id=32)}, {'seal': SEAL._replace(write_fenced=False)},
            {'root_handle': 6}, {'reader_id': b'x' * 32},
            {'deadline_ns': 9_999},
        ):
            with self.subTest(updates=updates):
                rig = EnrollmentFixture()

                def wrong_custody(fd, digest):
                    return rig.observe(fd, digest)._replace(enrollment=rig.enrollment._replace(**updates))

                self.assertIsNone(rig.collect(observe=wrong_custody))
                self.assertEqual(rig.kernel.calls, [])

    def test_unwitnessed_incomplete_or_replayed_custody_never_returns_a_receipt(self):
        for updates in (
            {'observer_id': b'x' * 32}, {'complete': False}, {'table_fenced': False}, {'sequence': 0},
            {'table_fenced': 1}, {'sequence': True},
        ):
            with self.subTest(updates=updates):
                rig = EnrollmentFixture()
                self.assertIsNone(rig.collect(observe=lambda fd, digest: rig.observe(fd, digest)._replace(**updates)))
                self.assertEqual(rig.kernel.calls, [])
        rig = EnrollmentFixture()

        def replay(fd, digest):
            return rig.observe(fd, digest)._replace(sequence=1)

        with patch.object(readback, 'PLAN_SHA256', PLAN_DIGEST):
            run = rig.prepare(observe=replay)
            self.assertIsNone(run())
            self.assertIsNone(run())
        self.assertEqual(len(rig.samples), 2)
        self.assertEqual(set(rig.kernel.handles), {ROOT, 12, 13})

        rig = EnrollmentFixture()

        def unavailable(*_):
            raise RuntimeError('Custody provider unavailable.')

        self.assertIsNone(rig.collect(observe=unavailable))
        self.assertEqual(rig.kernel.calls, [])

    def test_all_enrolled_handles_are_checked_before_opening_children(self):
        for issue in ('wrong-file', 'writable-file', 'writable-root', 'inheritable'):
            with self.subTest(issue=issue):
                rig = EnrollmentFixture()
                if issue == 'wrong-file':
                    rig.kernel.handles[13] = fixture.LINKER

                def invoke(number, fd, *args):
                    result = rig.kernel(number, fd, *args)
                    if number == 25 and (fd == ROOT and issue == 'writable-root'
                                         or fd == 13 and issue == 'writable-file') and args == (3,):
                        return 2
                    if number == 25 and fd == 13 and issue == 'inheritable' and args == (1,):
                        return 0
                    return result

                self.assertIsNone(rig.collect(invoke=invoke))
                self.assertFalse(any(call[0] in (437, 67) for call in rig.kernel.calls))
                self.assertEqual(set(rig.kernel.handles), {ROOT, 12, 13})

    def test_another_enrolled_object_cannot_satisfy_the_wrong_path(self):
        plan = json.loads(fixture.PLAN)
        files = {row['staged_path']: row for row in plan['entries']}
        files[fixture.LOADER]['size_bytes'] = files[fixture.LINKER]['size_bytes']
        files[fixture.LOADER]['sha256'] = files[fixture.LINKER]['sha256']
        rig = EnrollmentFixture(json.dumps(plan).encode())
        info = rig.kernel.tree.stats
        info[fixture.LOADER] = info[fixture.LOADER]._replace(size=info[fixture.LINKER].size)

        def invoke(number, fd, *args):
            result = rig.kernel(number, fd, *args)
            if number == 437 and rig.kernel.handles[result] == fixture.LINKER:
                rig.kernel.handles[result] = fixture.LOADER
            return result

        self.assertIsNone(rig.collect(invoke=invoke))
        self.assertFalse(any(call[0] == 67 for call in rig.kernel.calls))
        self.assertEqual(set(rig.kernel.handles), {ROOT, 12, 13})

    def test_final_identity_or_custody_change_withholds_a_completed_readback(self):
        for issue in ('inode', 'change-time', 'table', 'descriptor'):
            with self.subTest(issue=issue):
                rig = EnrollmentFixture()

                def observe(fd, digest):
                    sample = rig.observe(fd, digest)
                    if len(rig.samples) == 4:
                        if issue == 'table':
                            change = rig.enrollment._replace(table=TABLE._replace(table_id=b'x' * 32))
                            return sample._replace(enrollment=change)
                        if issue == 'descriptor':
                            first, second = rig.enrollment.files
                            change = rig.enrollment._replace(files=(first, second._replace(descriptor=14)))
                            return sample._replace(enrollment=change)
                        info = rig.kernel.tree.stats[fixture.LOADER]
                        change = {'inode': 999} if issue == 'inode' else {'change_time_ns': 71}
                        rig.kernel.tree.stats[fixture.LOADER] = info._replace(**change)
                    return sample

                self.assertIsNone(rig.collect(observe=observe))
                self.assertEqual(len(rig.samples), 4)
                self.assertEqual(set(rig.kernel.handles), {ROOT, 12, 13})

    def test_native_transport_factory_waits_for_a_valid_custody_sample(self):
        rig = EnrollmentFixture()
        with patch.object(readback, 'PLAN_SHA256', PLAN_DIGEST), \
                patch.object(readback, '_linux_arm64_readback_syscall') as transport, \
                patch.object(readback, 'monotonic_ns', rig.kernel.tree.monotonic_ns):
            run = readback.prepare_linux_arm64_holder_readback_enrollment(
                fixture.PLAN, rig.enrollment, lambda fd, digest: rig.observe(fd, digest)._replace(table_fenced=False),
            )
            self.assertIsNone(run())
            transport.assert_not_called()
        self.assertEqual(rig.kernel.calls, [])


if __name__ == '__main__':
    unittest.main()
