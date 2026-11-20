"""Offline coverage for projection of operation and policy evidence."""

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock


SOURCE = (Path(__file__).resolve().parents[3]
          / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-harness.py')
spec = importlib.util.spec_from_file_location('guest_canary_harness', SOURCE)
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)

SCOPE = harness.CanaryScope(
    'SYNTHETIC_ONLY', '4913c5aa6004c11e3593ce8287344d1f2f4a5a94',
    'fixture-private-run', 'fixture-guest', 'a' * 64,
    'fixture-control-start', 'fixture-restricted-start',
)
TARGETS = harness.CanaryTargetDigests('1' * 64, '2' * 64, '3' * 64, '4' * 64)
CASES = {
    'HOST_FILE_READ': (TARGETS.host_file, 'EXPECTED_MARKER_READ'),
    'EGRESS_CONNECT': (TARGETS.egress_peer, 'EXPECTED_EGRESS_PEER_CONNECTED'),
    'LOOPBACK_CONNECT': (TARGETS.loopback_peer, 'EXPECTED_LOOPBACK_PEER_CONNECTED'),
    'SUBPROCESS_EXEC': (TARGETS.subprocess_probe, 'EXPECTED_PROBE_EXEC_OBSERVED'),
}
GATES = (
    'physicalIsolationVerified', 'hostQualified', 'provisioningAuthorized', 'hostMutationAuthorized',
    'guestExecutionAuthorized', 'signInAuthorized', 'modelRequestsAuthorized', 'bridgeActivationAuthorized',
    'liveLaunchPermitted',
)


def attempt_record(request):
    target, success = CASES[request.canary]
    result = 'PERMISSION_ERROR' if request.leg == 'RESTRICTED' else success
    return harness.FixtureAttempt('SYNTHETIC_ONLY', request, target,
                                  request.process_start, request.process_start, result)


def denial_record(request):
    return harness.FixturePolicyDenial('SYNTHETIC_ONLY', request, CASES[request.canary][0],
                                      SCOPE.configuration_digest, 'BLOCKED')


def rehearsal_requests(scope=SCOPE):
    requests = []

    def observe(request):
        requests.append(request)
        outcome = 'DENIED_BY_FIXTURE_POLICY' if request.leg == 'RESTRICTED' else 'REACHED'
        return harness.CanaryObservation('SYNTHETIC_ONLY', request, outcome)

    harness.rehearse_guest_canaries(scope, observe)
    return requests


class CanaryObserverTests(unittest.TestCase):
    def setUp(self):
        self.read_attempt = Mock(side_effect=attempt_record)
        self.read_denial = Mock(side_effect=denial_record)

    def make_observer(self, scope=SCOPE, targets=TARGETS):
        return harness.make_fixture_canary_observer(scope, targets, self.read_attempt, self.read_denial)

    def rehearse(self, observer=None):
        if observer is None:
            observer = self.make_observer()
        receipt = harness.rehearse_guest_canaries(SCOPE, observer)
        self.assertEqual(receipt['status'], 'HOLD')
        self.assertEqual(receipt['scope'], 'SOURCE_ONLY')
        self.assertEqual(receipt['qualifyingBuilderReceiptsAdded'], 0)
        for gate in GATES:
            self.assertIs(receipt[gate], False, gate)
        for raw_value in ('fixture-private', *TARGETS, SCOPE.configuration_digest):
            self.assertNotIn(raw_value, repr(receipt))
        return receipt

    def test_complete_rehearsal_projects_all_canaries_and_reads_denials_only_for_restricted_permission_errors(self):
        observer = self.make_observer()
        receipt = self.rehearse(observer)
        self.assertEqual(receipt['reason'], 'SYNTHETIC_RESULTS_ONLY')
        self.assertEqual(receipt['completedCanaries'], list(CASES))

        requests = rehearsal_requests()
        self.assertEqual([call.args[0] for call in self.read_attempt.call_args_list], requests)
        self.assertEqual([call.args[0] for call in self.read_denial.call_args_list],
                         [request for request in requests if request.leg == 'RESTRICTED'])
        self.assertIsNone(observer(requests[0]))
        self.assertEqual(self.read_attempt.call_count, 12)

    def test_bad_scope_and_unpinned_or_aliased_targets_never_read_evidence(self):
        for scope, targets in (
            (SCOPE._replace(origin='LIVE'), TARGETS),
            (SCOPE, tuple(TARGETS)),
            (SCOPE, TARGETS._replace(egress_peer='127.0.0.1')),
            (SCOPE, TARGETS._replace(loopback_peer=TARGETS.egress_peer)),
        ):
            with self.assertRaisesRegex(ValueError, '^Invalid synthetic canary observer scope\\.$'):
                self.make_observer(scope, targets)
        with self.assertRaises(ValueError):
            harness.make_fixture_canary_observer(SCOPE, TARGETS, self.read_attempt, None)
        self.read_attempt.assert_not_called()
        self.read_denial.assert_not_called()

    def test_swapped_target_at_post_control_discards_that_canary_and_closes_the_observer(self):
        def respond(request):
            attempt = attempt_record(request)
            if request.leg == 'CONTROL_AFTER':
                return attempt._replace(target_digest='9' * 64)
            return attempt

        self.read_attempt.side_effect = respond
        observer = self.make_observer()
        report = self.rehearse(observer)
        self.assertEqual(report['reason'], 'FIXTURE_OBSERVATION_REJECTED')
        self.assertEqual(report['blockedLeg'], 'CONTROL_AFTER')
        self.assertEqual(report['completedCanaries'], [])
        self.assertEqual(self.read_attempt.call_count, 3)
        self.assertIsNone(observer(rehearsal_requests()[3]))
        self.assertEqual(self.read_attempt.call_count, 3)

    def test_changed_process_identity_or_untagged_success_is_rejected(self):
        for fields in (
            {'process_before': 'fixture-other-process'},
            {'process_after': 'fixture-other-process'},
            {'origin': 'LIVE'},
            {'result': 'REACHED'},
            {'result': 'EXPECTED_EGRESS_PEER_CONNECTED'},
        ):
            with self.subTest(fields=fields):
                self.read_attempt.reset_mock()
                self.read_attempt.side_effect = lambda request: attempt_record(request)._replace(**fields)
                receipt = self.rehearse()
                self.assertEqual(receipt['reason'], 'FIXTURE_OBSERVATION_REJECTED')
                self.assertEqual(receipt['blockedLeg'], 'CONTROL_BEFORE')
                self.read_attempt.assert_called_once()
        self.read_denial.assert_not_called()

    def test_permission_error_requires_matching_separate_denial_record(self):
        for deny in (
            lambda request: None,
            lambda request: denial_record(request)._replace(decision='PERMISSION_ERROR'),
            lambda request: denial_record(request)._replace(origin='GUEST'),
            lambda request: denial_record(request)._replace(configuration_digest='b' * 64),
            lambda request: denial_record(request)._replace(target_digest=TARGETS.egress_peer),
            lambda request: denial_record(request)._replace(request=request._replace(sequence=1)),
            lambda request: denial_record(request)._replace(request=request._replace(challenge='f' * 64)),
            lambda request: denial_record(request)._replace(
                request=request._replace(process_start='fixture-stale-task')),
        ):
            self.read_attempt.reset_mock()
            self.read_denial.reset_mock()
            self.read_denial.side_effect = deny
            receipt = self.rehearse()
            self.assertEqual(receipt['reason'], 'RESTRICTED_DENIAL_INCONCLUSIVE')
            self.assertEqual(receipt['blockedLeg'], 'RESTRICTED')
            self.assertEqual(receipt['completedCanaries'], [])
            self.assertEqual(self.read_attempt.call_count, 2)
            self.read_denial.assert_called_once()

    def test_nonpermission_failure_cannot_consume_a_policy_record(self):
        for outcome in ('NOT_FOUND', 'REFUSED', 'TIMED_OUT', 'UNAVAILABLE'):
            with self.subTest(outcome=outcome):
                self.read_attempt.reset_mock()

                def respond(request):
                    attempt = attempt_record(request)
                    return attempt._replace(result=outcome) if request.leg == 'RESTRICTED' else attempt

                self.read_attempt.side_effect = respond
                receipt = self.rehearse()
                self.assertEqual(receipt['reason'], 'RESTRICTED_DENIAL_INCONCLUSIVE')
                self.assertEqual(self.read_attempt.call_count, 2)
        self.read_denial.assert_not_called()

    def test_expected_success_in_restricted_context_reports_reachability(self):
        self.read_attempt.side_effect = lambda request: attempt_record(request)._replace(
            result=CASES[request.canary][1])
        receipt = self.rehearse()
        self.assertEqual(receipt['reason'], 'RESTRICTED_CANARY_REACHED')
        self.assertEqual(self.read_attempt.call_count, 2)
        self.read_denial.assert_not_called()

    def test_permission_error_in_control_cannot_use_denial_evidence(self):
        self.read_attempt.side_effect = lambda request: attempt_record(request)._replace(result='PERMISSION_ERROR')
        receipt = self.rehearse()
        self.assertEqual(receipt['reason'], 'POSITIVE_CONTROL_FAILED')
        self.read_attempt.assert_called_once()
        self.read_denial.assert_not_called()

    def test_cross_run_and_out_of_order_requests_are_rejected_before_any_evidence_read(self):
        requests = rehearsal_requests()
        variants = [requests[1], requests[0]._replace(sequence=True),
                    rehearsal_requests(SCOPE._replace(run='fixture-other-run'))[0]]
        for request in variants:
            observer = self.make_observer()
            self.assertIsNone(observer(request))
            self.assertIsNone(observer(requests[0]))
        self.read_attempt.assert_not_called()
        self.read_denial.assert_not_called()

    def test_replayed_control_request_closes_the_observer(self):
        first, second, *_ = rehearsal_requests()
        observer = self.make_observer()
        self.assertEqual(observer(first).outcome, 'REACHED')
        self.assertIsNone(observer(first))
        self.assertIsNone(observer(second))
        self.read_attempt.assert_called_once_with(first)
        self.read_denial.assert_not_called()

    def test_evidence_reader_error_is_sanitized_and_cannot_be_retried(self):
        self.read_denial.side_effect = RuntimeError('fixture-private-diagnostic')
        observer = self.make_observer()
        receipt = self.rehearse(observer)
        self.assertEqual(receipt['reason'], 'RESTRICTED_DENIAL_INCONCLUSIVE')
        self.assertIsNone(observer(rehearsal_requests()[1]))
        self.assertEqual(self.read_attempt.call_count, 2)
        self.read_denial.assert_called_once()


if __name__ == '__main__':
    unittest.main()
