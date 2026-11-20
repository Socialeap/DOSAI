"""Offline canary supervision, including the native binding with substituted operations."""

import importlib.util
import os
from pathlib import Path
import socket
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock, call, patch


TOOL_DIR = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot'
PREFIX = 'm4-linux-arm64-guest-isolation-canary-'


def load_source(suffix):
    spec = importlib.util.spec_from_file_location(suffix, TOOL_DIR / (PREFIX + suffix + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


harness = load_source('harness')
driver = load_source('probe-driver')
SCOPE = harness.CanaryScope(
    'SYNTHETIC_ONLY', '4913c5aa6004c11e3593ce8287344d1f2f4a5a94',
    'fixture-private-run', 'fixture-private-guest', 'f' * 64,
    'fixture-control', 'fixture-restricted',
)
TARGETS = harness.CanaryTargetDigests('1' * 64, '2' * 64, '3' * 64, '4' * 64)
GENERATION = 'fixture-private-supervisor'
GATES = (
    'physicalIsolationVerified', 'hostQualified', 'provisioningAuthorized', 'hostMutationAuthorized',
    'guestExecutionAuthorized', 'signInAuthorized', 'modelRequestsAuthorized',
    'bridgeActivationAuthorized', 'liveLaunchPermitted',
)
BUDGET = 250_000_000


def attempt_record(binding, outcome=None):
    request = binding.request
    if outcome is None:
        outcome = ('PERMISSION_ERROR' if request.leg == 'RESTRICTED'
                   else harness.SUCCESS_RESULTS[request.canary])
    return harness.FixtureAttempt(SCOPE.origin, request, binding.target_digest,
                                  request.process_start, request.process_start, outcome)


class CanarySupervisorTests(unittest.TestCase):
    def setUp(self):
        self.tick = 100
        self.state = 'ACTIVE'
        self.guards = []
        self.executed = []
        self.events = []
        self.clock = Mock(side_effect=lambda: self.tick)
        self.scope = Mock(side_effect=self.scope_record)
        self.prepare = Mock(side_effect=self.prepare_fixture)
        self.cleanup = Mock(side_effect=self.cleanup_fixture)
        self.read_denial = Mock(side_effect=self.denial_record)
        self.ports = harness.FixtureSupervisorPorts(
            self.clock, self.scope, self.prepare, self.cleanup, self.read_denial,
        )

    def scope_record(self, binding):
        return harness.FixtureScopeReadback(SCOPE.origin, binding, self.state)

    def denial_record(self, binding):
        self.events.append(('policy', binding))
        return harness.FixturePolicyDenial(SCOPE.origin, binding.request, binding.target_digest,
                                          SCOPE.configuration_digest, 'BLOCKED')

    def prepare_fixture(self, binding, scope_active):
        self.events.append(('prepare', binding))
        self.guards.append(scope_active)
        self.assertFalse(scope_active(binding.request.canary))

        def run():
            self.assertTrue(scope_active(binding.request.canary))
            self.executed.append(binding)
            self.events.append(('run', binding))
            return attempt_record(binding)

        return run

    def cleanup_fixture(self, binding):
        self.events.append(('cleanup', binding))
        self.assertFalse(self.guards[-1](binding.request.canary))
        return harness.FixtureCleanupReadback(SCOPE.origin, binding, 'VERIFIED')

    def run_harness(self, scope=SCOPE, targets=TARGETS, generation=GENERATION, ports=None, deadline_ns=None):
        report = harness.rehearse_supervised_guest_canaries(
            scope, targets, generation, self.ports if ports is None else ports, deadline_ns=deadline_ns,
        )
        self.assertEqual(report['schema'], 'DOSAI_LINUX_ARM64_GUEST_CANARY_SUPERVISION_V1')
        self.assertEqual(report['status'], 'HOLD')
        self.assertEqual(report['scope'], 'SOURCE_ONLY')
        self.assertEqual(report['qualifyingBuilderReceiptsAdded'], 0)
        for key in GATES:
            self.assertIs(report[key], False)
        self.assertNotIn('fixture-private', repr(report))
        return report

    def test_full_rehearsal_binds_all_attempts_and_cleans_before_reading_denial(self):
        report = self.run_harness()
        self.assertEqual(report['reason'], 'SYNTHETIC_RESULTS_ONLY')
        self.assertEqual(report['supervisorState'], 'REHEARSED')
        self.assertEqual(report['supervisorCleanup'], 'VERIFIED')
        self.assertEqual(report['completedCanaries'], list(harness.CANARIES))
        self.assertEqual([binding.request.sequence for binding in self.executed], list(range(1, 13)))
        self.assertEqual([binding.deadline_ns for binding in self.executed], [100 + BUDGET] * 12)
        self.assertTrue(all(binding.supervisor_generation == GENERATION for binding in self.executed))
        self.assertEqual([binding.target_digest for binding in self.executed],
                         [target for target in TARGETS for _ in range(3)])
        expected_events = []
        for binding in self.executed:
            expected_events.extend((event, binding) for event in ('prepare', 'run', 'cleanup'))
            if binding.request.leg == 'RESTRICTED':
                expected_events.append(('policy', binding))
        self.assertEqual(self.events, expected_events)
        for binding, guard in zip(self.executed, self.guards):
            self.assertFalse(guard(binding.request.canary))

    def test_scope_identity_and_port_shape_validate_before_any_callback(self):
        for overrides in (
            {'scope': SCOPE._replace(origin='LIVE')},
            {'targets': TARGETS._replace(loopback_peer=TARGETS.egress_peer)},
            {'generation': 'production'},
            {'ports': self.ports._replace(cleanup_attempt=None)},
            {'deadline_ns': True},
        ):
            result = self.run_harness(**overrides)
            self.assertEqual(result['reason'], 'INVALID_SYNTHETIC_SCOPE')
            self.assertEqual(result['supervisorCleanup'], 'NOT_REQUIRED')
        for port in self.ports:
            port.assert_not_called()

    def test_stop_or_drift_before_prepare_never_executes_or_cleans_an_unowned_attempt(self):
        variants = (
            (lambda view: view._replace(state='STOPPING'), 'SUPERVISOR_STOP_REQUESTED'),
            (lambda view: view._replace(origin='LIVE'), 'SUPERVISOR_SCOPE_REJECTED'),
            (lambda view: view._replace(binding=view.binding._replace(supervisor_generation='fixture-stale')),
             'SUPERVISOR_SCOPE_REJECTED'),
            (lambda view: view._replace(binding=view.binding._replace(target_digest='9' * 64)),
             'SUPERVISOR_SCOPE_REJECTED'),
            (lambda view: view._replace(binding=view.binding._replace(
                request=view.binding.request._replace(process_start='fixture-stale'))), 'SUPERVISOR_SCOPE_REJECTED'),
        )
        for change, reason in variants:
            self.scope.side_effect = lambda binding: change(self.scope_record(binding))
            result = self.run_harness()
            self.assertEqual(result['reason'], reason)
            self.assertEqual(result['supervisorCleanup'], 'NOT_REQUIRED')
        self.prepare.assert_not_called()
        self.cleanup.assert_not_called()

    def test_stop_during_prepare_blocks_start_but_cleans_partial_ownership(self):
        def revoke(binding, guard):
            prepared = self.prepare_fixture(binding, guard)
            self.state = 'REVOKED'
            return prepared

        self.prepare.side_effect = revoke
        result = self.run_harness()
        self.assertEqual(result['reason'], 'SUPERVISOR_STOP_REQUESTED')
        self.assertEqual(result['supervisorCleanup'], 'VERIFIED')
        self.assertEqual(self.executed, [])
        self.cleanup.assert_called_once()

    def test_stop_during_probe_and_late_success_cannot_continue(self):
        def prepare(binding, guard):
            prepared = self.prepare_fixture(binding, guard)

            def run():
                result = prepared()
                self.state = 'STOPPING'
                self.assertFalse(guard(binding.request.canary))
                return result

            return run

        self.prepare.side_effect = prepare
        result = self.run_harness()
        self.assertEqual(result['reason'], 'SUPERVISOR_STOP_REQUESTED')
        self.assertEqual(result['completedCanaries'], [])
        self.assertEqual(result['supervisorCleanup'], 'VERIFIED')
        self.prepare.assert_called_once()
        self.cleanup.assert_called_once_with(self.executed[0])
        self.read_denial.assert_not_called()

    def test_prepared_attempt_cannot_report_success_without_scope_check(self):
        def prepare(binding, guard):
            self.prepare_fixture(binding, guard)
            return lambda: attempt_record(binding)

        self.prepare.side_effect = prepare
        result = self.run_harness()
        self.assertEqual(result['reason'], 'SUPERVISOR_SCOPE_UNCHECKED')
        self.assertEqual(result['completedCanaries'], [])
        self.cleanup.assert_called_once()

    def test_expired_result_and_clock_rollback_both_stop_and_clean(self):
        for tick, reason in ((100 + BUDGET, 'SUPERVISOR_DEADLINE_EXPIRED'),
                             (99, 'SUPERVISOR_SCOPE_UNAVAILABLE')):
            self.tick = 100
            self.cleanup.reset_mock()

            def prepare(binding, guard):
                prepared = self.prepare_fixture(binding, guard)

                def run():
                    result = prepared()
                    self.tick = tick
                    return result

                return run

            self.prepare.side_effect = prepare
            result = self.run_harness()
            self.assertEqual(result['reason'], reason)
            self.assertEqual(result['completedCanaries'], [])
            self.assertEqual(result['supervisorCleanup'], 'VERIFIED')
            self.cleanup.assert_called_once()

    def test_run_deadline_caps_later_attempts(self):
        def cleanup(binding):
            record = self.cleanup_fixture(binding)
            self.tick += 10
            return record

        self.cleanup.side_effect = cleanup
        self.assertEqual(self.run_harness(deadline_ns=250)['reason'], 'SYNTHETIC_RESULTS_ONLY')
        self.assertEqual([binding.deadline_ns for binding in self.executed], [250] * 12)

    def test_expired_run_deadline_blocks_every_attempt_and_scope_read(self):
        result = self.run_harness(deadline_ns=100)
        self.assertEqual(result['reason'], 'SUPERVISOR_DEADLINE_EXPIRED')
        self.assertEqual(result['supervisorCleanup'], 'NOT_REQUIRED')
        self.scope.assert_not_called()
        self.prepare.assert_not_called()
        self.cleanup.assert_not_called()

    def test_unverified_cleanup_quarantines_and_prohibits_denial_read_or_later_attempts(self):
        def cleanup(binding):
            record = self.cleanup_fixture(binding)
            if binding.request.leg == 'RESTRICTED':
                return record._replace(binding=binding._replace(deadline_ns=binding.deadline_ns + 1))
            return record

        self.cleanup.side_effect = cleanup
        result = self.run_harness()
        self.assertEqual(result['reason'], 'SUPERVISOR_CLEANUP_UNVERIFIED')
        self.assertEqual(result['supervisorState'], 'QUARANTINED')
        self.assertEqual(result['supervisorCleanup'], 'UNCERTAIN')
        self.assertEqual(self.prepare.call_count, 2)
        self.assertEqual(self.cleanup.call_count, 2)
        self.read_denial.assert_not_called()

    def test_partial_prepare_error_still_runs_cleanup_and_cleanup_error_is_sanitized(self):
        def prepare(binding, guard):
            self.prepare_fixture(binding, guard)
            raise RuntimeError('fixture-private-partial-preparation')

        def unavailable(binding):
            self.cleanup_fixture(binding)
            raise RuntimeError('fixture-private-cleanup')

        self.prepare.side_effect = prepare
        self.cleanup.side_effect = unavailable
        self.assertEqual(self.run_harness()['supervisorState'], 'QUARANTINED')
        self.assertEqual(self.executed, [])
        self.cleanup.assert_called_once()

    def test_stop_while_reading_policy_denial_discards_evidence_after_cleanup(self):
        def read_denial(binding):
            result = self.denial_record(binding)
            self.state = 'STOPPED'
            return result

        self.read_denial.side_effect = read_denial
        result = self.run_harness()
        self.assertEqual(result['reason'], 'SUPERVISOR_STOP_REQUESTED')
        self.assertEqual(result['supervisorCleanup'], 'VERIFIED')
        self.assertEqual(result['completedCanaries'], [])
        self.assertEqual(self.prepare.call_count, 2)
        self.assertEqual([event for event, _ in self.events][-2:], ['cleanup', 'policy'])

    def test_real_source_binding_uses_supervisor_deadline_with_mocked_native_operations(self):
        pins = driver.FixtureProbePins(
            'SYNTHETIC_ONLY', driver.FileIdentity(7, 90, 1001),
            b'f' * 32, b'e' * 32, b'l' * 32, 'a' * 64,
        )
        observed_exec = Mock(return_value=driver.OwnedExecObservation(pins.executable_digest, 'STARTED', True))

        def prepare(binding, guard):
            if binding.request.canary != 'SUBPROCESS_EXEC':
                return self.prepare_fixture(binding, guard)
            self.guards.append(guard)
            if binding.request.leg == 'RESTRICTED':
                observed_exec.return_value = observed_exec.return_value._replace(result='PERMISSION_ERROR')
            else:
                observed_exec.return_value = observed_exec.return_value._replace(result='STARTED')
            self.tick += 20
            native_attempt = driver.prepare_linux_arm64_canary_attempt(
                pins, binding.request.canary, guard, observed_exec, deadline_ns=binding.deadline_ns,
            )
            return lambda: attempt_record(binding, native_attempt())

        self.prepare.side_effect = prepare
        platform = SimpleNamespace(sysname='Linux', machine='aarch64')
        with (patch.object(os, 'uname', return_value=platform),
              patch.object(os, 'open', side_effect=AssertionError('Unexpected file open')) as open_file,
              patch.object(socket, 'socket', side_effect=AssertionError('Unexpected socket')) as open_socket,
              patch.object(driver, 'monotonic_ns', side_effect=lambda: self.tick)):
            result = self.run_harness()
        self.assertEqual(result['supervisorState'], 'REHEARSED')
        self.assertEqual(result['completedCanaries'], list(harness.CANARIES))
        self.assertEqual(observed_exec.call_args_list, [
            call(pins.executable_digest, 100 + BUDGET),
            call(pins.executable_digest, 120 + BUDGET),
            call(pins.executable_digest, 140 + BUDGET),
        ])
        open_file.assert_not_called()
        open_socket.assert_not_called()

    def test_native_socket_merges_earlier_deadline_into_timeout(self):
        pins = driver.FixtureProbePins(
            'SYNTHETIC_ONLY', driver.FileIdentity(7, 90, 1001),
            b'f' * 32, b'e' * 32, b'l' * 32, 'b' * 64,
        )
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.getpeername.return_value = ('192.0.2.31', 38473)
        connection.recv.side_effect = [pins.egress_marker, b'']
        platform = SimpleNamespace(sysname='Linux', machine='aarch64')
        with (patch.object(os, 'uname', return_value=platform),
              patch.object(socket, 'socket', return_value=connection),
              patch.object(driver, 'monotonic_ns', return_value=100)):
            attempt = driver.prepare_linux_arm64_canary_attempt(
                pins, 'EGRESS_CONNECT', lambda _: True, Mock(), deadline_ns=1_000_100,
            )
            self.assertEqual(attempt(), 'EXPECTED_EGRESS_PEER_CONNECTED')
        self.assertEqual(connection.settimeout.call_args_list, [call(0.001)] * 3)


if __name__ == '__main__':
    unittest.main()
