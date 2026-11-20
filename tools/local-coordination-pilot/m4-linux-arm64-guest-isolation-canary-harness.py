"""Offline guest isolation canary rehearsal and observation projection."""

from hashlib import sha256
import json
import re
from typing import NamedTuple


SOURCE_REVISION = '4913c5aa6004c11e3593ce8287344d1f2f4a5a94'
SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_V1'
SUPERVISOR_SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_SUPERVISION_V1'
ATTEMPT_BUDGET_NS = 250_000_000
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


class FixtureAttemptBinding(NamedTuple):
    request: CanaryRequest
    supervisor_generation: str
    target_digest: str
    deadline_ns: int


class FixtureScopeReadback(NamedTuple):
    origin: str
    binding: FixtureAttemptBinding
    state: str


class FixtureCleanupReadback(NamedTuple):
    origin: str
    binding: FixtureAttemptBinding
    state: str


class FixtureSupervisorPorts(NamedTuple):
    monotonic_ns: object
    read_scope: object
    prepare_attempt: object
    cleanup_attempt: object
    read_policy_denial: object


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


def _matches_binding(actual, expected):
    return (type(actual) is FixtureAttemptBinding and _same_request(actual.request, expected.request)
            and type(actual.supervisor_generation) is str
            and actual.supervisor_generation == expected.supervisor_generation
            and type(actual.target_digest) is str and actual.target_digest == expected.target_digest
            and type(actual.deadline_ns) is int and actual.deadline_ns == expected.deadline_ns)


def _matches_readback(record, record_type, binding):
    return (type(record) is record_type and type(record.origin) is str and record.origin == ORIGIN
            and _matches_binding(record.binding, binding) and type(record.state) is str)


def _supervised_report(report, cleanup, failure):
    reason = report['reason'] if failure is None else failure
    if cleanup == 'UNCERTAIN':
        state = 'QUARANTINED'
    elif reason == 'SYNTHETIC_RESULTS_ONLY':
        state = 'REHEARSED'
    else:
        state = 'HELD'
    return {**report, 'schema': SUPERVISOR_SCHEMA, 'reason': reason,
            'supervisorState': state, 'supervisorCleanup': cleanup}


def rehearse_supervised_guest_canaries(scope, targets, generation, ports, *, deadline_ns=None):
    """Wire the canary rehearsal to synchronous fixture supervision ports."""
    if (type(generation) is not str or not re.fullmatch(r'fixture-[a-z0-9-]{1,48}', generation)
            or type(ports) is not FixtureSupervisorPorts or not all(callable(port) for port in ports)
            or (deadline_ns is not None and (type(deadline_ns) is not int or not 0 <= deadline_ns < 2**64))):
        return _supervised_report(_report('INVALID_SYNTHETIC_SCOPE'), 'NOT_REQUIRED', None)

    failure = None
    cleanup = 'NOT_REQUIRED'
    last_tick = None
    run_deadline = None
    observed_binding = None

    def now():
        nonlocal last_tick
        tick = ports.monotonic_ns()
        if type(tick) is not int or not 0 <= tick < 2**64 or (last_tick is not None and tick < last_tick):
            raise ValueError('Invalid fixture supervisor clock.')
        last_tick = tick
        return tick

    def check_scope(binding):
        nonlocal failure
        if failure is not None:
            return False
        try:
            if now() >= binding.deadline_ns:
                failure = 'SUPERVISOR_DEADLINE_EXPIRED'
            else:
                view = ports.read_scope(binding)
                if not _matches_readback(view, FixtureScopeReadback, binding):
                    failure = 'SUPERVISOR_SCOPE_REJECTED'
                elif view.state in ('STOPPING', 'STOPPED', 'REVOKED'):
                    failure = 'SUPERVISOR_STOP_REQUESTED'
                elif view.state != 'ACTIVE':
                    failure = 'SUPERVISOR_SCOPE_REJECTED'
                elif now() >= binding.deadline_ns:
                    failure = 'SUPERVISOR_DEADLINE_EXPIRED'
        except Exception:
            failure = 'SUPERVISOR_SCOPE_UNAVAILABLE'
        return failure is None

    def read_attempt(request):
        nonlocal failure, cleanup, run_deadline, observed_binding
        observed_binding = None
        try:
            started = now()
        except Exception:
            failure = 'SUPERVISOR_SCOPE_UNAVAILABLE'
            return None
        if run_deadline is None:
            run_deadline = min(started + len(CANARIES) * len(LEGS) * ATTEMPT_BUDGET_NS, 2**64 - 1)
            if deadline_ns is not None:
                run_deadline = min(run_deadline, deadline_ns)
        target = targets[CANARIES.index(request.canary)]
        binding = FixtureAttemptBinding(request, generation, target,
                                        min(started + ATTEMPT_BUDGET_NS, run_deadline))
        if not check_scope(binding):
            return None

        running = False
        scope_checked = False

        def scope_active(canary):
            nonlocal failure, scope_checked
            if not running:
                return False
            if type(canary) is not str or canary != request.canary:
                if failure is None:
                    failure = 'SUPERVISOR_SCOPE_REJECTED'
                return False
            if not check_scope(binding):
                return False
            scope_checked = True
            return True

        result = None
        try:
            prepared = ports.prepare_attempt(binding, scope_active)
            if not callable(prepared):
                failure = 'SUPERVISOR_ATTEMPT_UNAVAILABLE'
            elif check_scope(binding):
                running = True
                result = prepared()
                if failure is None and not scope_checked:
                    failure = 'SUPERVISOR_SCOPE_UNCHECKED'
                check_scope(binding)
        except Exception:
            if failure is None:
                failure = 'SUPERVISOR_ATTEMPT_UNAVAILABLE'
        finally:
            # Close the operation guard even if preparation only partially succeeded.
            running = False
            cleanup = 'UNCERTAIN'
            try:
                record = ports.cleanup_attempt(binding)
                if _matches_readback(record, FixtureCleanupReadback, binding) and record.state == 'VERIFIED':
                    cleanup = 'VERIFIED'
            except Exception:
                pass
            if cleanup == 'UNCERTAIN':
                failure = 'SUPERVISOR_CLEANUP_UNVERIFIED'

        if not check_scope(binding):
            return None
        observed_binding = binding
        return result

    def read_policy_denial(request):
        binding = observed_binding
        if binding is None or not _same_request(request, binding.request) or not check_scope(binding):
            return None
        record = ports.read_policy_denial(binding)
        return record if check_scope(binding) else None

    try:
        observer = make_fixture_canary_observer(scope, targets, read_attempt, read_policy_denial)
    except ValueError:
        return _supervised_report(_report('INVALID_SYNTHETIC_SCOPE'), cleanup, failure)
    return _supervised_report(rehearse_guest_canaries(scope, observer), cleanup, failure)
