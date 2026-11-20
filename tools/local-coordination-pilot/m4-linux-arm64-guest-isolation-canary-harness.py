"""Offline guest isolation canary rehearsal and observation projection."""

from hashlib import sha256
import json
import re
from threading import Lock
from typing import NamedTuple, Optional


SOURCE_REVISION = '4913c5aa6004c11e3593ce8287344d1f2f4a5a94'
SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_V1'
SUPERVISOR_SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_SUPERVISION_V1'
WATCHDOG_SCHEMA = 'DOSAI_LINUX_ARM64_GUEST_CANARY_WATCHDOG_V1'
ATTEMPT_BUDGET_NS = 250_000_000
WATCHDOG_GRACE_NS = 250_000_000
MAX_CLEANUP_RESOURCES = 64
MAX_RESOURCE_INVENTORY_ROWS = 256
MAX_REFERENCE_STATUS_BYTES = 8192
TEMP_REFERENCE_FILTER_DIGEST = bytes.fromhex('be419653d0a20d09847ce283e1d0226ad751670257a57cc2ac42caf3135b8813')
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


class FixtureCleanupScope(NamedTuple):
    plan: FixtureWatchdogPlan
    fence_ns: int
    cgroup_digest: bytes
    resource_generation: str


class FixtureCleanupFenceReadback(NamedTuple):
    scope: FixtureCleanupScope
    state: str


class FixtureNonProcessResources(NamedTuple):
    mounts: int
    sockets: int
    descriptors: int
    temporary_files: int
    leases: int
    brokered: int


class FixtureResourceSample(NamedTuple):
    scope: FixtureCleanupScope
    observed_ns: int
    complete: bool
    resources: FixtureNonProcessResources


class FixtureCleanupCollectorPorts(NamedTuple):
    monotonic_ns: object
    read_fence: object
    read_population: object
    read_resources: object


class FixtureResourceTicket:
    """Opaque in-process reservation identity."""

    __slots__ = ()


class FixtureResourceBinding(NamedTuple):
    kind: str
    capsule_generation: str
    source_generation: str
    authority_id: str
    slot_id: str
    instance_id: str


class FixtureResourceReadSource(NamedTuple):
    generation: str
    authority_id: str
    read: object


class FixtureResourceReadSources(NamedTuple):
    mounts: FixtureResourceReadSource
    sockets: FixtureResourceReadSource
    descriptors: FixtureResourceReadSource
    temporary_files: FixtureResourceReadSource
    leases: FixtureResourceReadSource
    brokered: FixtureResourceReadSource


class FixtureResourceProbe(NamedTuple):
    scope: FixtureCleanupScope
    binding: FixtureResourceBinding


class FixtureResourceReadback(NamedTuple):
    probe: FixtureResourceProbe
    binding: FixtureResourceBinding
    observed_ns: int
    complete: bool
    slot_state: str
    owned_references: int


class FixtureResourceInventorySource(NamedTuple):
    kind: str
    generation: str
    authority_id: str
    snapshot: object


class FixtureResourceInventoryRow(NamedTuple):
    locator_id: str
    instance_id: str


class FixtureResourceInventorySnapshot(NamedTuple):
    probe: FixtureResourceProbe
    scope: FixtureCleanupScope
    kind: str
    source_generation: str
    authority_id: str
    observed_ns: int
    slots_complete: bool
    references_complete: bool
    slots: tuple
    references: tuple


class FixtureTempFileCoverage(NamedTuple):
    probe: FixtureResourceProbe
    observation_digest: bytes
    policy: str


class FixtureTempFilePolicyChallenge(NamedTuple):
    probe: FixtureResourceProbe
    enrollment_digest: bytes


class FixtureTempFilePolicyReadback(NamedTuple):
    challenge: FixtureTempFilePolicyChallenge
    policy_generation: str
    admission_revoked: bool
    single_table_since_creation: bool
    alternate_names_excluded: bool
    descriptor_transfer_excluded: bool
    file_mappings_excluded: bool
    kernel_holds_excluded: bool


class FixtureTempFileFilterReceipt(NamedTuple):
    enrollment_digest: bytes
    policy_generation: str
    program_digest: bytes
    pid: int
    prior_filters: int
    exclusive_bootstrap: bool
    installed: bool


class FixtureTempFileBoundaryReadback(NamedTuple):
    challenge: FixtureTempFilePolicyChallenge
    fence: FixtureCleanupFenceReadback
    external_references_excluded: bool
    close_path_quiesced: bool


class _FixtureResourceEntry(NamedTuple):
    kind: str
    settled: bool
    binding: Optional[FixtureResourceBinding]


class FixtureCleanupRegistryOwner(NamedTuple):
    reserve_writer: object
    finish_writer: object
    revoke_at: object
    verify_absent: object


class FixtureCleanupRegistryObserver(NamedTuple):
    read_fence: object
    read_resources: object


class FixtureCleanupRegistry(NamedTuple):
    owner: FixtureCleanupRegistryOwner
    observer: FixtureCleanupRegistryObserver


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


def _valid_cleanup_scope(scope):
    if type(scope) is not FixtureCleanupScope or not _valid_watchdog_plan(scope.plan):
        return False
    plan = scope.plan
    return (
        _tick(scope.fence_ns) and scope.fence_ns < plan.cleanup_deadline_ns
        and type(scope.cgroup_digest) is bytes and len(scope.cgroup_digest) == 32
        and _fixture_id(scope.resource_generation)
        and scope.resource_generation not in (
            plan.binding.supervisor_generation, plan.capsule_generation,
            plan.watchdog_generation, plan.verifier_generation,
        )
    )


def _quiesced_scope(readback, scope):
    return (type(readback) is FixtureCleanupFenceReadback and type(readback.state) is str
            and readback.state == 'REVOKED_QUIESCED'
            and _valid_cleanup_scope(readback.scope) and readback.scope == scope)


def collect_fixture_cleanup_inventory(scope, ports):
    """Sample separate, trusted cleanup sources outside the watchdog turn."""
    if (not _valid_cleanup_scope(scope) or type(ports) is not FixtureCleanupCollectorPorts
            or not all(callable(port) for port in ports)):
        return None
    plan = scope.plan
    population_binding = (fixture_watchdog_binding_digest(plan), plan.capsule_generation, scope.cgroup_digest)
    try:
        started = ports.monotonic_ns()
        if (not _tick(started) or not scope.fence_ns <= started < plan.cleanup_deadline_ns
                or not _quiesced_scope(ports.read_fence(), scope)
                or ports.read_population(*population_binding) is not False):
            return None
        sample = ports.read_resources()
        sampled = ports.monotonic_ns()
        if (type(sample) is not FixtureResourceSample or sample.complete is not True
                or not _valid_cleanup_scope(sample.scope) or sample.scope != scope
                or type(sample.resources) is not FixtureNonProcessResources
                or not all(_tick(count) for count in sample.resources)
                or not _tick(sample.observed_ns) or not _tick(sampled)
                or not started <= sample.observed_ns <= sampled < plan.cleanup_deadline_ns):
            return None
        if (ports.read_population(*population_binding) is not False
                or not _quiesced_scope(ports.read_fence(), scope)):
            return None
        finished = ports.monotonic_ns()
        if not _tick(finished) or not sampled <= finished < plan.cleanup_deadline_ns:
            return None
    except Exception:
        return None
    return FixtureCleanupInventory(
        plan.origin, plan.binding, plan.capsule_generation, plan.watchdog_generation,
        plan.verifier_generation, scope.fence_ns, finished, True, FixtureOwnedResources(0, *sample.resources),
    )


def _valid_resource_binding(binding):
    return (type(binding) is FixtureResourceBinding and type(binding.kind) is str
            and binding.kind in FixtureNonProcessResources._fields and all(_fixture_id(field) for field in binding[1:]))


def _resource_inventory_table(rows):
    if (type(rows) is not tuple or len(rows) > MAX_RESOURCE_INVENTORY_ROWS
            or not all(type(row) is FixtureResourceInventoryRow and _fixture_id(row.locator_id)
                       and _fixture_id(row.instance_id) for row in rows)):
        return None
    table = dict(rows)
    return table if len(table) == len(rows) else None


def _valid_temp_file_source(template, binding, observation_digest):
    return (_valid_cleanup_scope(template) and template.fence_ns == 0
            and _valid_resource_binding(binding) and binding.kind == 'temporary_files'
            and binding.capsule_generation == template.plan.capsule_generation
            and type(observation_digest) is bytes and len(observation_digest) == 32)


def _matches_temp_file_probe(probe, template, binding):
    return (type(probe) is FixtureResourceProbe and _valid_cleanup_scope(probe.scope)
            and probe.scope._replace(fence_ns=0) == template
            and _valid_resource_binding(probe.binding) and probe.binding == binding)


def _matches_temp_file_filter_status(raw, pid):
    if (type(raw) is not bytes or not 0 < len(raw) <= MAX_REFERENCE_STATUS_BYTES
            or not raw.endswith(b'\n') or b'\x00' in raw):
        return False
    pid_bytes = str(pid).encode('ascii')
    required = {
        b'Pid': pid_bytes, b'Tgid': pid_bytes, b'TracerPid': b'0', b'Threads': b'1',
        b'NoNewPrivs': b'1', b'Seccomp': b'2', b'Seccomp_filters': b'1',
    }
    seen = set()
    for line in raw[:-1].split(b'\n'):
        key, separator, value = line.partition(b':')
        if not separator or not key or key != key.strip():
            return False
        if key in required:
            if key in seen or value.strip(b' \t') != required[key]:
                return False
            seen.add(key)
    return seen == required.keys()


def prepare_fixture_temp_file_filter_policy(template, binding, observation_digest, enrollment_digest,
                                            policy_generation, receipt, read_boundary, read_status):
    """Combine trusted installation provenance with independent, pinned kernel status."""
    if (not _valid_temp_file_source(template, binding, observation_digest)
            or type(enrollment_digest) is not bytes or len(enrollment_digest) != 32
            or not _fixture_id(policy_generation) or not callable(read_boundary) or not callable(read_status)
            or type(receipt) is not FixtureTempFileFilterReceipt
            or type(receipt.enrollment_digest) is not bytes or receipt.enrollment_digest != enrollment_digest
            or type(receipt.policy_generation) is not str or receipt.policy_generation != policy_generation
            or type(receipt.program_digest) is not bytes or receipt.program_digest != TEMP_REFERENCE_FILTER_DIGEST
            or type(receipt.pid) is not int or not 0 < receipt.pid < 2**31
            or type(receipt.prior_filters) is not int or receipt.prior_filters != 0
            or receipt.exclusive_bootstrap is not True or receipt.installed is not True):
        raise ValueError('Invalid synthetic temporary file filter provenance.')

    def check_boundary(probe):
        challenge = FixtureTempFilePolicyChallenge(probe, enrollment_digest)
        report = read_boundary(challenge)
        return (type(report) is FixtureTempFileBoundaryReadback and report.challenge is challenge
                and _quiesced_scope(report.fence, probe.scope) and report.external_references_excluded is True
                and report.close_path_quiesced is True)

    def read_policy(challenge):
        if (type(challenge) is not FixtureTempFilePolicyChallenge
                or type(challenge.enrollment_digest) is not bytes or challenge.enrollment_digest != enrollment_digest
                or not _matches_temp_file_probe(challenge.probe, template, binding)):
            return None
        try:
            if not check_boundary(challenge.probe):
                return None
            if not _matches_temp_file_filter_status(read_status(enrollment_digest), receipt.pid):
                return None
            if not check_boundary(challenge.probe):
                return None
        except Exception:
            return None
        return FixtureTempFilePolicyReadback(challenge, policy_generation, True, True, True, True, True, True)

    return read_policy


def prepare_fixture_temp_file_reference_coverage(template, binding, observation_digest, enrollment_digest,
                                                 policy_generation, read_policy, verify_enrollment):
    """Require independent reference exclusions and exact kernel enrollment for each read."""
    if (not _valid_temp_file_source(template, binding, observation_digest)
            or type(enrollment_digest) is not bytes or len(enrollment_digest) != 32
            or not _fixture_id(policy_generation)
            or not callable(read_policy) or not callable(verify_enrollment)):
        raise ValueError('Invalid synthetic temporary file reference coverage.')

    def read_coverage(probe):
        if not _matches_temp_file_probe(probe, template, binding):
            return None
        challenge = FixtureTempFilePolicyChallenge(probe, enrollment_digest)
        try:
            report = read_policy(challenge)
            if (type(report) is not FixtureTempFilePolicyReadback or report.challenge is not challenge
                    or type(report.policy_generation) is not str or report.policy_generation != policy_generation
                    or not all(control is True for control in report[2:])
                    or verify_enrollment(enrollment_digest, observation_digest) is not True):
                return None
        except Exception:
            return None
        return FixtureTempFileCoverage(probe, observation_digest, 'REVOKED_EXCLUSIVE_DESCRIPTOR_ONLY')

    return read_coverage


def prepare_fixture_temp_file_inventory_source(template, binding, observation_digest, monotonic_ns,
                                               read_coverage, observe_file):
    """Project one pinned descriptor-only file into the resource inventory."""
    if (not _valid_temp_file_source(template, binding, observation_digest)
            or not all(callable(port) for port in (monotonic_ns, read_coverage, observe_file))):
        raise ValueError('Invalid synthetic temporary file inventory source.')

    def descriptor_only(probe):
        record = read_coverage(probe)
        return (type(record) is FixtureTempFileCoverage and record.probe is probe
                and type(record.observation_digest) is bytes and record.observation_digest == observation_digest
                and type(record.policy) is str and record.policy == 'REVOKED_EXCLUSIVE_DESCRIPTOR_ONLY')

    def snapshot(probe):
        if not _matches_temp_file_probe(probe, template, binding):
            return None
        try:
            if not descriptor_only(probe):
                return None
            result = observe_file(observation_digest)
            if type(result) is not tuple or len(result) != 2 or not descriptor_only(probe):
                return None
            observed = monotonic_ns()
        except Exception:
            return None
        state, count = result
        if (type(state) is not str or state not in ('VACANT', 'PRESENT', 'REPLACED')
                or type(count) is not int or not 0 <= count <= MAX_RESOURCE_INVENTORY_ROWS
                or not _tick(observed) or not probe.scope.fence_ns <= observed < template.plan.cleanup_deadline_ns):
            return None
        slots = ()
        if state == 'PRESENT':
            slots = (FixtureResourceInventoryRow(binding.slot_id, binding.instance_id),)
        elif state == 'REPLACED':
            replacement = 'fixture-replacement' if binding.instance_id != 'fixture-replacement' else 'fixture-other'
            slots = (FixtureResourceInventoryRow(binding.slot_id, replacement),)
        references = tuple(
            FixtureResourceInventoryRow(f'fixture-temp-ref-{index}', binding.instance_id) for index in range(count)
        )
        return FixtureResourceInventorySnapshot(
            probe, probe.scope, binding.kind, binding.source_generation, binding.authority_id,
            observed, True, True, slots, references,
        )

    return FixtureResourceInventorySource(binding.kind, binding.source_generation, binding.authority_id, snapshot)


def prepare_fixture_resource_absence_readers(plan, cgroup_digest, resource_generation, sources):
    """Adapt six pinned, independent inventory sources to registry readbacks."""
    template = FixtureCleanupScope(plan, 0, cgroup_digest, resource_generation)
    kinds = FixtureNonProcessResources._fields
    if not _valid_cleanup_scope(template) or type(sources) is not tuple or len(sources) != len(kinds):
        raise ValueError('Invalid synthetic resource inventory sources.')
    sources_by_kind = {}
    for source in sources:
        if (type(source) is not FixtureResourceInventorySource or type(source.kind) is not str
                or source.kind not in kinds or source.kind in sources_by_kind
                or not _fixture_id(source.generation) or not _fixture_id(source.authority_id)
                or not callable(source.snapshot)):
            raise ValueError('Invalid synthetic resource inventory sources.')
        sources_by_kind[source.kind] = source

    def bind(source):
        def read(probe):
            if (type(probe) is not FixtureResourceProbe or not _valid_cleanup_scope(probe.scope)
                    or probe.scope._replace(fence_ns=0) != template or not _valid_resource_binding(probe.binding)):
                return None
            binding = probe.binding
            if ((binding.kind, binding.source_generation, binding.authority_id)
                    != (source.kind, source.generation, source.authority_id)
                    or binding.capsule_generation != plan.capsule_generation):
                return None
            try:
                snapshot = source.snapshot(probe)
            except Exception:
                return None
            if (type(snapshot) is not FixtureResourceInventorySnapshot or snapshot.probe is not probe
                    or not _valid_cleanup_scope(snapshot.scope) or snapshot.scope != probe.scope
                    or not all(type(value) is str for value in (
                        snapshot.kind, snapshot.source_generation, snapshot.authority_id,
                    ))
                    or (snapshot.kind, snapshot.source_generation, snapshot.authority_id)
                    != (source.kind, source.generation, source.authority_id)
                    or not _tick(snapshot.observed_ns)
                    or not probe.scope.fence_ns <= snapshot.observed_ns < plan.cleanup_deadline_ns
                    or snapshot.slots_complete is not True or snapshot.references_complete is not True):
                return None
            slots = _resource_inventory_table(snapshot.slots)
            references = _resource_inventory_table(snapshot.references)
            if slots is None or references is None:
                return None
            occupant = slots.get(binding.slot_id)
            if occupant is None:
                state = 'VACANT'
            else:
                state = 'PRESENT' if occupant == binding.instance_id else 'REPLACED'
            # A second exposed slot still counts even when the reference census
            # has no additional rows for this instance.
            count = sum(instance_id == binding.instance_id for instance_id in slots.values())
            count += sum(instance_id == binding.instance_id for instance_id in references.values())
            return FixtureResourceReadback(probe, binding, snapshot.observed_ns, True, state, count)

        return FixtureResourceReadSource(source.generation, source.authority_id, read)

    return FixtureResourceReadSources(*(bind(sources_by_kind[kind]) for kind in kinds))


def _confirmed_resource_absence(readback, probe):
    return (type(readback) is FixtureResourceReadback and readback.probe is probe
            and _valid_resource_binding(readback.binding) and readback.binding == probe.binding
            and _tick(readback.observed_ns) and readback.complete is True
            and type(readback.slot_state) is str and readback.slot_state == 'VACANT'
            and type(readback.owned_references) is int and readback.owned_references == 0)


def prepare_fixture_cleanup_registry(plan, cgroup_digest, resource_generation, monotonic_ns, sources):
    """Create owner and observer ports for one offline capsule resource registry."""
    template = FixtureCleanupScope(plan, 0, cgroup_digest, resource_generation)
    if (not _valid_cleanup_scope(template) or not callable(monotonic_ns)
            or type(sources) is not FixtureResourceReadSources
            or not all(type(source) is FixtureResourceReadSource and _fixture_id(source.generation)
                       and _fixture_id(source.authority_id) and callable(source.read) for source in sources)):
        raise ValueError('Invalid synthetic cleanup registry.')
    sources_by_kind = sources._asdict()

    lock = Lock()
    # Each reservation keeps the writer open until settling, and retains its
    # resource count until the owner supplies independent absence evidence.
    records = {}
    scope = None
    fence_witness = None
    revoked = False
    last_ns = 0

    def read_tick():
        try:
            tick = monotonic_ns()
        except Exception:
            return None
        return tick if _tick(tick) else None

    def accept_tick(tick):
        nonlocal last_ns
        if tick is None or tick < last_ns:
            return False
        last_ns = tick
        return tick < plan.cleanup_deadline_ns

    def reserve_writer(kind):
        if type(kind) is not str or kind not in FixtureNonProcessResources._fields:
            return None
        tick = read_tick()
        with lock:
            if (revoked or len(records) >= MAX_CLEANUP_RESOURCES or not accept_tick(tick)
                    or tick >= plan.binding.deadline_ns):
                return None
            ticket = FixtureResourceTicket()
            records[ticket] = _FixtureResourceEntry(kind, False, None)
            return ticket

    def finish_writer(ticket, binding=None):
        if type(ticket) is not FixtureResourceTicket:
            return False
        tick = read_tick()
        with lock:
            record = records.get(ticket)
            if record is None or record.settled or not accept_tick(tick):
                return False
            source = sources_by_kind[record.kind]
            if binding is not None and (
                not _valid_resource_binding(binding) or binding.kind != record.kind
                or binding.capsule_generation != plan.capsule_generation
                or binding.source_generation != source.generation or binding.authority_id != source.authority_id
                or any(entry.binding is not None and entry.kind == binding.kind
                       and entry.binding.authority_id == binding.authority_id and entry.binding.slot_id == binding.slot_id
                       for entry in records.values())
            ):
                return False
            records[ticket] = _FixtureResourceEntry(record.kind, True, binding)
            return True

    def revoke_at(fence_ns):
        nonlocal revoked, scope, fence_witness, last_ns
        # The watchdog supplies its serialized Stop or force tick. Close
        # admission even if the tick is invalid, without reading any port.
        with lock:
            if revoked and scope is None:
                return None
            revoked = True
            if not _tick(fence_ns) or fence_ns >= plan.cleanup_deadline_ns:
                scope = None
                fence_witness = None
                return None
            if scope is not None and fence_ns <= scope.fence_ns:
                return scope if fence_ns == scope.fence_ns else None
            scope = template._replace(fence_ns=fence_ns)
            fence_witness = None
            last_ns = max(last_ns, fence_ns)
            return scope

    def verify_absent(fence, ticket):
        if type(ticket) is not FixtureResourceTicket:
            return False
        started = read_tick()
        with lock:
            entry = records.get(ticket)
            if (fence_witness is None or fence is not fence_witness or entry is None
                    or entry.binding is None or not accept_tick(started)):
                return False
            probe = FixtureResourceProbe(fence.scope, entry.binding)
            reader = sources_by_kind[entry.kind].read
        # A trusted reader may stall. The watchdog and other registry operations
        # can still advance the fence while the lock is released.
        try:
            readback = reader(probe)
        except Exception:
            return False
        finished = read_tick()
        with lock:
            if (fence is not fence_witness or records.get(ticket) is not entry
                    or not accept_tick(finished) or not _confirmed_resource_absence(readback, probe)
                    or not started <= readback.observed_ns <= finished):
                return False
            del records[ticket]
            return True

    def quiesced():
        # Called with the lock held. The same lock linearizes writer admission
        # and revocation. A writer admitted before Stop must settle before readback.
        return scope is not None and all(entry.settled for entry in records.values())

    def read_fence():
        nonlocal fence_witness
        tick = read_tick()
        with lock:
            if not quiesced() or not accept_tick(tick):
                return None
            if fence_witness is None:
                fence_witness = FixtureCleanupFenceReadback(scope, 'REVOKED_QUIESCED')
            return fence_witness

    def read_resources():
        tick = read_tick()
        with lock:
            if fence_witness is None or not accept_tick(tick):
                return None
            counts = dict.fromkeys(FixtureNonProcessResources._fields, 0)
            for entry in records.values():
                counts[entry.kind] += 1
            return FixtureResourceSample(scope, tick, True, FixtureNonProcessResources(**counts))

    return FixtureCleanupRegistry(
        FixtureCleanupRegistryOwner(reserve_writer, finish_writer, revoke_at, verify_absent),
        FixtureCleanupRegistryObserver(read_fence, read_resources),
    )


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
