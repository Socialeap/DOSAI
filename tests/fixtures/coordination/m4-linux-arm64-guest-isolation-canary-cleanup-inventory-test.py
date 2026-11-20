"""Offline checks for the pinned cgroup reader and independent cleanup collector."""

import importlib.util
import os
from pathlib import Path
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call, patch


TOOLS = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot'


def load(module):
    source = TOOLS / f'm4-linux-arm64-guest-isolation-canary-{module}.py'
    spec = importlib.util.spec_from_file_location(module, source)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


harness = load('harness')
native = load('watchdog-terminator')
REQUEST = harness.CanaryRequest('HOST_FILE_READ', 'CONTROL_BEFORE', 1, 'a' * 64, 'fixture-private-control')
BINDING = harness.FixtureAttemptBinding(REQUEST, 'fixture-private-supervisor', 'b' * 64, 300)
PLAN = harness.FixtureWatchdogPlan(
    'SYNTHETIC_ONLY', BINDING, 'fixture-private-capsule', 'fixture-private-watchdog',
    'fixture-private-verifier', 600_000_000,
)
WATCHDOG_DIGEST = harness.fixture_watchdog_binding_digest(PLAN)
DIRECTORY = native.FixtureHandlePin(12, 40)
EVENTS = native.FixtureHandlePin(12, 41)
KILL = native.FixtureHandlePin(12, 42)
CAPSULE = native.FixtureCapsuleBinding(PLAN.origin, WATCHDOG_DIGEST, PLAN.capsule_generation, DIRECTORY, KILL)
PIN = native.FixtureCgroupReadPin(CAPSULE, EVENTS)
HANDLES = native.FixtureCgroupReadHandles(7, 8)
DIRECTORY_FACTS = native.DescriptorFacts(DIRECTORY, stat.S_IFDIR, native.CGROUP2_MAGIC, False, os.O_RDONLY)
EVENTS_FACTS = native.DescriptorFacts(EVENTS, stat.S_IFREG, native.CGROUP2_MAGIC, False, os.O_RDONLY)
DIGEST = native.fixture_cgroup_population_digest(PIN)
POPULATION_BINDING = (WATCHDOG_DIGEST, PLAN.capsule_generation, DIGEST)
SCOPE = harness.FixtureCleanupScope(PLAN, 100, DIGEST, 'fixture-private-resource-reader')
FENCE = harness.FixtureCleanupFenceReadback(SCOPE, 'REVOKED_QUIESCED')
EMPTY = harness.FixtureNonProcessResources(0, 0, 0, 0, 0, 0)
SAMPLE = harness.FixtureResourceSample(SCOPE, 102, True, EMPTY)


def mock_read_ops():
    operations = Mock()
    operations.duplicate.side_effect = lambda fd: fd + 10
    operations.describe.side_effect = {17: DIRECTORY_FACTS, 18: EVENTS_FACTS}.__getitem__
    operations.stat_events.return_value = (EVENTS, stat.S_IFREG)
    operations.pread.return_value = b'populated 0\nfrozen 0\n'
    return operations, native.CgroupReadOps(
        operations.duplicate, operations.close, operations.describe, operations.stat_events, operations.pread,
    )


class PinnedPopulationTests(unittest.TestCase):
    def test_prepare_and_wrong_bindings_do_not_read(self):
        operations, ops = mock_read_ops()
        read = native.prepare_fixture_cgroup_population_reader(PIN, HANDLES, ops=ops)
        for binding in (
            (b'x' * 32, PLAN.capsule_generation, DIGEST),
            (WATCHDOG_DIGEST, 'fixture-other', DIGEST),
            (WATCHDOG_DIGEST, PLAN.capsule_generation, bytearray(DIGEST)),
            (WATCHDOG_DIGEST, PLAN.capsule_generation, b'x' * 32),
        ):
            with self.subTest(binding=binding):
                self.assertIsNone(read(*binding))
        self.assertEqual(operations.mock_calls, [])

    def test_invalid_registrations_fail_before_io(self):
        operations, ops = mock_read_ops()
        for pin, handles in (
            (PIN._replace(events=DIRECTORY), HANDLES),
            (PIN._replace(events=KILL), HANDLES),
            (PIN._replace(events=EVENTS._replace(device=13)), HANDLES),
            (PIN, HANDLES._replace(events_fd=HANDLES.directory_fd)),
            (PIN, HANDLES._replace(events_fd=1)),
            (PIN, HANDLES._replace(events_fd=True)),
        ):
            with self.subTest(pin=pin, handles=handles), self.assertRaises(ValueError):
                native.prepare_fixture_cgroup_population_reader(pin, handles, ops=ops)
        self.assertEqual(operations.mock_calls, [])

    def test_empty_read_checks_fixed_control_on_both_sides_and_closes_only_copies(self):
        operations, ops = mock_read_ops()
        read = native.prepare_fixture_cgroup_population_reader(PIN, HANDLES, ops=ops)
        self.assertIs(read(*POPULATION_BINDING), False)
        self.assertEqual(operations.mock_calls, [
            call.duplicate(7), call.describe(17), call.duplicate(8), call.describe(18),
            call.stat_events(17), call.pread(18, 4097, 0), call.stat_events(17), call.close(18), call.close(17),
        ])

    def test_live_processes_are_distinct_from_an_unavailable_read(self):
        operations, ops = mock_read_ops()
        operations.pread.return_value = b'frozen 0\npopulated 1\nadditional_field 37\n'
        read = native.prepare_fixture_cgroup_population_reader(PIN, HANDLES, ops=ops)
        self.assertIs(read(*POPULATION_BINDING), True)
        for raw in (
            b'', b'populated 0', b'populated 0\npopulated 1\n', b'other 0\n',
            b'populated 2\n', b'populated 00\n', b'populated 0\ninvalid\n',
            b'populated  0\n', b'populated 0\r\n', b'populated 0\n' * 350, 'populated 0\n',
        ):
            with self.subTest(raw=raw[:60]):
                operations.pread.return_value = raw
                self.assertIsNone(read(*POPULATION_BINDING))

    def test_descriptor_and_lookup_drift_withhold_evidence(self):
        for facts in (
            EVENTS_FACTS._replace(pin=EVENTS._replace(inode=99)),
            EVENTS_FACTS._replace(filesystem=0x1234),
            EVENTS_FACTS._replace(inheritable=True),
            EVENTS_FACTS._replace(mode=stat.S_IFLNK),
            EVENTS_FACTS._replace(flags=os.O_WRONLY),
            EVENTS_FACTS._replace(flags=os.O_RDWR),
        ):
            with self.subTest(facts=facts):
                operations, ops = mock_read_ops()
                operations.describe.side_effect = [DIRECTORY_FACTS, facts]
                read = native.prepare_fixture_cgroup_population_reader(PIN, HANDLES, ops=ops)
                self.assertIsNone(read(*POPULATION_BINDING))
                operations.pread.assert_not_called()
                self.assertEqual(operations.close.call_args_list, [call(18), call(17)])
        operations, ops = mock_read_ops()
        operations.stat_events.side_effect = [(EVENTS, stat.S_IFREG), (EVENTS, stat.S_IFLNK)]
        read = native.prepare_fixture_cgroup_population_reader(PIN, HANDLES, ops=ops)
        self.assertIsNone(read(*POPULATION_BINDING))
        self.assertEqual(operations.close.call_args_list, [call(18), call(17)])

    def test_read_and_close_failures_do_not_signal_empty(self):
        for port in ('pread', 'close'):
            with self.subTest(port=port):
                operations, ops = mock_read_ops()
                getattr(operations, port).side_effect = OSError('private fixture detail')
                read = native.prepare_fixture_cgroup_population_reader(PIN, HANDLES, ops=ops)
                self.assertIsNone(read(*POPULATION_BINDING))
                self.assertEqual(operations.close.call_args_list, [call(18), call(17)])

    def test_linux_arm64_native_read_ports_use_only_pinned_offsets_and_nofollow_stat(self):
        def set_statfs(fd, buffer):
            buffer._obj.filesystem = native.CGROUP2_MAGIC
            return 0

        namespace = SimpleNamespace(sysname='Linux', machine='aarch64')
        describe_directory = SimpleNamespace(st_dev=DIRECTORY.device, st_ino=DIRECTORY.inode, st_mode=stat.S_IFDIR)
        describe_events = SimpleNamespace(st_dev=EVENTS.device, st_ino=EVENTS.inode, st_mode=stat.S_IFREG)
        read = native.prepare_fixture_cgroup_population_reader(PIN, HANDLES)
        fstatfs = Mock(side_effect=set_statfs)
        with patch.object(native.os, 'uname', return_value=namespace), \
                patch.object(native.c, 'CDLL', return_value=SimpleNamespace(fstatfs=fstatfs)), \
                patch.object(native.os, 'dup', side_effect=[17, 18]), \
                patch.object(native.os, 'close') as close, \
                patch.object(native.os, 'fstat', side_effect=[describe_directory, describe_events]), \
                patch.object(native.os, 'get_inheritable', return_value=False), \
                patch.object(native.fcntl, 'fcntl', return_value=os.O_RDONLY), \
                patch.object(native.os, 'stat', return_value=describe_events) as lookup, \
                patch.object(native.os, 'pread', return_value=b'populated 0\n') as pread:
            self.assertIs(read(*POPULATION_BINDING), False)
            self.assertEqual([entry.args[0] for entry in fstatfs.call_args_list], [17, 18])
            self.assertEqual(lookup.call_args_list, [
                call('cgroup.events', dir_fd=17, follow_symlinks=False),
                call('cgroup.events', dir_fd=17, follow_symlinks=False),
            ])
            pread.assert_called_once_with(18, 4097, 0)
            self.assertEqual(close.call_args_list, [call(18), call(17)])
        with patch.object(native.os, 'uname', return_value=SimpleNamespace(sysname='Linux', machine='x86_64')), \
                patch.object(native.c, 'CDLL') as cdll:
            self.assertIsNone(read(*POPULATION_BINDING))
            cdll.assert_not_called()


class CleanupInventoryTests(unittest.TestCase):
    def setUp(self):
        self.operations = Mock()
        self.operations.clock.side_effect = [101, 103, 105]
        self.operations.fence.return_value = FENCE
        self.operations.population.return_value = False
        self.operations.resources.return_value = SAMPLE
        self.ports = harness.FixtureCleanupCollectorPorts(
            self.operations.clock, self.operations.fence, self.operations.population, self.operations.resources,
        )

    def test_verified_inventory_reaches_watchdog_with_native_read_operations_simulated(self):
        native_calls, ops = mock_read_ops()
        self.operations.population.side_effect = native.prepare_fixture_cgroup_population_reader(PIN, HANDLES, ops=ops)
        inventory = harness.collect_fixture_cleanup_inventory(SCOPE, self.ports)
        self.assertEqual(self.operations.mock_calls, [
            call.clock(), call.fence(), call.population(*POPULATION_BINDING), call.resources(),
            call.clock(), call.population(*POPULATION_BINDING), call.fence(), call.clock(),
        ])
        self.assertEqual(native_calls.pread.call_count, 2)
        self.assertEqual(inventory.resources, harness.FixtureOwnedResources(0, *EMPTY))
        canary_termination = Mock()
        watchdog = harness.FixtureCanaryWatchdog(
            PLAN, harness.FixtureWatchdogPorts(canary_termination.graceful, canary_termination.force),
        )
        self.assertEqual(watchdog.stop(BINDING, SCOPE.fence_ns)['watchdogState'], 'STOPPING')
        report = watchdog.poll(105, inventory=inventory)
        self.assertEqual(report['watchdogState'], 'STOPPED')
        self.assertEqual(report['watchdogCleanup'], 'VERIFIED')
        self.assertEqual(report['status'], 'HOLD')
        self.assertIs(report['liveLaunchPermitted'], False)
        self.assertEqual(report['qualifyingBuilderReceiptsAdded'], 0)
        canary_termination.force.assert_not_called()

    def test_watchdog_rejects_an_inventory_from_before_the_force_fence(self):
        inventory = harness.collect_fixture_cleanup_inventory(SCOPE, self.ports)
        self.assertIsInstance(inventory, harness.FixtureCleanupInventory)
        termination = Mock()
        watchdog = harness.FixtureCanaryWatchdog(PLAN, harness.FixtureWatchdogPorts(termination.graceful, termination.force))
        watchdog.stop(BINDING, SCOPE.fence_ns)
        force_tick = SCOPE.fence_ns + harness.WATCHDOG_GRACE_NS
        watchdog.poll(force_tick)
        termination.force.assert_called_once_with(PLAN)
        report = watchdog.poll(force_tick + 1, inventory=inventory)
        self.assertEqual(report['watchdogState'], 'STOPPING')
        self.assertEqual(report['watchdogCleanup'], 'UNCERTAIN')

    def test_reader_on_another_registered_capsule_cannot_satisfy_scope(self):
        other = PIN._replace(capsule=CAPSULE._replace(digest=b'x' * 32))
        native_calls, ops = mock_read_ops()
        self.operations.population.side_effect = native.prepare_fixture_cgroup_population_reader(other, HANDLES, ops=ops)
        self.assertIsNone(harness.collect_fixture_cleanup_inventory(SCOPE, self.ports))
        self.assertEqual(native_calls.mock_calls, [])
        self.operations.resources.assert_not_called()

    def test_positive_resource_counts_remain_uncertain_for_each_resource_class(self):
        for field in EMPTY._fields:
            with self.subTest(field=field):
                self.operations.clock.side_effect = [101, 103, 105]
                resources = EMPTY._replace(**{field: 1})
                self.operations.resources.return_value = SAMPLE._replace(resources=resources)
                inventory = harness.collect_fixture_cleanup_inventory(SCOPE, self.ports)
                self.assertEqual(getattr(inventory.resources, field), 1)
                self.assertEqual(harness.verify_fixture_canary_cleanup(PLAN, inventory, 100, 105).state, 'UNCERTAIN')

    def test_invalid_scope_or_ports_do_not_sample(self):
        for scope in (SCOPE._replace(fence_ns=True), SCOPE._replace(cgroup_digest=b''),
                      SCOPE._replace(resource_generation=PLAN.verifier_generation)):
            with self.subTest(scope=scope):
                self.assertIsNone(harness.collect_fixture_cleanup_inventory(scope, self.ports))
        self.assertIsNone(harness.collect_fixture_cleanup_inventory(SCOPE, self.ports._replace(read_fence=None)))
        self.assertEqual(self.operations.mock_calls, [])

    def test_no_evidence_when_fence_is_missing_replaced_or_not_quiesced(self):
        for fence in (None, FENCE._replace(state='REVOKED'), FENCE._replace(scope=SCOPE._replace(fence_ns=101))):
            for readbacks in ([fence, FENCE], [FENCE, fence]):
                with self.subTest(readbacks=readbacks):
                    self.operations.clock.side_effect = [101, 103, 105]
                    self.operations.fence.side_effect = readbacks
                    self.assertIsNone(harness.collect_fixture_cleanup_inventory(SCOPE, self.ports))

    def test_population_must_be_exactly_empty_before_and_after(self):
        for outcomes in ([True, False], [None, False], [0, False], [False, True], [False, None]):
            with self.subTest(outcomes=outcomes):
                self.operations.clock.side_effect = [101, 103, 105]
                self.operations.population.side_effect = outcomes
                self.assertIsNone(harness.collect_fixture_cleanup_inventory(SCOPE, self.ports))

    def test_rejects_partial_malformed_stale_or_misbound_resource_readback(self):
        for sample in (
            SAMPLE._replace(complete=False), SAMPLE._replace(complete=1),
            SAMPLE._replace(observed_ns=100), SAMPLE._replace(observed_ns=104),
            SAMPLE._replace(resources=EMPTY._replace(mounts=True)),
            SAMPLE._replace(resources=EMPTY._replace(sockets=-1)),
            SAMPLE._replace(resources=tuple(EMPTY)),
            SAMPLE._replace(scope=SCOPE._replace(resource_generation='fixture-stale')),
            SAMPLE._replace(scope=SCOPE._replace(cgroup_digest=b'x' * 32)),
            {'termination': 'FORCE_REQUESTED', 'cleanupVerified': True},
        ):
            with self.subTest(sample=sample):
                self.operations.clock.side_effect = [101, 103, 105]
                self.operations.resources.return_value = sample
                self.assertIsNone(harness.collect_fixture_cleanup_inventory(SCOPE, self.ports))

    def test_clock_rollback_deadline_and_read_errors_withhold_evidence(self):
        for ticks in ([99], [PLAN.cleanup_deadline_ns], [101, 100], [101, 103, 102],
                      [101, PLAN.cleanup_deadline_ns], [101, 103, PLAN.cleanup_deadline_ns]):
            with self.subTest(ticks=ticks):
                self.operations.clock.side_effect = ticks
                self.assertIsNone(harness.collect_fixture_cleanup_inventory(SCOPE, self.ports))
        self.operations.clock.side_effect = [101, 103, 105]
        self.operations.resources.side_effect = OSError('private fixture detail')
        self.assertIsNone(harness.collect_fixture_cleanup_inventory(SCOPE, self.ports))


if __name__ == '__main__':
    unittest.main()
