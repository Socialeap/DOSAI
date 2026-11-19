"""Offline guest isolation canary rehearsal with an injected fixture observer."""

from hashlib import sha256
import json
import re
from typing import NamedTuple


SOURCE_REVISION = '4913c5aa6004c11e3593ce8287344d1f2f4a5a94'
SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_V1'
ORIGIN = 'SYNTHETIC_ONLY'
CANARIES = ('HOST_FILE_READ', 'EGRESS_CONNECT', 'LOOPBACK_CONNECT', 'SUBPROCESS_EXEC')
LEGS = ('CONTROL_BEFORE', 'RESTRICTED', 'CONTROL_AFTER')
OUTCOMES = ('REACHED', 'DENIED_BY_FIXTURE_POLICY', 'NOT_FOUND', 'REFUSED', 'TIMED_OUT', 'UNAVAILABLE')


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


def _valid_scope(scope):
    if type(scope) is not CanaryScope or not all(type(field) is str for field in scope):
        return False
    synthetic_ids = (scope.run, scope.guest_generation, scope.control_process_start, scope.restricted_process_start)
    return (scope.origin == ORIGIN and scope.source_revision == SOURCE_REVISION
            and all(re.fullmatch(r'fixture-[a-z0-9-]{1,48}', field) for field in synthetic_ids)
            and re.fullmatch(r'[0-9a-f]{64}', scope.configuration_digest) is not None
            and scope.control_process_start != scope.restricted_process_start)


def _matches_observation(observation, request):
    return (type(observation) is CanaryObservation and type(observation.origin) is str
            and observation.origin == ORIGIN
            and type(observation.request) is CanaryRequest
            and all(type(actual) is type(expected) and actual == expected
                    for actual, expected in zip(observation.request, request))
            and type(observation.outcome) is str and observation.outcome in OUTCOMES)


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
    sequence = 0
    for canary in CANARIES:
        # All three legs address one fictional target. The digest correlates
        # fixture rows and carries no freshness, attestation or grant.
        payload = json.dumps((SCHEMA, *scope, canary), separators=(',', ':')).encode('ascii')
        challenge = sha256(payload).hexdigest()
        for leg in LEGS:
            sequence += 1
            restricted = leg == 'RESTRICTED'
            process = scope.restricted_process_start if restricted else scope.control_process_start
            request = CanaryRequest(canary, leg, sequence, challenge, process)
            try:
                observation = observe_fixture(request)
            except Exception:
                return _report('FIXTURE_OBSERVATION_UNAVAILABLE', completed, canary, leg)
            if not _matches_observation(observation, request):
                return _report('FIXTURE_OBSERVATION_REJECTED', completed, canary, leg)
            if restricted:
                if observation.outcome == 'REACHED':
                    return _report('RESTRICTED_CANARY_REACHED', completed, canary, leg)
                if observation.outcome != 'DENIED_BY_FIXTURE_POLICY':
                    return _report('RESTRICTED_DENIAL_INCONCLUSIVE', completed, canary, leg)
            elif observation.outcome != 'REACHED':
                return _report('POSITIVE_CONTROL_FAILED', completed, canary, leg)
        completed.append(canary)

    return _report('SYNTHETIC_RESULTS_ONLY', completed)
