"""Offline guest isolation canary rehearsal and observation projection."""

from hashlib import sha256
import json
import re
from typing import NamedTuple


SOURCE_REVISION = '4913c5aa6004c11e3593ce8287344d1f2f4a5a94'
SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_V1'
ORIGIN = 'SYNTHETIC_ONLY'
CANARIES = ('HOST_FILE_READ', 'EGRESS_CONNECT', 'LOOPBACK_CONNECT', 'SUBPROCESS_EXEC')
LEGS = ('CONTROL_BEFORE', 'RESTRICTED', 'CONTROL_AFTER')
INCONCLUSIVE = ('NOT_FOUND', 'REFUSED', 'TIMED_OUT', 'UNAVAILABLE')
OUTCOMES = ('REACHED', 'DENIED_BY_FIXTURE_POLICY', *INCONCLUSIVE)
SUCCESS_RESULTS = {
    'HOST_FILE_READ': 'EXPECTED_MARKER_READ',
    'EGRESS_CONNECT': 'EXPECTED_EGRESS_PEER_CONNECTED',
    'LOOPBACK_CONNECT': 'EXPECTED_LOOPBACK_PEER_CONNECTED',
    'SUBPROCESS_EXEC': 'EXPECTED_PROBE_EXEC_OBSERVED',
}


class CanaryScope(NamedTuple):
    origin: str
    source_revision: str
    run: str
    guest_generation: str
    configuration_digest: str
    control_process_start: str
    restricted_process_start: str


class CanaryRequest(NamedTuple):
    canary: str
    leg: str
    sequence: int
    challenge: str
    process_start: str


class CanaryObservation(NamedTuple):
    origin: str
    request: CanaryRequest
    outcome: str


class CanaryTargetDigests(NamedTuple):
    host_file: str
    egress_peer: str
    loopback_peer: str
    subprocess_probe: str


class FixtureAttempt(NamedTuple):
    origin: str
    request: CanaryRequest
    target_digest: str
    process_before: str
    process_after: str
    result: str


class FixturePolicyDenial(NamedTuple):
    origin: str
    request: CanaryRequest
    target_digest: str
    configuration_digest: str
    decision: str


def _valid_scope(scope):
    if type(scope) is not CanaryScope or not all(type(field) is str for field in scope):
        return False
    synthetic_ids = (scope.run, scope.guest_generation, scope.control_process_start, scope.restricted_process_start)
    return (scope.origin == ORIGIN and scope.source_revision == SOURCE_REVISION
            and all(re.fullmatch(r'fixture-[a-z0-9-]{1,48}', field) for field in synthetic_ids)
            and _is_digest(scope.configuration_digest)
            and scope.control_process_start != scope.restricted_process_start)


def _is_digest(value):
    return type(value) is str and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def _same_request(actual, expected):
    return (type(actual) is CanaryRequest
            and all(type(value) is type(pinned) and value == pinned
                    for value, pinned in zip(actual, expected)))


def _matches_observation(observation, request):
    return (type(observation) is CanaryObservation and type(observation.origin) is str
            and observation.origin == ORIGIN
            and _same_request(observation.request, request)
            and type(observation.outcome) is str and observation.outcome in OUTCOMES)


def _requests_for_canary(scope, index, canary):
    # The digest correlates fixture rows and carries no freshness, attestation or grant.
    payload = json.dumps((SCHEMA, *scope, canary), separators=(',', ':')).encode('ascii')
    challenge = sha256(payload).hexdigest()
    for offset, leg in enumerate(LEGS, 1):
        process = scope.restricted_process_start if leg == 'RESTRICTED' else scope.control_process_start
        yield CanaryRequest(canary, leg, index * len(LEGS) + offset, challenge, process)


def _matches_target(record, request, target_digest):
    return (type(record.origin) is str and record.origin == ORIGIN
            and _same_request(record.request, request)
            and type(record.target_digest) is str and record.target_digest == target_digest)


def _project_attempt(attempt, request, target, configuration_digest, read_policy_denial):
    if (type(attempt) is not FixtureAttempt or not _matches_target(attempt, request, target)
            or any(type(value) is not str or value != request.process_start
                   for value in (attempt.process_before, attempt.process_after))
            or type(attempt.result) is not str):
        return None
    if attempt.result == SUCCESS_RESULTS[request.canary]:
        return 'REACHED'
    if attempt.result in INCONCLUSIVE:
        return attempt.result
    if attempt.result != 'PERMISSION_ERROR':
        return None
    if request.leg == 'RESTRICTED':
        denial = read_policy_denial(request)
        if (type(denial) is FixturePolicyDenial and _matches_target(denial, request, target)
                and type(denial.configuration_digest) is str and denial.configuration_digest == configuration_digest
                and type(denial.decision) is str and denial.decision == 'BLOCKED'):
            return 'DENIED_BY_FIXTURE_POLICY'
    return 'UNAVAILABLE'


def make_fixture_canary_observer(scope, targets, read_attempt, read_policy_denial):
    """Create a one-pass observer of typed synthetic probe and policy records."""
    if (not _valid_scope(scope) or type(targets) is not CanaryTargetDigests
            or not all(_is_digest(value) for value in targets) or len(set(targets)) != len(CANARIES)
            or not callable(read_attempt) or not callable(read_policy_denial)):
        raise ValueError('Invalid synthetic canary observer scope.')

    pinned_targets = dict(zip(CANARIES, targets))
    requests = tuple(request for index, canary in enumerate(CANARIES)
                     for request in _requests_for_canary(scope, index, canary))
    position = 0

    def observe(request):
        nonlocal position
        if position == len(requests):
            return None
        expected = requests[position]
        next_position = position + 1
        # Close before reading anything. Re-entry, errors, or failed probes cannot continue.
        position = len(requests)
        if not _same_request(request, expected):
            return None
        try:
            attempt = read_attempt(expected)
            outcome = _project_attempt(attempt, expected, pinned_targets[expected.canary],
                                       scope.configuration_digest, read_policy_denial)
        except Exception:
            outcome = 'UNAVAILABLE'
        if outcome is None:
            return None
        required = 'DENIED_BY_FIXTURE_POLICY' if expected.leg == 'RESTRICTED' else 'REACHED'
        if outcome == required:
            position = next_position
        return CanaryObservation(ORIGIN, expected, outcome)

    return observe


def _report(reason, completed=(), blocked_canary=None, blocked_leg=None):
    return {
        'schema': SCHEMA,
        'status': 'HOLD',
        'scope': 'SOURCE_ONLY',
        'reason': reason,
        'completedCanaries': list(completed),
        'blockedCanary': blocked_canary,
        'blockedLeg': blocked_leg,
        'physicalIsolationVerified': False,
        'hostQualified': False,
        'provisioningAuthorized': False,
        'hostMutationAuthorized': False,
        'guestExecutionAuthorized': False,
        'signInAuthorized': False,
        'modelRequestsAuthorized': False,
        'bridgeActivationAuthorized': False,
        'liveLaunchPermitted': False,
        'qualifyingBuilderReceiptsAdded': 0,
    }


def rehearse_guest_canaries(scope, observe_fixture):
    """Ask an offline fixture observer for at most three rows per fixed canary."""
    if not _valid_scope(scope) or not callable(observe_fixture):
        return _report('INVALID_SYNTHETIC_SCOPE')

    completed = []
    for index, canary in enumerate(CANARIES):
        for request in _requests_for_canary(scope, index, canary):
            leg = request.leg
            try:
                observation = observe_fixture(request)
            except Exception:
                return _report('FIXTURE_OBSERVATION_UNAVAILABLE', completed, canary, leg)
            if not _matches_observation(observation, request):
                return _report('FIXTURE_OBSERVATION_REJECTED', completed, canary, leg)
            if leg == 'RESTRICTED':
                if observation.outcome == 'REACHED':
                    return _report('RESTRICTED_CANARY_REACHED', completed, canary, leg)
                if observation.outcome != 'DENIED_BY_FIXTURE_POLICY':
                    return _report('RESTRICTED_DENIAL_INCONCLUSIVE', completed, canary, leg)
            elif observation.outcome != 'REACHED':
                return _report('POSITIVE_CONTROL_FAILED', completed, canary, leg)
        completed.append(canary)

    return _report('SYNTHETIC_RESULTS_ONLY', completed)
