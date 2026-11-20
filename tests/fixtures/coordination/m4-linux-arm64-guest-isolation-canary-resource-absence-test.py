"""Offline slot and owned-reference inventories for the six cleanup readers."""

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
SCOPE = harness.FixtureCleanupScope(PLAN, 100, b'c' * 32, 'fixture-resource-registry')
KINDS = harness.FixtureNonProcessResources._fields
TARGET_SLOT = 'fixture-slot'
TARGET_INSTANCE = 'fixture-instance'
ROW = harness.FixtureResourceInventoryRow


class ResourceAbsenceReadersTests(unittest.TestCase):
    def setUp(self):
        self.clock = Mock(return_value=100)
        self.snapshots = {kind: Mock(side_effect=self.empty_snapshot) for kind in KINDS}
        self.sources = tuple(
            harness.FixtureResourceInventorySource(
                kind, f'fixture-reader-{index}', f'fixture-authority-{index}', self.snapshots[kind],
            )
            for index, kind in enumerate(KINDS)
        )
        self.readers = self.prepare(tuple(reversed(self.sources)))

    def prepare(self, sources):
        return harness.prepare_fixture_resource_absence_readers(
            PLAN, SCOPE.cgroup_digest, SCOPE.resource_generation, sources,
        )

    def probe(self, kind):
        pin = next(source for source in self.sources if source.kind == kind)
        return harness.FixtureResourceProbe(SCOPE, harness.FixtureResourceBinding(
            kind, PLAN.capsule_generation, pin.generation, pin.authority_id, TARGET_SLOT, TARGET_INSTANCE,
        ))

    def empty_snapshot(self, probe):
        pin = probe.binding
        return harness.FixtureResourceInventorySnapshot(
            probe, probe.scope, pin.kind, pin.source_generation, pin.authority_id,
            self.clock.return_value, True, True, (), (),
        )

    def test_requires_exactly_one_pinned_source_per_kind_with_no_reads_during_preparation(self):
        for sources in (
            list(self.sources), self.sources[:-1], self.sources + self.sources[:1],
            self.sources[:-1] + self.sources[:1],
            (self.sources[0]._replace(kind='processes'), *self.sources[1:]),
            (self.sources[0]._replace(generation='/wrong'), *self.sources[1:]),
            (self.sources[0]._replace(authority_id=None), *self.sources[1:]),
            (self.sources[0]._replace(snapshot=None), *self.sources[1:]),
        ):
            with self.subTest(sources=sources), self.assertRaises(ValueError):
                self.prepare(sources)
        for snapshot in self.snapshots.values():
            snapshot.assert_not_called()

    def test_all_six_readers_use_their_own_source_and_exact_probe(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                probe = self.probe(kind)
                readback = getattr(self.readers, kind).read(probe)
                self.assertEqual(readback, harness.FixtureResourceReadback(probe, probe.binding, 100, True, 'VACANT', 0))
                self.assertIs(readback.probe, probe)
                self.snapshots[kind].assert_called_once_with(probe)

    def test_wrong_probe_scope_and_pin_are_rejected_before_observation(self):
        probe = self.probe('mounts')
        for wrong in (
            tuple(probe), self.probe('sockets'),
            probe._replace(scope=SCOPE._replace(cgroup_digest=b'x' * 32)),
            probe._replace(scope=SCOPE._replace(resource_generation='fixture-other-registry')),
            probe._replace(scope=SCOPE._replace(plan=PLAN._replace(watchdog_generation='fixture-other-watchdog'))),
            probe._replace(scope=SCOPE._replace(fence_ns=PLAN.cleanup_deadline_ns)),
            probe._replace(binding=probe.binding._replace(capsule_generation='fixture-other-capsule')),
            probe._replace(binding=probe.binding._replace(source_generation='fixture-wrong-source')),
            probe._replace(binding=probe.binding._replace(authority_id='fixture-wrong-namespace')),
            probe._replace(binding=probe.binding._replace(slot_id='/outside')),
        ):
            with self.subTest(probe=wrong):
                self.assertIsNone(self.readers.mounts.read(wrong))
        self.snapshots['mounts'].assert_not_called()

    def test_complete_tables_derive_vacancy_replacement_and_private_alias_count(self):
        probe = self.probe('descriptors')
        other = 'fixture-unrelated'
        for slots, references, state, count in (
            ((ROW('fixture-unrelated-slot', other),), (ROW('fixture-unrelated-ref', other),), 'VACANT', 0),
            ((ROW(TARGET_SLOT, TARGET_INSTANCE),), (), 'PRESENT', 1),
            ((ROW(TARGET_SLOT, other),), (), 'REPLACED', 0),
            ((ROW('fixture-moved-slot', TARGET_INSTANCE),), (), 'VACANT', 1),
            ((), (ROW('fixture-retained-ref', TARGET_INSTANCE),), 'VACANT', 1),
            ((ROW('fixture-alias-slot', TARGET_INSTANCE),),
             (ROW('fixture-ref-one', TARGET_INSTANCE), ROW('fixture-ref-two', TARGET_INSTANCE)), 'VACANT', 3),
        ):
            with self.subTest(state=state, count=count):
                self.snapshots['descriptors'].side_effect = (
                    lambda request: self.empty_snapshot(request)._replace(slots=slots, references=references)
                )
                readback = self.readers.descriptors.read(probe)
                self.assertEqual((readback.slot_state, readback.owned_references), (state, count))

    def test_snapshot_requires_both_coverages_fresh_probe_and_matching_source(self):
        probe = self.probe('temporary_files')
        for changes in (
            {'probe': probe._replace()},
            {'scope': SCOPE._replace(fence_ns=101)},
            {'kind': 'sockets'}, {'source_generation': 'fixture-stale-source'},
            {'authority_id': 'fixture-other-directory'},
            {'observed_ns': 99}, {'observed_ns': PLAN.cleanup_deadline_ns}, {'observed_ns': True},
            {'slots_complete': False}, {'references_complete': False}, {'references_complete': 1},
        ):
            with self.subTest(changes=changes):
                self.snapshots['temporary_files'].side_effect = (
                    lambda request: self.empty_snapshot(request)._replace(**changes)
                )
                self.assertIsNone(self.readers.temporary_files.read(probe))
        for invalid in (None, {'slots_complete': True, 'references_complete': True}):
            self.snapshots['temporary_files'].side_effect = lambda _: invalid
            self.assertIsNone(self.readers.temporary_files.read(probe))
        self.snapshots['temporary_files'].side_effect = PermissionError('private detail')
        self.assertIsNone(self.readers.temporary_files.read(probe))

    def test_bounded_tables_reject_duplicates_malformed_rows_and_truncation(self):
        probe = self.probe('leases')
        source = self.snapshots['leases']
        cap = harness.MAX_RESOURCE_INVENTORY_ROWS
        rows = tuple(ROW(f'fixture-entry-{index}', 'fixture-unrelated') for index in range(cap))
        for field in ('slots', 'references'):
            for value in (
                list(rows), rows + (ROW('fixture-overflow', 'fixture-unrelated'),),
                (ROW('fixture-same', TARGET_INSTANCE), ROW('fixture-same', 'fixture-replacement')),
                (('fixture-entry', TARGET_INSTANCE),), (ROW('/outside', TARGET_INSTANCE),),
                (ROW('fixture-entry', True),),
            ):
                with self.subTest(field=field, sample=value[:2]):
                    source.side_effect = lambda request: self.empty_snapshot(request)._replace(**{field: value})
                    self.assertIsNone(self.readers.leases.read(probe))
        source.side_effect = lambda request: self.empty_snapshot(request)._replace(slots=rows, references=rows)
        self.assertEqual(self.readers.leases.read(probe).owned_references, 0)

    def test_registry_holds_until_slot_and_all_references_are_clear(self):
        registry = harness.prepare_fixture_cleanup_registry(
            PLAN, SCOPE.cgroup_digest, SCOPE.resource_generation, self.clock, self.readers,
        )
        tickets = {}
        for kind in KINDS:
            ticket = registry.owner.reserve_writer(kind)
            self.assertTrue(registry.owner.finish_writer(ticket, self.probe(kind).binding))
            tickets[kind] = ticket
        registry.owner.revoke_at(SCOPE.fence_ns)
        fence = registry.observer.read_fence()
        self.snapshots['mounts'].side_effect = lambda probe: self.empty_snapshot(probe)._replace(
            references=(ROW('fixture-detached-reference', TARGET_INSTANCE),),
        )
        self.snapshots['sockets'].side_effect = lambda probe: self.empty_snapshot(probe)._replace(
            slots=(ROW(TARGET_SLOT, 'fixture-slot-reuse'),),
        )
        ports = harness.FixtureCleanupCollectorPorts(
            self.clock, registry.observer.read_fence, Mock(return_value=False), registry.observer.read_resources,
        )
        for kind, ticket in tickets.items():
            with self.subTest(kind=kind):
                self.assertIs(registry.owner.verify_absent(fence, ticket), kind not in ('mounts', 'sockets'))
        inventory = harness.collect_fixture_cleanup_inventory(fence.scope, ports)
        self.assertEqual(inventory.resources, harness.FixtureOwnedResources(0, 1, 1, 0, 0, 0, 0))
        self.assertEqual(harness.verify_fixture_canary_cleanup(PLAN, inventory, 100, 100).state, 'UNCERTAIN')
        for kind in ('mounts', 'sockets'):
            self.snapshots[kind].side_effect = self.empty_snapshot
            self.assertTrue(registry.owner.verify_absent(fence, tickets[kind]))
        inventory = harness.collect_fixture_cleanup_inventory(fence.scope, ports)
        self.assertEqual(harness.verify_fixture_canary_cleanup(PLAN, inventory, 100, 100).state, 'VERIFIED')

    def test_sampled_after_force_fence_change_cannot_clear_the_old_ticket(self):
        registry = harness.prepare_fixture_cleanup_registry(
            PLAN, SCOPE.cgroup_digest, SCOPE.resource_generation, self.clock, self.readers,
        )
        ticket = registry.owner.reserve_writer('brokered')
        self.assertTrue(registry.owner.finish_writer(ticket, self.probe('brokered').binding))
        registry.owner.revoke_at(SCOPE.fence_ns)
        fence = registry.observer.read_fence()

        def advance_during_read(probe):
            self.clock.return_value = 101
            registry.owner.revoke_at(101)
            return self.empty_snapshot(probe)

        self.snapshots['brokered'].side_effect = advance_during_read
        self.assertFalse(registry.owner.verify_absent(fence, ticket))
        self.assertEqual(registry.observer.read_fence().scope.fence_ns, 101)
        self.assertEqual(registry.observer.read_resources().resources.brokered, 1)


if __name__ == '__main__':
    unittest.main()
