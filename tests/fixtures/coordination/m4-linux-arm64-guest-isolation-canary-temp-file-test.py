"""Offline native temporary-file observation, coverage and registry checks."""

import errno
import importlib.util
import os
from pathlib import Path
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch


TOOLS = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot'


def load(suffix):
    spec = importlib.util.spec_from_file_location(suffix, TOOLS / f'm4-linux-arm64-guest-isolation-canary-{suffix}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


harness = load('harness')
native = load('watchdog-terminator')
REQUEST = harness.CanaryRequest('HOST_FILE_READ', 'CONTROL_BEFORE', 1, 'a' * 64, 'fixture-control')
BINDING = harness.FixtureAttemptBinding(REQUEST, 'fixture-supervisor', 'b' * 64, 300)
PLAN = harness.FixtureWatchdogPlan(
    'SYNTHETIC_ONLY', BINDING, 'fixture-capsule', 'fixture-watchdog', 'fixture-verifier', 600_000_000,
)
TEMPLATE = harness.FixtureCleanupScope(PLAN, 0, b'c' * 32, 'fixture-resource-registry')
RESOURCE = harness.FixtureResourceBinding(
    'temporary_files', PLAN.capsule_generation, 'fixture-temp-reader', 'fixture-owner',
    'fixture-temp-slot', 'fixture-temp-instance',
)
PROBE = harness.FixtureResourceProbe(TEMPLATE._replace(fence_ns=100), RESOURCE)
DIRECTORY = native.FixtureHandlePin(11, 21)
FILE = native.FixtureHandlePin(11, 22)
TABLE = native.FixtureHandlePin(12, 23)
LINK = native.FixtureHandlePin(12, 24)
PIN = native.FixtureTempFilePin(DIRECTORY, 0x01021994, FILE, TABLE)
DIGEST = native.fixture_temp_file_observation_digest(PIN)
HANDLES = native.FixtureTempFileHandles(7, 8)
ABSENT = FileNotFoundError(errno.ENOENT, 'fixture absent')


class TempFileObservationTests(unittest.TestCase):
    def setUp(self):
        self.calls = Mock()
        self.calls.duplicate.side_effect = lambda fd: fd + 10
        self.calls.open_table.return_value = 19
        self.directory_facts = native.DescriptorFacts(DIRECTORY, stat.S_IFDIR, PIN.directory_filesystem, False, os.O_RDONLY)
        self.table_facts = native.DescriptorFacts(TABLE, stat.S_IFDIR, native.PROCFS_MAGIC, False, os.O_RDONLY)
        self.calls.describe.side_effect = {17: self.directory_facts, 18: self.table_facts, 19: self.table_facts}.__getitem__
        self.calls.list_slots.return_value = ('3', '4')
        self.calls.stat_entry.side_effect = self.stat_entry
        self.ops = native.TempFileReadOps(*(
            getattr(self.calls, name) for name in native.TempFileReadOps._fields
        ))
        self.observe = native.prepare_fixture_temp_file_observer(PIN, HANDLES, ops=self.ops)
        self.clock = Mock(return_value=100)
        self.coverage = Mock(side_effect=lambda probe: self.coverage_for(probe))

    def stat_entry(self, fd, name, follow):
        if (fd, name, follow) == (17, native.TEMP_FILE_NAME, False):
            raise ABSENT
        if fd == 19 and name in ('3', '4'):
            return (FILE, stat.S_IFREG) if follow else (LINK, stat.S_IFLNK)
        self.fail('Unexpected stat arguments')

    def coverage_for(self, probe):
        return harness.FixtureTempFileCoverage(probe, DIGEST, 'REVOKED_EXCLUSIVE_DESCRIPTOR_ONLY')

    def prepare_source(self, observer):
        return harness.prepare_fixture_temp_file_inventory_source(
            TEMPLATE, RESOURCE, DIGEST, self.clock, self.coverage, observer,
        )

    def test_registration_is_inert_and_rejects_wrong_digest_and_invalid_pins(self):
        self.assertIsNone(self.observe(b'x' * 32))
        self.assertIsNone(self.observe(bytearray(DIGEST)))
        for pin, handles in (
            (PIN._replace(descriptor_table=DIRECTORY), HANDLES),
            (PIN._replace(file=FILE._replace(device=13)), HANDLES),
            (PIN._replace(directory_filesystem=native.PROCFS_MAGIC), HANDLES),
            (PIN, HANDLES._replace(descriptor_table_fd=7)),
            (PIN, HANDLES._replace(directory_fd=0)),
        ):
            with self.subTest(pin=pin, handles=handles), self.assertRaises(ValueError):
                native.prepare_fixture_temp_file_observer(pin, handles, ops=self.ops)
        self.assertEqual(self.calls.mock_calls, [])

    def test_vacant_slot_still_counts_all_pinned_open_references(self):
        self.assertEqual(self.observe(DIGEST), ('VACANT', 2))
        self.assertEqual(self.calls.mock_calls, [
            call.duplicate(7), call.duplicate(8), call.describe(17), call.describe(18),
            call.open_table(18), call.describe(19), call.stat_entry(17, native.TEMP_FILE_NAME, False),
            call.list_slots(19), call.stat_entry(19, '3', False), call.stat_entry(19, '3', True),
            call.stat_entry(19, '4', False), call.stat_entry(19, '4', True),
            call.stat_entry(17, native.TEMP_FILE_NAME, False), call.describe(19), call.describe(17),
            call.close(19), call.close(18), call.close(17),
        ])

    def test_present_replaced_and_changing_slots(self):
        self.calls.list_slots.return_value = ()
        for entries, expected in (
            ([(FILE, stat.S_IFREG)] * 2, ('PRESENT', 0)),
            ([(LINK, stat.S_IFLNK)] * 2, ('REPLACED', 0)),
            ([ABSENT, (FILE, stat.S_IFREG)], None),
            ([PermissionError(errno.EACCES, 'unavailable')], None),
            ([FileNotFoundError(errno.ESTALE, 'unavailable')], None),
        ):
            with self.subTest(expected=expected, entries=entries):
                self.calls.stat_entry.side_effect = entries
                self.assertEqual(self.observe(DIGEST), expected)

    def test_only_canonical_bounded_fd_names_follow_kernel_links(self):
        for slots in (
            ('../outside',), ('03',), ('3', '3'), ('2147483648',), ['3'],
            tuple(str(index) for index in range(native.MAX_TEMP_FILE_FDS + 1)),
        ):
            with self.subTest(slots=slots[:2]):
                self.calls.list_slots.return_value = slots
                self.calls.stat_entry.reset_mock()
                self.assertIsNone(self.observe(DIGEST))
                self.calls.stat_entry.assert_called_once_with(17, native.TEMP_FILE_NAME, False)
        self.calls.list_slots.return_value = ('3',)
        self.calls.stat_entry.side_effect = [ABSENT, (LINK, stat.S_IFREG)]
        self.assertIsNone(self.observe(DIGEST))
        self.assertNotIn(call(19, '3', True), self.calls.stat_entry.call_args_list)
        self.calls.stat_entry.side_effect = [ABSENT, (LINK, stat.S_IFLNK), ABSENT]
        self.assertIsNone(self.observe(DIGEST), 'Descriptor disappearing mid-read leaves the census incomplete.')

    def test_drift_permissions_and_close_failure_withhold_evidence(self):
        for change in (
            self.table_facts._replace(pin=TABLE._replace(inode=99)),
            self.table_facts._replace(inheritable=True), self.table_facts._replace(filesystem=0),
        ):
            with self.subTest(facts=change):
                self.calls.describe.side_effect = [self.directory_facts, self.table_facts, self.table_facts, change]
                self.assertIsNone(self.observe(DIGEST))
        self.calls.describe.side_effect = {17: self.directory_facts, 18: self.table_facts, 19: self.table_facts}.__getitem__
        self.calls.close.reset_mock()
        self.calls.close.side_effect = OSError(errno.EIO, 'close unavailable')
        self.assertIsNone(self.observe(DIGEST))
        self.assertEqual(self.calls.close.call_args_list, [call(19), call(18), call(17)])

    def test_native_ops_open_a_fresh_read_only_table_and_bound_the_scan(self):
        entries = tuple(SimpleNamespace(name=str(index)) for index in range(native.MAX_TEMP_FILE_FDS + 1))
        scan = Mock()
        scan.__enter__ = Mock(return_value=iter(entries))
        scan.__exit__ = Mock(return_value=False)
        with patch.object(native, '_linux_arm64_descriptor_reader', return_value=Mock()), \
                patch.object(native.os, 'open', return_value=19) as open_directory, \
                patch.object(native.os, 'scandir', return_value=scan) as scandir:
            ops = native._linux_arm64_temp_file_read_ops()
            self.assertEqual(ops.open_table(18), 19)
            open_directory.assert_called_once_with('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                                                   dir_fd=18)
            with self.assertRaises(ValueError):
                ops.list_slots(19)
            scandir.assert_called_once_with(19)
            scan.__exit__.assert_called_once()
        with patch.object(native.os, 'uname', return_value=SimpleNamespace(sysname='Linux', machine='x86_64')), \
                patch.object(native.os, 'open') as open_directory:
            self.assertIsNone(native.prepare_fixture_temp_file_observer(PIN, HANDLES)(DIGEST))
            open_directory.assert_not_called()

    def test_coverage_must_bind_exact_probe_and_physical_pins_before_and_after(self):
        observed = Mock(return_value=('VACANT', 0))
        source = self.prepare_source(observed)
        for coverage in (
            None, self.coverage_for(PROBE)._replace(policy='REVOKED'),
            self.coverage_for(PROBE)._replace(probe=PROBE._replace()),
            self.coverage_for(PROBE)._replace(observation_digest=b'x' * 32),
        ):
            self.coverage.side_effect = None
            self.coverage.return_value = coverage
            self.assertIsNone(source.snapshot(PROBE))
        self.assertIsNone(source.snapshot(PROBE._replace(binding=RESOURCE._replace(instance_id='fixture-other'))))
        observed.assert_not_called()
        self.coverage.side_effect = [self.coverage_for(PROBE), None]
        self.assertIsNone(source.snapshot(PROBE))
        observed.assert_called_once_with(DIGEST)

    def test_registry_keeps_cleanup_pending_until_final_descriptor_closes(self):
        temp = self.prepare_source(self.observe)
        sources = tuple(
            temp if kind == temp.kind else harness.FixtureResourceInventorySource(
                kind, f'fixture-mock-reader-{index}', f'fixture-mock-owner-{index}', Mock(return_value=None),
            )
            for index, kind in enumerate(harness.FixtureNonProcessResources._fields)
        )
        readers = harness.prepare_fixture_resource_absence_readers(
            PLAN, TEMPLATE.cgroup_digest, TEMPLATE.resource_generation, sources,
        )
        registry = harness.prepare_fixture_cleanup_registry(
            PLAN, TEMPLATE.cgroup_digest, TEMPLATE.resource_generation, self.clock, readers,
        )
        ticket = registry.owner.reserve_writer('temporary_files')
        self.assertTrue(registry.owner.finish_writer(ticket, RESOURCE))
        force = Mock()
        watchdog = harness.FixtureCanaryWatchdog(
            PLAN, harness.FixtureWatchdogPorts(lambda _: registry.owner.revoke_at(100), force),
        )
        self.assertEqual(watchdog.stop(BINDING, 100)['watchdogState'], 'STOPPING')
        fence = registry.observer.read_fence()
        ports = harness.FixtureCleanupCollectorPorts(
            self.clock, registry.observer.read_fence, Mock(return_value=False), registry.observer.read_resources,
        )
        for slots in (('3', '4'), ('4',), ()):
            self.calls.list_slots.return_value = slots
            self.assertIs(registry.owner.verify_absent(fence, ticket), not slots)
            inventory = harness.collect_fixture_cleanup_inventory(fence.scope, ports)
            self.assertEqual(inventory.resources.temporary_files, int(bool(slots)))
            report = watchdog.poll(100, inventory=inventory)
            self.assertEqual(report['watchdogState'], 'STOPPING' if slots else 'STOPPED')
            self.assertEqual(report['watchdogCleanup'], 'UNCERTAIN' if slots else 'VERIFIED')
            self.assertEqual(report['status'], 'HOLD')
            self.assertIs(report['liveLaunchPermitted'], False)
            self.assertEqual(report['qualifyingBuilderReceiptsAdded'], 0)
        force.assert_not_called()


if __name__ == '__main__':
    unittest.main()
