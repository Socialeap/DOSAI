"""Offline guest isolation canary rehearsal and observation projection."""

from hashlib import sha256
import json
import re
from typing import NamedTuple


SOURCE_REVISION = '4913c5aa6004c11e3593ce8287344d1f2f4a5a94'
SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_V1'
SUPERVISOR_SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_SUPERVISION_V1'
WATCHDOG_SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_WATCHDOG_V1'
ATTEMPT_BUDGET_NS = 250_000_000
WATCHDOG_GRACE_NS = 250_000_000
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


class FixtureWatchdogPlan(NamedTuple):
    origin: str
    binding: FixtureAttemptBinding
    capsule_generation: str
    watchdog_generation: str
    verifier_generation: str
    cleanup_deadline_ns: int


class FixtureOwnedResources(NamedTuple):
    processes: int
    mounts: int
    sockets: int
    descriptors: int
    temporary_files: int
    leases: int
    brokered: int


class FixtureCleanupInventory(NamedTuple):
    origin: str
    binding: FixtureAttemptBinding
    capsule_generation: str
    watchdog_generation: str
    verifier_generation: str
    fence_ns: int
    observed_ns: int
    quiesced: bool
    resources: FixtureOwnedResources


class FixtureWatchdogPorts(NamedTuple):
    request_graceful: object
    force_stop: object


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


def _fixture_id(value):
    return type(value) is str and re.fullmatch(r'fixture-[a-z0-9-]{1,48}', value) is not None


def _tick(value):
    return type(value) is int and 0 <= value < 2**64


def _valid_watchdog_plan(plan):
    if (type(plan) is not FixtureWatchdogPlan or type(plan.origin) is not str or plan.origin != ORIGIN
            or type(plan.binding) is not FixtureAttemptBinding or not _tick(plan.cleanup_deadline_ns)):
        return False
    binding = plan.binding
    generations = (binding.supervisor_generation, plan.capsule_generation,
                   plan.watchdog_generation, plan.verifier_generation)
    request = binding.request
    return (all(_fixture_id(value) for value in generations) and len(set(generations)) == len(generations)
            and _is_digest(binding.target_digest) and _tick(binding.deadline_ns)
            and binding.deadline_ns < plan.cleanup_deadline_ns
            and type(request) is CanaryRequest and type(request.canary) is str and request.canary in CANARIES
            and type(request.leg) is str and request.leg in LEGS and _is_digest(request.challenge)
            and _fixture_id(request.process_start) and type(request.sequence) is int
            and request.sequence == CANARIES.index(request.canary) * len(LEGS) + LEGS.index(request.leg) + 1)


def verify_fixture_canary_cleanup(plan, inventory, fence_ns, now_ns):
    """Check a separate, owned-resource inventory after the cleanup fence."""
    if not _valid_watchdog_plan(plan):
        return None
    verified = (
        _tick(fence_ns) and _tick(now_ns) and now_ns < plan.cleanup_deadline_ns
        and type(inventory) is FixtureCleanupInventory and type(inventory.origin) is str and inventory.origin == ORIGIN
        and _matches_binding(inventory.binding, plan.binding)
        and type(inventory.capsule_generation) is str and inventory.capsule_generation == plan.capsule_generation
        and type(inventory.watchdog_generation) is str and inventory.watchdog_generation == plan.watchdog_generation
        and type(inventory.verifier_generation) is str and inventory.verifier_generation == plan.verifier_generation
        and _tick(inventory.fence_ns) and inventory.fence_ns == fence_ns
        and _tick(inventory.observed_ns) and fence_ns <= inventory.observed_ns <= now_ns
        and inventory.quiesced is True and type(inventory.resources) is FixtureOwnedResources
        and all(type(count) is int and count == 0 for count in inventory.resources)
    )
    return FixtureCleanupReadback(ORIGIN, plan.binding, 'VERIFIED' if verified else 'UNCERTAIN')


def fixture_watchdog_binding_digest(plan):
    if not _valid_watchdog_plan(plan):
        raise ValueError('Invalid synthetic canary watchdog plan.')
    encoded = json.dumps((WATCHDOG_SCHEMA, plan), separators=(',', ':')).encode('ascii')
    return sha256(encoded).digest()


class FixtureCanaryWatchdog:
    """Reduce-only watchdog state driven by independent, serialized fixture pulses."""

    def __init__(self, plan, ports):
        if (not _valid_watchdog_plan(plan) or type(ports) is not FixtureWatchdogPorts
                or not all(callable(port) for port in ports)):
            raise ValueError('Invalid synthetic canary watchdog plan.')
        self._plan = plan
        self._ports = ports
        self._state = 'ACTIVE'
        self._reason = 'WATCHDOG_ARMED'
        self._fence = None
        self._last_tick = None
        self._forced = False

    def _snapshot(self, reason=None):
        cleanup = {'ACTIVE': 'NOT_REQUIRED', 'STOPPED': 'VERIFIED'}.get(self._state, 'UNCERTAIN')
        return {**_report(self._reason if reason is None else reason), 'schema': WATCHDOG_SCHEMA,
                'watchdogState': self._state, 'watchdogCleanup': cleanup}

    def scope_readback(self, binding):
        if not _matches_binding(binding, self._plan.binding):
            return None
        state = 'REVOKED' if self._state == 'QUARANTINED' else self._state
        return FixtureScopeReadback(ORIGIN, self._plan.binding, state)

    def cleanup_readback(self, binding):
        if not _matches_binding(binding, self._plan.binding):
            return None
        return FixtureCleanupReadback(ORIGIN, self._plan.binding,
                                      'VERIFIED' if self._state == 'STOPPED' else 'UNCERTAIN')

    def next_deadline_ns(self):
        if self._state == 'ACTIVE':
            return self._plan.binding.deadline_ns
        if self._state == 'STOPPING':
            if self._forced:
                return self._plan.cleanup_deadline_ns
            return min(self._fence + WATCHDOG_GRACE_NS, self._plan.cleanup_deadline_ns)
        return None

    def stop(self, binding, tick):
        if not _matches_binding(binding, self._plan.binding):
            return self._snapshot('WATCHDOG_BINDING_REJECTED')
        return self._advance(tick, 'OWNER_STOP_REQUESTED', None)

    def poll(self, tick, *, inventory=None):
        return self._advance(tick, None, inventory)

    def timer_unavailable(self):
        if self._state in ('STOPPED', 'QUARANTINED'):
            return self._snapshot()
        return self._quarantine('WATCHDOG_TIMER_UNAVAILABLE')

    def _force(self, tick=None):
        if self._forced:
            return
        self._forced = True
        if tick is not None:
            self._fence = tick
        try:
            self._ports.force_stop(self._plan)
        except Exception:
            # Verify independently. A transport error does not establish cleanup.
            pass

    def _quarantine(self, reason):
        self._state = 'QUARANTINED'
        self._reason = reason
        self._force()
        return self._snapshot()

    def _advance(self, tick, stop_reason, inventory):
        if self._state in ('STOPPED', 'QUARANTINED'):
            return self._snapshot()
        if not _tick(tick) or (self._last_tick is not None and tick < self._last_tick):
            return self._quarantine('WATCHDOG_CLOCK_UNAVAILABLE')
        self._last_tick = tick
        if self._state == 'ACTIVE':
            if stop_reason is None and tick < self._plan.binding.deadline_ns:
                return self._snapshot()
            self._state = 'STOPPING'
            self._reason = stop_reason or 'WATCHDOG_ATTEMPT_EXPIRED'
            self._fence = tick
            if tick >= self._plan.cleanup_deadline_ns:
                return self._quarantine('WATCHDOG_CLEANUP_EXPIRED')
            try:
                self._ports.request_graceful(self._plan)
            except Exception:
                self._force(tick)
            return self._snapshot()

        if tick >= self._plan.cleanup_deadline_ns:
            return self._quarantine('WATCHDOG_CLEANUP_EXPIRED')
        # The serialized watchdog turn takes an already available inventory.
        # No inventory reader can delay the graceful or force deadlines here.
        cleanup = verify_fixture_canary_cleanup(self._plan, inventory, self._fence, tick)
        if cleanup.state == 'VERIFIED':
            self._state = 'STOPPED'
            self._reason = 'WATCHDOG_CLEANUP_VERIFIED'
        elif tick >= self._fence + WATCHDOG_GRACE_NS:
            self._force(tick)
        return self._snapshot()
