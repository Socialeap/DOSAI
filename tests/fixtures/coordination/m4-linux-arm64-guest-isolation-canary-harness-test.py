"""Offline canary fixtures. The injected observer handles closed synthetic requests."""

from hashlib import sha256
import importlib.util
import json
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
    'fixture-private-run', 'fixture-private-guest', 'a' * 64,
    'fixture-private-control-start', 'fixture-private-restricted-start',
)
CASES = ('HOST_FILE_READ', 'EGRESS_CONNECT', 'LOOPBACK_CONNECT', 'SUBPROCESS_EXEC')
LEGS = ('CONTROL_BEFORE', 'RESTRICTED', 'CONTROL_AFTER')
GATES = (
    'physicalIsolationVerified', 'hostQualified', 'provisioningAuthorized', 'hostMutationAuthorized',
    'guestExecutionAuthorized', 'signInAuthorized', 'modelRequestsAuthorized', 'bridgeActivationAuthorized',
    'liveLaunchPermitted',
)


def observe(request):
    outcome = 'DENIED_BY_FIXTURE_POLICY' if request.leg == 'RESTRICTED' else 'REACHED'
    return harness.CanaryObservation('SYNTHETIC_ONLY', request, outcome)


class GuestCanaryHarnessTests(unittest.TestCase):
    def run_harness(self, observer=observe, scope=SCOPE):
        report = harness.rehearse_guest_canaries(scope, observer)
        self.assertEqual(report['status'], 'HOLD')
        self.assertEqual(report['scope'], 'SOURCE_ONLY')
        self.assertEqual(report['qualifyingBuilderReceiptsAdded'], 0)
        for key in GATES:
            self.assertIs(report[key], False, key)
        self.assertNotIn('fixture-private', repr(report))
        self.assertNotIn(SCOPE.configuration_digest, repr(report))
        return report

    def test_four_canaries_run_in_order_with_bracketing_controls_and_bound_challenges(self):
        fixture = Mock(side_effect=observe)
        report = self.run_harness(fixture)
        self.assertEqual(report['reason'], 'SYNTHETIC_RESULTS_ONLY')
        self.assertEqual(report['completedCanaries'], list(CASES))
        self.assertIsNone(report['blockedCanary'])
        self.assertIsNone(report['blockedLeg'])

        expected = []
        for canary in CASES:
            binding = ('DOSAI_LINUX_ARM64_GUEST_CANARY_V1', *SCOPE, canary)
            challenge = sha256(json.dumps(binding, separators=(',', ':')).encode('ascii')).hexdigest()
            for leg in LEGS:
                actor = SCOPE.restricted_process_start if leg == 'RESTRICTED' else SCOPE.control_process_start
                expected.append(harness.CanaryRequest(canary, leg, len(expected) + 1, challenge, actor))
        self.assertEqual([item.args[0] for item in fixture.call_args_list], expected)

    def test_invalid_or_aliased_scopes_do_not_invoke_observer(self):
        observer = Mock(side_effect=observe)
        for scope in (
            None, tuple(SCOPE), SCOPE._replace(origin='LIVE'),
            SCOPE._replace(source_revision='0' * 40),
            SCOPE._replace(run='fixture-no\n'),
            SCOPE._replace(guest_generation='/private/fixture'),
            SCOPE._replace(configuration_digest='g' * 64),
            SCOPE._replace(restricted_process_start=SCOPE.control_process_start),
        ):
            with self.subTest(scope=scope):
                report = self.run_harness(observer, scope)
                self.assertEqual(report['reason'], 'INVALID_SYNTHETIC_SCOPE')
                self.assertEqual(report['completedCanaries'], [])
        observer.assert_not_called()
        self.assertEqual(self.run_harness(None)['reason'], 'INVALID_SYNTHETIC_SCOPE')

    def test_failed_controls_stop_before_more_probes_and_discard_incomplete_canary(self):
        for leg, calls in [('CONTROL_BEFORE', 4), ('CONTROL_AFTER', 6)]:
            with self.subTest(leg=leg):
                def respond(request):
                    observation = observe(request)
                    if request.canary == 'EGRESS_CONNECT' and request.leg == leg:
                        return observation._replace(outcome='REFUSED')
                    return observation

                fixture = Mock(side_effect=respond)
                report = self.run_harness(fixture)
                self.assertEqual(report['reason'], 'POSITIVE_CONTROL_FAILED')
                self.assertEqual(report['blockedCanary'], 'EGRESS_CONNECT')
                self.assertEqual(report['blockedLeg'], leg)
                self.assertEqual(report['completedCanaries'], ['HOST_FILE_READ'])
                self.assertEqual(fixture.call_count, calls)

    def test_each_restricted_canary_fails_if_it_reaches_the_target(self):
        for index, canary in enumerate(CASES):
            with self.subTest(canary=canary):
                def respond(request):
                    observation = observe(request)
                    if request.canary == canary and request.leg == 'RESTRICTED':
                        return observation._replace(outcome='REACHED')
                    return observation

                fixture = Mock(side_effect=respond)
                report = self.run_harness(fixture)
                self.assertEqual(report['reason'], 'RESTRICTED_CANARY_REACHED')
                self.assertEqual(report['blockedCanary'], canary)
                self.assertEqual(report['blockedLeg'], 'RESTRICTED')
                self.assertEqual(report['completedCanaries'], list(CASES[:index]))
                self.assertEqual(fixture.call_count, 3 * index + 2)

    def test_unavailable_or_unreachable_is_not_policy_denial(self):
        for outcome in ('UNAVAILABLE', 'NOT_FOUND', 'REFUSED', 'TIMED_OUT'):
            with self.subTest(outcome=outcome):
                def respond(request):
                    result = observe(request)
                    return result._replace(outcome=outcome) if request.leg == 'RESTRICTED' else result

                fixture = Mock(side_effect=respond)
                self.assertEqual(self.run_harness(fixture)['reason'], 'RESTRICTED_DENIAL_INCONCLUSIVE')
                self.assertEqual(fixture.call_count, 2)

    def test_rejects_challenges_from_other_runs_guests_configurations_and_processes(self):
        for field, value in [
            ('run', 'fixture-other-run'),
            ('guest_generation', 'fixture-other-guest'),
            ('configuration_digest', 'b' * 64),
            ('restricted_process_start', 'fixture-other-process-start'),
        ]:
            with self.subTest(field=field):
                good = Mock(side_effect=observe)
                self.run_harness(good)
                stale = observe(good.call_args_list[0].args[0])
                fixture = Mock(return_value=stale)
                report = self.run_harness(fixture, SCOPE._replace(**{field: value}))
                self.assertEqual(report['reason'], 'FIXTURE_OBSERVATION_REJECTED')
                fixture.assert_called_once()

    def test_control_replay_on_restricted_leg_and_reused_first_control_are_rejected(self):
        for replay_at in ('RESTRICTED', 'CONTROL_AFTER'):
            with self.subTest(leg=replay_at):
                captured = []

                def respond(request):
                    if request.leg == replay_at:
                        return captured[0]
                    result = observe(request)
                    captured.append(result)
                    return result

                report = self.run_harness(respond)
                self.assertEqual(report['reason'], 'FIXTURE_OBSERVATION_REJECTED')
                self.assertEqual(report['blockedLeg'], replay_at)

    def test_untyped_observations_and_injected_fields_are_rejected(self):
        for change in (
            lambda result: None,
            lambda result: {'outcome': 'REACHED', 'liveLaunchPermitted': True},
            lambda result: result._replace(origin='GUEST'),
            lambda result: result._replace(outcome='APPROVED'),
            lambda result: result._replace(request=result.request._replace(sequence=True)),
            lambda result: result._replace(request=result.request._replace(canary='EGRESS_CONNECT')),
            lambda result: result._replace(request=result.request._replace(process_start=SCOPE.restricted_process_start)),
        ):
            fixture = Mock(side_effect=lambda request: change(observe(request)))
            self.assertEqual(self.run_harness(fixture)['reason'], 'FIXTURE_OBSERVATION_REJECTED')
            fixture.assert_called_once()

    def test_observer_error_stops_and_never_exposes_diagnostic(self):
        fixture = Mock(side_effect=RuntimeError('fixture-private-diagnostic'))
        report = self.run_harness(fixture)
        self.assertEqual(report['reason'], 'FIXTURE_OBSERVATION_UNAVAILABLE')
        self.assertEqual(report['blockedCanary'], 'HOST_FILE_READ')
        self.assertEqual(report['blockedLeg'], 'CONTROL_BEFORE')
        fixture.assert_called_once()


if __name__ == '__main__':
    unittest.main()
