"""Offline launch provenance for the pinned Linux ARM64 fixture holder."""

from hashlib import sha256
import importlib.util
import os
from pathlib import Path
import stat
import struct
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch


SOURCE = Path(__file__).with_name('m4-linux-arm64-guest-isolation-canary-holder-bootstrap-test.py')
spec = importlib.util.spec_from_file_location('holder_bootstrap_fixtures', SOURCE)
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
harness, native = fixtures.harness, fixtures.native
PROCESS = native.FixtureTempFileProcessPin(native.FixtureHandlePin(12, 37), 41, 987)
PROCESS_STAT = b'41 (fixture) S ' + b' '.join((b'0',) * 18 + (b'987',) + (b'0',) * 30) + b'\n'
IMAGE = native.FixtureHandlePin(21, 42)
LINK = native.FixtureHandlePin(PROCESS.directory.device, 39)
BASELINE_STATUS = fixtures.STATUS.replace(b'Seccomp:\t2', b'Seccomp:\t0').replace(
    b'Seccomp_filters:\t1', b'Seccomp_filters:\t0',
)


def elf_image(kind=1, machine=183, file_type=2, size=native.HOLDER_IMAGE_CHUNK + 5):
    ident = b'\x7fELF\x02\x01\x01' + b'\x00' * 9
    header = struct.pack('<16sHHIQQQIHHHHHH', ident, file_type, machine, 1, 0x400000, 64, 0, 0, 64, 56, 1, 0, 0, 0)
    program_header = struct.pack('<IIQQQQQQ', kind, 5, 0, 0x400000, 0x400000, size, size, 4096)
    return (header + program_header).ljust(size, b'\x00')


IMAGE_BYTES = elf_image()
IMAGE_PIN = native.FixtureTempFileLaunchImagePin(IMAGE, sha256(IMAGE_BYTES).digest(), len(IMAGE_BYTES))
REGISTRATION = fixtures.REGISTRATION._replace(executable_digest=IMAGE_PIN.digest)
PLAN = harness.FixtureTempFileLaunchPlan(
    REGISTRATION.template, REGISTRATION.binding, REGISTRATION.policy_generation, IMAGE_PIN.digest,
    harness.TEMP_REFERENCE_FILTER_DIGEST, REGISTRATION.nonce, PROCESS.pid,
    REGISTRATION.pins.directory, REGISTRATION.pins.control, REGISTRATION.pins.setup, REGISTRATION.deadline_ns,
)


def custody_record(challenge):
    state = 'BOOTSTRAP_BLOCKED_EXCLUSIVE' if challenge.phase == 'BASELINE' else 'EXCLUSIVE_SINCE_BASELINE'
    return harness.FixtureTempFileLaunchCustodyReadback(challenge, state, 50)


class HolderLaunchEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.calls = Mock()
        self.calls.duplicate.side_effect = lambda fd: fd + 10
        self.proc_facts = native.DescriptorFacts(PROCESS.directory, stat.S_IFDIR, native.PROCFS_MAGIC, False, os.O_RDONLY)
        self.image_facts = native.DescriptorFacts(IMAGE, stat.S_IFREG, native.TMPFS_MAGIC, False, os.O_RDONLY)
        self.calls.describe.side_effect = {17: self.proc_facts, 18: self.image_facts}.__getitem__
        self.calls.read_stat.return_value = PROCESS_STAT
        self.calls.stat_exe.side_effect = lambda _, follow: (IMAGE, stat.S_IFREG) if follow else (LINK, stat.S_IFLNK)
        self.calls.get_seals.return_value = native.REQUIRED_HOLDER_IMAGE_SEALS
        self.calls.pread.side_effect = lambda _, length, offset: IMAGE_BYTES[offset:offset + length]
        self.calls.read_status.return_value = BASELINE_STATUS
        proc = native.TempFileEnrollmentOps(*(getattr(self.calls, name) for name in native.TempFileEnrollmentOps._fields))
        self.ops = native.TempFileLaunchEvidenceOps(proc, self.calls.stat_exe, self.calls.get_seals, self.calls.pread)
        self.clock = Mock(return_value=100)
        self.custody = Mock(side_effect=custody_record)
        self.challenge = harness.FixtureTempFileBootstrapChallenge(REGISTRATION)

    def observe(self, pin=IMAGE_PIN):
        return native.prepare_fixture_temp_file_launch_process_reader(PROCESS, 7, pin, 8, PLAN.nonce, ops=self.ops)

    def prepare(self, observer=None):
        return harness.prepare_fixture_temp_file_launch_evidence(
            PLAN, self.clock, self.custody, self.observe() if observer is None else observer,
        )

    def test_native_registration_and_wrong_nonce_refuse_io(self):
        observe = self.observe()
        self.assertIsNone(observe(b'x' * 32, PROCESS.pid))
        self.assertIsNone(observe(PLAN.nonce, True))
        self.assertIsNone(observe(PLAN.nonce, PROCESS.pid + 1))
        for pin in (IMAGE_PIN._replace(size=native.MAX_HOLDER_IMAGE_BYTES + 1), IMAGE_PIN._replace(digest=b''),
                    IMAGE_PIN._replace(identity=PROCESS.directory), IMAGE_PIN._replace(size=True)):
            with self.subTest(pin=pin), self.assertRaises(ValueError):
                self.observe(pin)
        self.assertEqual(self.calls.mock_calls, [])

    def test_sealed_image_is_hashed_in_exact_bounded_positional_reads(self):
        self.assertEqual(self.observe()(PLAN.nonce, PROCESS.pid), (IMAGE_PIN.digest, BASELINE_STATUS))
        self.assertEqual(self.calls.pread.call_args_list, [
            call(18, native.HOLDER_IMAGE_CHUNK, 0), call(18, 5, native.HOLDER_IMAGE_CHUNK),
            call(18, 1, len(IMAGE_BYTES)),
        ])
        self.assertEqual(self.calls.stat_exe.call_args_list, [
            call(17, False), call(17, True), call(17, False), call(17, True),
        ])
        self.assertEqual(self.calls.close.call_args_list, [call(18), call(17)])

    def test_image_substitution_bad_seals_and_bad_process_hold_evidence(self):
        self.calls.get_seals.return_value = native.REQUIRED_HOLDER_IMAGE_SEALS & ~0x08
        self.assertIsNone(self.observe()(PLAN.nonce, PROCESS.pid))
        self.calls.get_seals.return_value = native.REQUIRED_HOLDER_IMAGE_SEALS
        self.calls.stat_exe.side_effect = [(LINK, stat.S_IFLNK), (IMAGE._replace(inode=99), stat.S_IFREG)]
        self.assertIsNone(self.observe()(PLAN.nonce, PROCESS.pid))
        self.calls.read_stat.return_value = PROCESS_STAT.replace(b' 987 ', b' 988 ')
        self.assertIsNone(self.observe()(PLAN.nonce, PROCESS.pid))
        self.calls.pread.assert_not_called()

    def test_short_extra_dynamic_elf_and_late_identity_drift_fail_closed(self):
        for raw in (elf_image(kind=2), elf_image(kind=3), elf_image(machine=62), elf_image(file_type=3)):
            with self.subTest(header=raw[:22]):
                self.calls.pread.side_effect = lambda _, length, offset: raw[offset:offset + length]
                pin = IMAGE_PIN._replace(digest=sha256(raw).digest())
                self.assertIsNone(self.observe(pin)(PLAN.nonce, PROCESS.pid))
        self.calls.pread.side_effect = [IMAGE_BYTES[:20]]
        self.assertIsNone(self.observe()(PLAN.nonce, PROCESS.pid))
        self.calls.pread.side_effect = [IMAGE_BYTES[:native.HOLDER_IMAGE_CHUNK], IMAGE_BYTES[-5:], b'x']
        self.assertIsNone(self.observe()(PLAN.nonce, PROCESS.pid))
        self.calls.pread.side_effect = lambda _, length, offset: IMAGE_BYTES[offset:offset + length]
        self.assertIsNone(self.observe(IMAGE_PIN._replace(digest=b'x' * 32))(PLAN.nonce, PROCESS.pid))
        self.calls.read_stat.side_effect = [PROCESS_STAT, PROCESS_STAT.replace(b' 987 ', b' 988 ')]
        self.assertIsNone(self.observe()(PLAN.nonce, PROCESS.pid))

    def test_native_ports_use_only_the_fixed_proc_link_and_seal_read(self):
        info = SimpleNamespace(st_dev=IMAGE.device, st_ino=IMAGE.inode, st_mode=stat.S_IFREG)
        with patch.object(native, '_linux_arm64_temp_file_enrollment_ops', return_value=Mock()), \
                patch.object(native.os, 'stat', return_value=info) as status, \
                patch.object(native.fcntl, 'F_GET_SEALS', 1034, create=True), \
                patch.object(native.fcntl, 'fcntl', return_value=15) as seals:
            ops = native._linux_arm64_temp_file_launch_evidence_ops()
            self.assertEqual(ops.stat_exe(17, True), (IMAGE, stat.S_IFREG))
            status.assert_called_once_with('exe', dir_fd=17, follow_symlinks=True)
            self.assertEqual(ops.get_seals(18), 15)
            seals.assert_called_once_with(18, 1034)
        with patch.object(native.os, 'uname', return_value=SimpleNamespace(sysname='Linux', machine='x86_64')), \
                patch.object(native.os, 'dup') as duplicate:
            observe = native.prepare_fixture_temp_file_launch_process_reader(PROCESS, 7, IMAGE_PIN, 8, PLAN.nonce)
            self.assertIsNone(observe(PLAN.nonce, PROCESS.pid))
            duplicate.assert_not_called()

    def test_baseline_requires_zero_filters_exact_image_and_a_closed_bootstrap_gate(self):
        read_process = Mock(return_value=(IMAGE_PIN.digest, BASELINE_STATUS))
        collector = self.prepare(read_process)
        self.assertIsNone(collector.read_launch(self.challenge))
        read_process.assert_not_called()
        for raw in (fixtures.STATUS, BASELINE_STATUS.replace(b'Threads:\t1', b'Threads:\t2'),
                    BASELINE_STATUS.replace(b'TracerPid:\t0', b'TracerPid:\t9'),
                    BASELINE_STATUS.replace(b'Seccomp_filters:\t0\n', b'')):
            with self.subTest(status=raw):
                read_process.return_value = (IMAGE_PIN.digest, raw)
                self.assertFalse(self.prepare(read_process).capture_baseline())
        read_process.return_value = (b'x' * 32, BASELINE_STATUS)
        self.assertFalse(self.prepare(read_process).capture_baseline())
        read_process.reset_mock()
        self.custody.side_effect = lambda challenge: custody_record(challenge)._replace(state='EXCLUSIVE_SINCE_BASELINE')
        self.assertFalse(self.prepare(read_process).capture_baseline())
        read_process.assert_not_called()

    def test_launch_evidence_refuses_replay_custody_gap_and_registration_drift(self):
        collector = self.prepare()
        self.assertTrue(collector.capture_baseline())
        self.assertFalse(collector.capture_baseline())
        self.calls.read_status.return_value = fixtures.STATUS
        for registration in (REGISTRATION._replace(nonce=b'x' * 32), REGISTRATION._replace(pid=42),
                             REGISTRATION._replace(pins=REGISTRATION.pins._replace(setup=(99, 99)))):
            with self.subTest(registration=registration):
                self.assertIsNone(collector.read_launch(harness.FixtureTempFileBootstrapChallenge(registration)))
        self.custody.side_effect = lambda challenge: custody_record(challenge)._replace(held_since_ns=75)
        self.assertIsNone(collector.read_launch(self.challenge))
        self.custody.side_effect = custody_record
        self.assertIsNone(collector.read_launch(self.challenge))
        self.calls.read_status.return_value = BASELINE_STATUS
        retry = self.prepare()
        self.assertTrue(retry.capture_baseline())
        self.calls.read_status.return_value = fixtures.STATUS
        old = None

        def replay(challenge):
            nonlocal old
            if old is None:
                old = custody_record(challenge)
            return old

        self.custody.side_effect = replay
        self.assertIsNone(retry.read_launch(self.challenge))

    def test_expiry_and_clock_rollback_withhold_a_complete_sample(self):
        self.clock.side_effect = [100, 101, PLAN.deadline_ns]
        self.assertFalse(self.prepare().capture_baseline())
        self.clock.side_effect = [100, 99]
        self.assertFalse(self.prepare().capture_baseline())
        self.clock.side_effect = None
        collector = self.prepare()
        self.assertTrue(collector.capture_baseline())
        self.calls.read_status.return_value = fixtures.STATUS
        self.clock.side_effect = [110, 109]
        self.assertIsNone(collector.read_launch(self.challenge))

    def test_verified_baseline_and_live_filter_feed_the_installation_receipt(self):
        collector = self.prepare()
        self.assertTrue(collector.capture_baseline())
        self.calls.read_status.return_value = fixtures.STATUS
        self.clock.return_value = 110
        ports = harness.FixtureTempFileBootstrapPorts(
            self.clock, collector.read_launch, fixtures.setup_record, Mock(return_value=True),
            Mock(return_value=fixtures.STATUS), Mock(return_value=('PRESENT', 1)),
        )
        receipt = harness.prepare_fixture_temp_file_receipt_issuer(REGISTRATION, ports)()
        self.assertTrue(receipt.installed)
        self.assertEqual(receipt.program_digest, PLAN.program_digest)
        self.assertEqual(receipt.prior_filters, 0)
        self.assertEqual(self.calls.read_status.call_count, 3)
        self.assertEqual([entry.args[0].phase for entry in self.custody.call_args_list],
                         ['BASELINE', 'BASELINE', 'INSTALLED', 'INSTALLED', 'INSTALLED', 'INSTALLED'])


if __name__ == '__main__':
    unittest.main()
