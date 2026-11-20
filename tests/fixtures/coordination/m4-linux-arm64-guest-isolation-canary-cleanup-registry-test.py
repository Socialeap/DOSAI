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
        self.readers = {kind: Mock(side_effect=self.vacant) for kind in KINDS}
        self.sources = harness.FixtureResourceReadSources(*(
            harness.FixtureResourceReadSource(
                'fixture-reader-' + kind.replace('_', '-'), 'fixture-authority', self.readers[kind],
            )
            for kind in KINDS
        ))
        self.next_slot = 1
        self.registry = self.prepare(self.clock)
        self.owner = self.registry.owner
        self.observer = self.registry.observer

    def prepare(self, clock):
        return harness.prepare_fixture_cleanup_registry(PLAN, CGROUP_DIGEST, RESOURCE_GENERATION, clock, self.sources)

    def stop_at(self, tick):
        self.clock.return_value = tick
        return self.owner.revoke_at(tick)

    def binding(self, kind):
        slot = self.next_slot
        self.next_slot += 1
        return harness.FixtureResourceBinding(
            kind, PLAN.capsule_generation, getattr(self.sources, kind).generation,
            'fixture-authority', f'fixture-slot-{slot}', f'fixture-instance-{slot}',
        )

    def vacant(self, probe):
        return harness.FixtureResourceReadback(probe, probe.binding, self.clock.return_value, True, 'VACANT', 0)

    def register(self, kind):
        ticket = self.owner.reserve_writer(kind)
        self.assertIsInstance(ticket, harness.FixtureResourceTicket)
        self.assertIs(self.owner.finish_writer(ticket, self.binding(kind)), True)
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
                    harness.prepare_fixture_cleanup_registry(plan, digest, generation, clock, self.sources)
        for sources in (
            None, tuple(self.sources), self.sources._replace(mounts=None),
            self.sources._replace(mounts=self.sources.mounts._replace(generation='outside')),
            self.sources._replace(mounts=self.sources.mounts._replace(authority_id='/outside')),
            self.sources._replace(mounts=self.sources.mounts._replace(read=None)),
        ):
            with self.subTest(sources=sources), self.assertRaises(ValueError):
                harness.prepare_fixture_cleanup_registry(PLAN, CGROUP_DIGEST, RESOURCE_GENERATION, self.clock, sources)
        for reader in self.readers.values():
            reader.assert_not_called()

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
        registry = self.prepare(clock)

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
        self.assertFalse(self.owner.verify_absent(forged, mount))
        self.readers['mounts'].assert_not_called()
        self.clock.return_value = 103
        self.assertTrue(self.owner.finish_writer(late_writer))
        readback = self.observer.read_fence()
        self.assertEqual(forged, readback)
        self.assertIsNot(forged, readback)
        self.assertFalse(self.owner.verify_absent(forged, mount))
        self.assertFalse(self.owner.verify_absent(readback, harness.FixtureResourceTicket()))
        self.readers['mounts'].assert_not_called()
        self.assertEqual(self.observer.read_resources().resources, harness.FixtureNonProcessResources(1, 1, 0, 0, 0, 0))
        self.assertTrue(self.owner.verify_absent(readback, mount))
        self.assertFalse(self.owner.verify_absent(readback, mount))
        self.assertEqual(self.readers['mounts'].call_count, 1)

    def test_duplicates_and_other_registry_tickets_have_no_authority(self):
        other = self.prepare(self.clock)
        foreign = other.owner.reserve_writer('leases')
        local = self.owner.reserve_writer('leases')
        self.assertNotEqual(local, foreign)
        self.assertFalse(self.owner.finish_writer(foreign))
        self.assertTrue(self.owner.finish_writer(local, self.binding('leases')))
        self.assertTrue(other.owner.finish_writer(foreign, self.binding('leases')))
        self.stop_at(100)
        other.owner.revoke_at(100)
        fence = self.observer.read_fence()
        other_fence = other.observer.read_fence()
        self.assertEqual(fence, other_fence)
        self.assertFalse(self.owner.verify_absent(fence, foreign))
        self.assertFalse(self.owner.verify_absent(other_fence, local))
        self.readers['leases'].assert_not_called()
        self.assertEqual(self.observer.read_resources().resources.leases, 1)

    def test_finish_binds_only_exact_kind_capsule_source_authority_and_unique_slot(self):
        ticket = self.owner.reserve_writer('mounts')
        binding = self.binding('mounts')
        for invalid in (
            tuple(binding), self.binding('sockets'), binding._replace(capsule_generation='fixture-other'),
            binding._replace(source_generation='fixture-other-reader'),
            binding._replace(authority_id='fixture-other-namespace'), binding._replace(slot_id='/outside'),
            binding._replace(instance_id='fixture-' + 'x' * 49),
        ):
            with self.subTest(binding=invalid):
                self.assertFalse(self.owner.finish_writer(ticket, invalid))
        self.assertTrue(self.owner.finish_writer(ticket, binding))
        self.assertFalse(self.owner.finish_writer(ticket, self.binding('mounts')))
        duplicate = self.owner.reserve_writer('mounts')
        self.assertFalse(self.owner.finish_writer(duplicate, binding._replace(instance_id='fixture-replacement')))
        self.assertTrue(self.owner.finish_writer(duplicate, self.binding('mounts')))
        self.stop_at(100)
        fence = self.observer.read_fence()
        self.assertTrue(self.owner.verify_absent(fence, ticket))
        self.assertEqual(self.readers['mounts'].call_args.args[0].binding, binding)
        self.assertEqual(self.observer.read_resources().resources.mounts, 1)

    def test_unknown_partial_acquisition_stays_counted_without_a_reader_call(self):
        ticket = self.owner.reserve_writer('descriptors')
        self.assertTrue(self.owner.finish_writer(ticket))
        self.assertFalse(self.owner.finish_writer(ticket, self.binding('descriptors')))
        self.stop_at(100)
        self.assertFalse(self.owner.verify_absent(self.observer.read_fence(), ticket))
        self.assertEqual(self.observer.read_resources().resources.descriptors, 1)
        self.readers['descriptors'].assert_not_called()

    def test_rejects_misbound_incomplete_occupied_and_stale_readbacks(self):
        ticket = self.register('sockets')
        self.stop_at(100)
        fence = self.observer.read_fence()
        self.clock.return_value = 103
        reader = self.readers['sockets']
        for changes in (
            {'complete': False}, {'complete': 1}, {'slot_state': 'PRESENT'}, {'slot_state': 'REPLACED'},
            {'slot_state': 'UNAVAILABLE'}, {'owned_references': 1}, {'owned_references': False},
            {'observed_ns': 102}, {'observed_ns': 104}, {'observed_ns': True},
        ):
            with self.subTest(changes=changes):
                reader.side_effect = lambda probe: self.vacant(probe)._replace(**changes)
                self.assertFalse(self.owner.verify_absent(fence, ticket))
        for changes in (
            {'authority_id': 'fixture-other-authority'}, {'slot_id': 'fixture-neighbor'},
            {'instance_id': 'fixture-reused'}, {'source_generation': 'fixture-old-source'},
        ):
            with self.subTest(binding_changes=changes):
                reader.side_effect = lambda probe: self.vacant(probe)._replace(binding=probe.binding._replace(**changes))
                self.assertFalse(self.owner.verify_absent(fence, ticket))
        reader.side_effect = lambda probe: self.vacant(probe)._replace(probe=probe._replace())
        self.assertFalse(self.owner.verify_absent(fence, ticket))
        reader.side_effect = OSError('unavailable')
        self.assertFalse(self.owner.verify_absent(fence, ticket))
        reader.side_effect = lambda _: {'slot_state': 'VACANT', 'owned_references': 0}
        self.assertFalse(self.owner.verify_absent(fence, ticket))
        self.assertEqual(self.observer.read_resources().resources.sockets, 1)
        reader.side_effect = self.vacant
        self.assertTrue(self.owner.verify_absent(fence, ticket))

    def test_force_during_resource_read_discards_stale_result(self):
        ticket = self.register('temporary_files')
        self.stop_at(100)
        first = self.observer.read_fence()

        def force_during_read(probe):
            self.stop_at(101)
            return self.vacant(probe)

        self.readers['temporary_files'].side_effect = force_during_read
        self.assertFalse(self.owner.verify_absent(first, ticket))
        fence = self.observer.read_fence()
        self.assertEqual(fence.scope.fence_ns, 101)
        self.assertEqual(self.observer.read_resources().resources.temporary_files, 1)
        self.readers['temporary_files'].side_effect = self.vacant
        self.assertTrue(self.owner.verify_absent(fence, ticket))

    def test_read_crossing_cleanup_deadline_never_clears_ticket(self):
        ticket = self.register('brokered')
        self.stop_at(100)
        fence = self.observer.read_fence()

        def expire_during_read(probe):
            self.clock.return_value = PLAN.cleanup_deadline_ns
            return self.vacant(probe)._replace(observed_ns=100)

        self.readers['brokered'].side_effect = expire_during_read
        self.assertFalse(self.owner.verify_absent(fence, ticket))
        self.clock.return_value = 101
        self.assertIsNone(self.observer.read_resources())

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
            self.assertTrue(self.owner.verify_absent(fence, ticket))
        for kind, expected in zip(KINDS, counts):
            with self.subTest(kind=kind):
                self.assertEqual(self.readers[kind].call_count, expected)
                probe = self.readers[kind].call_args.args[0]
                self.assertIs(probe.scope, fence.scope)
                self.assertEqual(probe.binding.kind, kind)
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
        self.assertFalse(self.owner.verify_absent(first, ticket))
        self.assertEqual(self.observer.read_resources().resources.brokered, 1)
        self.assertTrue(self.owner.verify_absent(second, ticket))
        self.stop_at(110)
        self.observer.read_fence()
        self.assertEqual(self.observer.read_resources().resources.brokered, 0)
        self.assertIsNone(self.owner.reserve_writer('brokered'))

    def test_missing_or_expired_stop_tick_revokes_without_any_clock_callback(self):
        for tick in (None, True, -1, PLAN.cleanup_deadline_ns):
            with self.subTest(tick=tick):
                clock = Mock(side_effect=AssertionError('clock should not run inside revocation'))
                registry = self.prepare(clock)
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
        self.assertTrue(self.owner.finish_writer(ticket, self.binding('leases')))
        fence = self.observer.read_fence()
        self.assertIsNotNone(fence)
        for unavailable in (True, None, 299, PLAN.cleanup_deadline_ns):
            with self.subTest(unavailable=unavailable):
                self.clock.return_value = unavailable
                self.assertIsNone(self.observer.read_fence())
                self.assertIsNone(self.observer.read_resources())
                self.assertFalse(self.owner.verify_absent(fence, ticket))
        self.readers['leases'].assert_not_called()
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
        self.assertTrue(self.owner.verify_absent(fence, ticket))
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
