"""Offline watchdog pulses, owned cleanup verification and supervisory handoff."""

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock


SOURCE = (Path(__file__).resolve().parents[3]
          / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-harness.py')
spec = importlib.util.spec_from_file_location('canary_harness', SOURCE)
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)

GRACE = 250_000_000
REQUEST = harness.CanaryRequest('HOST_FILE_READ', 'CONTROL_BEFORE', 1, 'a' * 64, 'fixture-private-control')
BINDING = harness.FixtureAttemptBinding(REQUEST, 'fixture-private-supervisor', 'b' * 64, 300)
PLAN = harness.FixtureWatchdogPlan(
    'SYNTHETIC_ONLY', BINDING, 'fixture-private-capsule', 'fixture-private-watchdog',
    'fixture-private-verifier', 600_000_000,
)
EMPTY = harness.FixtureOwnedResources(0, 0, 0, 0, 0, 0, 0)
SCOPE = harness.CanaryScope(
    'SYNTHETIC_ONLY', '4913c5aa6004c11e3593ce8287344d1f2f4a5a94',
    'fixture-private-run', 'fixture-private-guest', 'c' * 64,
    'fixture-private-control', 'fixture-private-restricted',
)
TARGETS = harness.CanaryTargetDigests('1' * 64, '2' * 64, '3' * 64, '4' * 64)
GATES = (
    'physicalIsolationVerified', 'hostQualified', 'provisioningAuthorized', 'hostMutationAuthorized',
    'guestExecutionAuthorized', 'signInAuthorized', 'modelRequestsAuthorized',
    'bridgeActivationAuthorized', 'liveLaunchPermitted',
)


def inventory(fence, sampled, plan=PLAN, resources=EMPTY):
    return harness.FixtureCleanupInventory(
        plan.origin, plan.binding, plan.capsule_generation, plan.watchdog_generation, plan.verifier_generation,
        fence, sampled, True, resources,
    )


class CanaryWatchdogTests(unittest.TestCase):
    def setUp(self):
        self.graceful = Mock()
        self.force = Mock()
        self.ports = harness.FixtureWatchdogPorts(self.graceful, self.force)
        self.watchdog = harness.FixtureCanaryWatchdog(PLAN, self.ports)

    def assert_report(self, report, state, reason):
        self.assertEqual(report['schema'], 'DOSAI_LINUX_ARM64_GUEST_CANARY_WATCHDOG_V1')
        self.assertEqual(report['status'], 'HOLD')
        self.assertEqual(report['scope'], 'SOURCE_ONLY')
        self.assertEqual(report['watchdogState'], state)
        self.assertEqual(report['reason'], reason)
        self.assertEqual(report['qualifyingBuilderReceiptsAdded'], 0)
        for gate in GATES:
            self.assertIs(report[gate], False, gate)
        self.assertNotIn('fixture-private', repr(report))

    def test_invalid_registration_cannot_request_termination(self):
        for plan in (
            PLAN._replace(origin='LIVE'),
            PLAN._replace(verifier_generation=PLAN.watchdog_generation),
            PLAN._replace(watchdog_generation=BINDING.supervisor_generation),
            PLAN._replace(capsule_generation='/private/other'),
            PLAN._replace(cleanup_deadline_ns=BINDING.deadline_ns),
            PLAN._replace(binding=BINDING._replace(request=REQUEST._replace(sequence=True))),
            PLAN._replace(binding=BINDING._replace(request=REQUEST._replace(leg='RESTRICTED'))),
        ):
            with self.assertRaisesRegex(ValueError, '^Invalid synthetic canary watchdog plan\\.$'):
                harness.FixtureCanaryWatchdog(plan, self.ports)
        with self.assertRaises(ValueError):
            harness.FixtureCanaryWatchdog(PLAN, self.ports._replace(force_stop=None))
        self.graceful.assert_not_called()
        self.force.assert_not_called()

    def test_stop_demands_the_exact_binding_and_rejects_without_side_effects(self):
        for other in (
            BINDING._replace(supervisor_generation='fixture-old-supervisor'),
            BINDING._replace(target_digest='c' * 64),
            BINDING._replace(deadline_ns=BINDING.deadline_ns + 1),
            BINDING._replace(request=REQUEST._replace(process_start='fixture-recycled-process')),
            BINDING._replace(request=REQUEST._replace(challenge='d' * 64)),
        ):
            self.assert_report(self.watchdog.stop(other, 150), 'ACTIVE', 'WATCHDOG_BINDING_REJECTED')
            self.assertIsNone(self.watchdog.scope_readback(other))
            self.assertIsNone(self.watchdog.cleanup_readback(other))
        self.assertEqual(self.watchdog.scope_readback(BINDING).state, 'ACTIVE')
        self.graceful.assert_not_called()
        self.force.assert_not_called()

    def test_owner_stop_revokes_before_invoking_graceful_termination(self):
        def graceful(plan):
            self.assertEqual(self.watchdog.scope_readback(plan.binding).state, 'STOPPING')
            self.assertEqual(self.watchdog.cleanup_readback(plan.binding).state, 'UNCERTAIN')

        self.graceful.side_effect = graceful
        report = self.watchdog.stop(BINDING, 150)
        self.assert_report(report, 'STOPPING', 'OWNER_STOP_REQUESTED')
        self.assert_report(self.watchdog.stop(BINDING, 151), 'STOPPING', 'OWNER_STOP_REQUESTED')
        self.graceful.assert_called_once_with(PLAN)
        self.force.assert_not_called()

    def test_poll_expires_attempt_without_any_worker_or_result_callback(self):
        self.assert_report(self.watchdog.poll(299), 'ACTIVE', 'WATCHDOG_ARMED')
        self.graceful.assert_not_called()
        self.assert_report(self.watchdog.poll(300), 'STOPPING', 'WATCHDOG_ATTEMPT_EXPIRED')
        self.graceful.assert_called_once_with(PLAN)
        self.assertEqual(self.watchdog.scope_readback(BINDING).state, 'STOPPING')

    def test_missing_inventory_cannot_delay_force_and_stop_remains_idempotent(self):
        self.watchdog.stop(BINDING, 100)
        self.assert_report(self.watchdog.poll(99 + GRACE), 'STOPPING', 'OWNER_STOP_REQUESTED')
        self.force.assert_not_called()
        self.assert_report(self.watchdog.poll(100 + GRACE), 'STOPPING', 'OWNER_STOP_REQUESTED')
        self.watchdog.stop(BINDING, 101 + GRACE)
        self.watchdog.poll(102 + GRACE)
        self.force.assert_called_once_with(PLAN)
        self.graceful.assert_called_once_with(PLAN)

    def test_force_requires_cleanup_inventory_from_the_new_fence(self):
        self.watchdog.stop(BINDING, 100)
        forced_at = 100 + GRACE
        self.watchdog.poll(forced_at)
        old = self.watchdog.poll(forced_at + 1, inventory=inventory(100, 101))
        self.assert_report(old, 'STOPPING', 'OWNER_STOP_REQUESTED')
        self.assertEqual(self.watchdog.cleanup_readback(BINDING).state, 'UNCERTAIN')
        fresh = self.watchdog.poll(forced_at + 2, inventory=inventory(forced_at, forced_at + 1))
        self.assert_report(fresh, 'STOPPED', 'WATCHDOG_CLEANUP_VERIFIED')
        self.force.assert_called_once_with(PLAN)

    def test_valid_empty_quiesced_inventory_confirms_stop_before_forcing(self):
        self.watchdog.stop(BINDING, 100)
        clean = inventory(100, 101)
        report = self.watchdog.poll(101, inventory=clean)
        self.assert_report(report, 'STOPPED', 'WATCHDOG_CLEANUP_VERIFIED')
        self.assertEqual(report['watchdogCleanup'], 'VERIFIED')
        self.assertEqual(self.watchdog.cleanup_readback(BINDING).state, 'VERIFIED')
        self.assertEqual(self.watchdog.scope_readback(BINDING).state, 'STOPPED')
        self.assertEqual(self.watchdog.poll(PLAN.cleanup_deadline_ns), report)
        self.assertEqual(self.watchdog.stop(BINDING, PLAN.cleanup_deadline_ns), report)
        self.force.assert_not_called()

    def test_changed_generation_stale_future_or_partial_cleanup_is_uncertain(self):
        clean = inventory(100, 101)
        wrong_rows = (
            None, clean._replace(origin='LIVE'), clean._replace(quiesced=False), clean._replace(quiesced=1),
            clean._replace(capsule_generation='fixture-old-capsule'),
            clean._replace(watchdog_generation='fixture-old-watchdog'),
            clean._replace(verifier_generation=PLAN.watchdog_generation),
            clean._replace(binding=BINDING._replace(deadline_ns=BINDING.deadline_ns + 1)),
            clean._replace(fence_ns=99), clean._replace(observed_ns=99), clean._replace(observed_ns=102),
            clean._replace(resources=tuple(EMPTY)), clean._replace(resources=EMPTY._replace(processes=False)),
        )
        for record in wrong_rows:
            with self.subTest(record=record):
                self.assertEqual(harness.verify_fixture_canary_cleanup(PLAN, record, 100, 101).state, 'UNCERTAIN')
        self.assertEqual(harness.verify_fixture_canary_cleanup(PLAN, clean, 100, 101).state, 'VERIFIED')
        self.assertIsNone(harness.verify_fixture_canary_cleanup(PLAN._replace(origin='LIVE'), clean, 100, 101))

    def test_any_owned_resource_blocks_cleanup_verification(self):
        self.watchdog.stop(BINDING, 100)
        for name in EMPTY._fields:
            report = self.watchdog.poll(101, inventory=inventory(100, 101, resources=EMPTY._replace(**{name: 1})))
            self.assert_report(report, 'STOPPING', 'OWNER_STOP_REQUESTED')
            self.assertEqual(self.watchdog.cleanup_readback(BINDING).state, 'UNCERTAIN')
        self.force.assert_not_called()

    def test_cleanup_deadline_quarantines_and_rejects_late_inventory(self):
        self.watchdog.stop(BINDING, 100)
        report = self.watchdog.poll(PLAN.cleanup_deadline_ns, inventory=inventory(100, 101))
        self.assert_report(report, 'QUARANTINED', 'WATCHDOG_CLEANUP_EXPIRED')
        self.assertEqual(report['watchdogCleanup'], 'UNCERTAIN')
        self.assertEqual(self.watchdog.scope_readback(BINDING).state, 'REVOKED')
        self.assertEqual(self.watchdog.cleanup_readback(BINDING).state, 'UNCERTAIN')
        self.assertEqual(self.watchdog.poll(PLAN.cleanup_deadline_ns + 1, inventory=inventory(100, 101)), report)
        self.force.assert_called_once_with(PLAN)

    def test_first_late_pulse_forces_without_extending_cleanup_window(self):
        result = self.watchdog.poll(PLAN.cleanup_deadline_ns)
        self.assert_report(result, 'QUARANTINED', 'WATCHDOG_CLEANUP_EXPIRED')
        self.graceful.assert_not_called()
        self.force.assert_called_once_with(PLAN)

    def test_clock_failure_revokes_and_forces_only_the_registered_capsule(self):
        for clock in (True, -1, 199):
            graceful = Mock()
            force = Mock()
            watchdog = harness.FixtureCanaryWatchdog(PLAN, harness.FixtureWatchdogPorts(graceful, force))
            self.assert_report(watchdog.poll(200), 'ACTIVE', 'WATCHDOG_ARMED')
            result = watchdog.poll(clock)
            self.assert_report(result, 'QUARANTINED', 'WATCHDOG_CLOCK_UNAVAILABLE')
            self.assertEqual(watchdog.scope_readback(BINDING).state, 'REVOKED')
            watchdog.poll(201)
            graceful.assert_not_called()
            force.assert_called_once_with(PLAN)

    def test_transport_errors_escalate_but_require_independent_cleanup(self):
        self.graceful.side_effect = RuntimeError('fixture-private-graceful')
        self.force.side_effect = RuntimeError('fixture-private-force')
        result = self.watchdog.stop(BINDING, 100)
        self.assert_report(result, 'STOPPING', 'OWNER_STOP_REQUESTED')
        self.assertEqual(self.watchdog.cleanup_readback(BINDING).state, 'UNCERTAIN')
        self.force.assert_called_once_with(PLAN)
        report = self.watchdog.poll(102, inventory=inventory(100, 102))
        self.assert_report(report, 'STOPPED', 'WATCHDOG_CLEANUP_VERIFIED')
        self.force.assert_called_once_with(PLAN)

    def test_supervisor_rejects_a_late_success_after_watchdog_stop(self):
        registered = None
        watchdog = None
        tick = 100

        def read_scope(binding):
            nonlocal registered, watchdog
            if registered is None:
                registered = PLAN._replace(binding=binding)
                watchdog = harness.FixtureCanaryWatchdog(registered, self.ports)
            return watchdog.scope_readback(binding)

        def prepare(binding, guard):
            def attempt():
                nonlocal tick
                self.assertTrue(guard(binding.request.canary))
                tick = 101
                self.assert_report(watchdog.stop(binding, tick), 'STOPPING', 'OWNER_STOP_REQUESTED')
                tick = 102
                self.assert_report(watchdog.poll(tick, inventory=inventory(101, tick, registered)),
                                   'STOPPED', 'WATCHDOG_CLEANUP_VERIFIED')
                self.assertFalse(guard(binding.request.canary))
                return harness.FixtureAttempt(
                    SCOPE.origin, binding.request, binding.target_digest, binding.request.process_start,
                    binding.request.process_start, 'EXPECTED_MARKER_READ',
                )

            return attempt

        prepared = Mock(side_effect=prepare)
        policy = Mock(side_effect=AssertionError('Unexpected policy read'))
        ports = harness.FixtureSupervisorPorts(
            lambda: tick, read_scope, prepared, lambda binding: watchdog.cleanup_readback(binding), policy,
        )
        report = harness.rehearse_supervised_guest_canaries(SCOPE, TARGETS, BINDING.supervisor_generation, ports)
        self.assertEqual(report['status'], 'HOLD')
        self.assertEqual(report['reason'], 'SUPERVISOR_STOP_REQUESTED')
        self.assertEqual(report['supervisorCleanup'], 'VERIFIED')
        self.assertEqual(report['completedCanaries'], [])
        policy.assert_not_called()
        prepared.assert_called_once()
        self.graceful.assert_called_once_with(registered)
        self.force.assert_not_called()

    def test_normal_supervisor_cleanup_checks_inventory_before_policy(self):
        tick = 100

        def prepare(binding, guard):
            def attempt():
                request = binding.request
                self.assertTrue(guard(request.canary))
                result = 'PERMISSION_ERROR' if request.leg == 'RESTRICTED' else 'EXPECTED_MARKER_READ'
                return harness.FixtureAttempt(SCOPE.origin, request, binding.target_digest,
                                              request.process_start, request.process_start, result)

            return attempt

        def cleanup(binding):
            nonlocal tick
            plan = PLAN._replace(binding=binding)
            resources = EMPTY._replace(descriptors=1) if binding.request.leg == 'RESTRICTED' else EMPTY
            fence = tick
            tick += 1
            record = inventory(fence, tick, plan, resources)
            return harness.verify_fixture_canary_cleanup(plan, record, fence, tick)

        prepared = Mock(side_effect=prepare)
        policy = Mock(side_effect=AssertionError('Unexpected policy read'))
        ports = harness.FixtureSupervisorPorts(
            lambda: tick, lambda binding: harness.FixtureScopeReadback(SCOPE.origin, binding, 'ACTIVE'),
            prepared, cleanup, policy,
        )
        report = harness.rehearse_supervised_guest_canaries(SCOPE, TARGETS, BINDING.supervisor_generation, ports)
        self.assertEqual(report['status'], 'HOLD')
        self.assertEqual(report['supervisorState'], 'QUARANTINED')
        self.assertEqual(report['reason'], 'SUPERVISOR_CLEANUP_UNVERIFIED')
        self.assertEqual(report['completedCanaries'], [])
        self.assertEqual(prepared.call_count, 2)
        policy.assert_not_called()


if __name__ == '__main__':
    unittest.main()
