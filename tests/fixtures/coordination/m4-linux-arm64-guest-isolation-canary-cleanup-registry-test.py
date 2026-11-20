"""Offline fixture checks for the owner-held cleanup fence and resource registry."""

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock


SOURCE = (Path(__file__).resolve().parents[3]
          / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-harness.py')
spec = importlib.util.spec_from_file_location('canary_harness', SOURCE)
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)

REQUEST = harness.CanaryRequest('HOST_FILE_READ', 'CONTROL_BEFORE', 1, 'a' * 64, 'fixture-control')
BINDING = harness.FixtureAttemptBinding(REQUEST, 'fixture-supervisor', 'b' * 64, 300)
PLAN = harness.FixtureWatchdogPlan(
    'SYNTHETIC_ONLY', BINDING, 'fixture-capsule', 'fixture-watchdog', 'fixture-verifier', 600_000_000,
)
CGROUP_DIGEST = b'c' * 32
RESOURCE_GENERATION = 'fixture-resource-owner'
KINDS = harness.FixtureNonProcessResources._fields


class CleanupRegistryTests(unittest.TestCase):
    def setUp(self):
        self.clock = Mock(return_value=20)
        self.registry = harness.prepare_fixture_cleanup_registry(PLAN, CGROUP_DIGEST, RESOURCE_GENERATION, self.clock)
        self.owner = self.registry.owner
        self.observer = self.registry.observer

    def stop_at(self, tick):
        self.clock.return_value = tick
        return self.owner.revoke_at(tick)

    def register(self, kind):
        ticket = self.owner.reserve_writer(kind)
        self.assertIsInstance(ticket, harness.FixtureResourceTicket)
        self.assertIs(self.owner.finish_writer(ticket), True)
        return ticket

    def test_registration_and_observer_authority_are_separate(self):
        self.clock.assert_not_called()
        self.assertEqual(self.observer._fields, ('read_fence', 'read_resources'))
        self.assertIsNone(self.observer.read_fence())
        self.assertIsNone(self.observer.read_resources())
        for plan, digest, generation, clock in (
            (PLAN._replace(origin='LIVE'), CGROUP_DIGEST, RESOURCE_GENERATION, self.clock),
            (PLAN, bytearray(CGROUP_DIGEST), RESOURCE_GENERATION, self.clock),
            (PLAN, CGROUP_DIGEST, PLAN.verifier_generation, self.clock),
            (PLAN, CGROUP_DIGEST, RESOURCE_GENERATION, None),
        ):
            with self.subTest(plan=plan, digest=digest, generation=generation, clock=clock):
                with self.assertRaisesRegex(ValueError, '^Invalid synthetic cleanup registry\\.$'):
                    harness.prepare_fixture_cleanup_registry(plan, digest, generation, clock)

    def test_revocation_is_immediate_and_an_existing_writer_must_drain(self):
        ticket = self.owner.reserve_writer('mounts')
        scope = self.stop_at(100)
        self.assertEqual(scope, harness.FixtureCleanupScope(PLAN, 100, CGROUP_DIGEST, RESOURCE_GENERATION))
        self.assertIsNone(self.owner.reserve_writer('sockets'))
        self.assertIsNone(self.observer.read_fence())
        self.assertIsNone(self.observer.read_resources())
        self.clock.return_value = 101
        self.assertTrue(self.owner.finish_writer(ticket))
        readback = self.observer.read_fence()
        self.assertEqual(readback, harness.FixtureCleanupFenceReadback(scope, 'REVOKED_QUIESCED'))
        self.assertEqual(self.observer.read_resources().resources.mounts, 1)
        self.assertFalse(self.owner.finish_writer(ticket))
        self.assertIsNone(self.owner.reserve_writer('sockets'))

    def test_stop_wins_while_a_reservation_samples_the_clock(self):
        clock = Mock()
        registry = harness.prepare_fixture_cleanup_registry(PLAN, CGROUP_DIGEST, RESOURCE_GENERATION, clock)

        def clock_with_stop():
            registry.owner.revoke_at(50)
            return 49

        clock.side_effect = clock_with_stop
        self.assertIsNone(registry.owner.reserve_writer('sockets'))
        clock.side_effect = None
        clock.return_value = 50
        self.assertIsNotNone(registry.observer.read_fence())
        self.assertEqual(registry.observer.read_resources().resources.sockets, 0)

    def test_absence_must_follow_all_writers_draining_and_exact_readback(self):
        mount = self.register('mounts')
        late_writer = self.owner.reserve_writer('sockets')
        scope = self.stop_at(100)
        forged = harness.FixtureCleanupFenceReadback(scope, 'REVOKED_QUIESCED')
        self.assertFalse(self.owner.record_absent(harness.FixtureResourceAbsence(forged, mount, 100)))
        self.clock.return_value = 103
        self.assertTrue(self.owner.finish_writer(late_writer))
        readback = self.observer.read_fence()
        self.assertEqual(forged, readback)
        self.assertIsNot(forged, readback)
        for absence in (
            harness.FixtureResourceAbsence(forged, mount, 103),
            harness.FixtureResourceAbsence(readback, mount, 102),
            harness.FixtureResourceAbsence(readback, mount, 104),
            harness.FixtureResourceAbsence(readback, mount, True),
            harness.FixtureResourceAbsence(readback, harness.FixtureResourceTicket(), 103),
        ):
            with self.subTest(absence=absence):
                self.assertFalse(self.owner.record_absent(absence))
        self.assertEqual(self.observer.read_resources().resources, harness.FixtureNonProcessResources(1, 1, 0, 0, 0, 0))
        proof = harness.FixtureResourceAbsence(readback, mount, 103)
        self.assertTrue(self.owner.record_absent(proof))
        self.assertFalse(self.owner.record_absent(proof))

    def test_duplicates_and_other_registry_tickets_have_no_authority(self):
        other = harness.prepare_fixture_cleanup_registry(PLAN, CGROUP_DIGEST, RESOURCE_GENERATION, self.clock)
        foreign = other.owner.reserve_writer('leases')
        local = self.owner.reserve_writer('leases')
        self.assertNotEqual(local, foreign)
        self.assertFalse(self.owner.finish_writer(foreign))
        self.assertTrue(self.owner.finish_writer(local))
        self.assertTrue(other.owner.finish_writer(foreign))
        self.stop_at(100)
        other.owner.revoke_at(100)
        fence = self.observer.read_fence()
        other_fence = other.observer.read_fence()
        self.assertEqual(fence, other_fence)
        self.assertFalse(self.owner.record_absent(harness.FixtureResourceAbsence(fence, foreign, 100)))
        self.assertFalse(self.owner.record_absent(harness.FixtureResourceAbsence(other_fence, local, 100)))
        self.assertEqual(self.observer.read_resources().resources.leases, 1)

    def test_exact_counts_and_bounded_admission(self):
        for kind in (None, 'processes', 'arbitrary', True, ['mounts']):
            with self.subTest(kind=kind):
                self.assertIsNone(self.owner.reserve_writer(kind))
        tickets = [self.register(KINDS[index % len(KINDS)]) for index in range(harness.MAX_CLEANUP_RESOURCES)]
        self.assertIsNone(self.owner.reserve_writer('descriptors'))
        self.stop_at(100)
        fence = self.observer.read_fence()
        counts = self.observer.read_resources().resources
        self.assertEqual(counts, harness.FixtureNonProcessResources(11, 11, 11, 11, 10, 10))
        for ticket in tickets:
            self.assertTrue(self.owner.record_absent(harness.FixtureResourceAbsence(fence, ticket, 100)))
        self.assertEqual(self.observer.read_resources().resources, harness.FixtureNonProcessResources(0, 0, 0, 0, 0, 0))
        self.assertIsNone(self.owner.reserve_writer('descriptors'))

    def test_force_advances_fence_and_preserves_reduce_only_state(self):
        ticket = self.register('brokered')
        first_scope = self.stop_at(100)
        first = self.observer.read_fence()
        self.assertIs(self.owner.revoke_at(100), first_scope)
        self.assertIs(self.observer.read_fence(), first)
        next_scope = self.stop_at(105)
        self.assertIsNone(self.owner.revoke_at(100))
        self.assertIsNone(self.observer.read_resources())
        second = self.observer.read_fence()
        self.assertEqual(second.scope, next_scope)
        self.assertFalse(self.owner.record_absent(harness.FixtureResourceAbsence(first, ticket, 105)))
        self.assertEqual(self.observer.read_resources().resources.brokered, 1)
        self.assertTrue(self.owner.record_absent(harness.FixtureResourceAbsence(second, ticket, 105)))
        self.stop_at(110)
        self.observer.read_fence()
        self.assertEqual(self.observer.read_resources().resources.brokered, 0)
        self.assertIsNone(self.owner.reserve_writer('brokered'))

    def test_missing_or_expired_stop_tick_revokes_without_any_clock_callback(self):
        for tick in (None, True, -1, PLAN.cleanup_deadline_ns):
            with self.subTest(tick=tick):
                clock = Mock(side_effect=AssertionError('clock should not run inside revocation'))
                registry = harness.prepare_fixture_cleanup_registry(PLAN, CGROUP_DIGEST, RESOURCE_GENERATION, clock)
                self.assertIsNone(registry.owner.revoke_at(tick))
                clock.assert_not_called()
                clock.side_effect = None
                clock.return_value = 100
                self.assertIsNone(registry.owner.revoke_at(100))
                self.assertIsNone(registry.owner.reserve_writer('sockets'))
                self.assertIsNone(registry.observer.read_fence())

    def test_deadlines_unavailable_clock_and_rollback_withhold_evidence(self):
        ticket = self.owner.reserve_writer('leases')
        self.clock.return_value = PLAN.binding.deadline_ns
        self.assertIsNone(self.owner.reserve_writer('sockets'))
        self.stop_at(300)
        self.clock.return_value = 299
        self.assertFalse(self.owner.finish_writer(ticket))
        self.assertIsNone(self.observer.read_fence())
        self.clock.return_value = 300
        self.assertTrue(self.owner.finish_writer(ticket))
        fence = self.observer.read_fence()
        self.assertIsNotNone(fence)
        for unavailable in (True, None, 299, PLAN.cleanup_deadline_ns):
            with self.subTest(unavailable=unavailable):
                self.clock.return_value = unavailable
                self.assertIsNone(self.observer.read_fence())
                self.assertIsNone(self.observer.read_resources())
                self.assertFalse(self.owner.record_absent(harness.FixtureResourceAbsence(fence, ticket, 300)))
        self.clock.return_value = 301
        self.assertIsNone(self.observer.read_fence())
        self.assertIsNone(self.observer.read_resources())
        self.clock.side_effect = OSError('private clock fixture error')
        self.assertIsNone(self.observer.read_resources())

    def test_registry_inventory_connects_to_watchdog_without_granting_authority(self):
        ticket = self.register('temporary_files')
        terminate = Mock(return_value='FORCE_REQUESTED')
        watchdog = harness.FixtureCanaryWatchdog(
            PLAN, harness.FixtureWatchdogPorts(lambda _: self.owner.revoke_at(100), terminate),
        )
        self.clock.return_value = 100
        watchdog.stop(BINDING, 100)
        fence = self.observer.read_fence()
        population = Mock(return_value=False)
        ports = harness.FixtureCleanupCollectorPorts(
            self.clock, self.observer.read_fence, population, self.observer.read_resources,
        )
        inventory = harness.collect_fixture_cleanup_inventory(fence.scope, ports)
        self.assertEqual(watchdog.poll(100, inventory=inventory)['watchdogCleanup'], 'UNCERTAIN')
        self.clock.return_value = 101
        self.assertTrue(self.owner.record_absent(harness.FixtureResourceAbsence(fence, ticket, 101)))
        inventory = harness.collect_fixture_cleanup_inventory(fence.scope, ports)
        report = watchdog.poll(101, inventory=inventory)
        self.assertEqual(report['watchdogState'], 'STOPPED')
        self.assertEqual(report['watchdogCleanup'], 'VERIFIED')
        self.assertEqual(report['status'], 'HOLD')
        self.assertIs(report['guestExecutionAuthorized'], False)
        self.assertIs(report['modelRequestsAuthorized'], False)
        self.assertIs(report['liveLaunchPermitted'], False)
        self.assertEqual(report['qualifyingBuilderReceiptsAdded'], 0)
        terminate.assert_not_called()

    def test_fence_advance_during_collection_withholds_mixed_inventory(self):
        scope = self.stop_at(100)

        def sample_population(*_binding):
            self.stop_at(101)
            return False

        ports = harness.FixtureCleanupCollectorPorts(
            self.clock, self.observer.read_fence, sample_population, self.observer.read_resources,
        )
        self.assertIsNone(harness.collect_fixture_cleanup_inventory(scope, ports))
        self.assertEqual(self.observer.read_fence().scope.fence_ns, 101)


if __name__ == '__main__':
    unittest.main()
