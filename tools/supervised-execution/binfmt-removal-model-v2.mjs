// Inert fixtures only. This module does not authenticate evidence or authorize effects.
import { createHash } from 'node:crypto';
import { parseStrictJson } from '../dosai-acceptance/src/strict-json.mjs';

const contractDigest = '65338e7d60401f3967bfb9a44ca32488167497bc3f147c0103a99a62576b7124';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const deny = () => { throw new Error('BINFMT_V2_FIXTURE_REJECTED'); };
const require = condition => { if (!condition) deny(); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, expected) {
  require(record(value));
  const actual = Object.keys(value);
  require(actual.length === expected.length && actual.every(key => expected.includes(key)));
}
function sameFlat(a, b) {
  require(record(a) && record(b));
  require(Object.values(a).every(v => ['string', 'number', 'boolean'].includes(typeof v)));
  require(Object.values(b).every(v => ['string', 'number', 'boolean'].includes(typeof v)));
  const sort = v => Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(sort(a)) === JSON.stringify(sort(b));
}
const digestString = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9:_+./\[\]-]{1,160}$/.test(value);
function parse(bytes) {
  require(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 65_536);
  return parseStrictJson(bytes);
}
function predicates(value, codes) {
  keys(value, codes);
  require(Object.values(value).every(v => v === true));
}
function host(value, contract) {
  keys(value, ['run_id', 'run_attempt', 'job', 'sha', 'runner_environment', 'runner_os',
    'runner_arch', 'uname_machine', 'docker_arch', 'image_os', 'image_version', 'fresh_disposable_vm',
    'kernel_release', 'kernel_package', 'kernel_source_sha256']);
  require(typeof value.run_id === 'string' && /^[1-9][0-9]{0,31}$/.test(value.run_id));
  require(value.run_id !== contract.observed_run_id && value.run_attempt === '1');
  require(['builder_host_a', 'builder_host_b'].includes(value.job));
  require(typeof value.sha === 'string' && /^[0-9a-f]{40}$/.test(value.sha));
  require(value.runner_environment === contract.required_provider && value.runner_os === 'Linux');
  require(value.runner_arch === 'X64' && value.uname_machine === contract.required_native_architecture);
  require(value.docker_arch === contract.required_docker_architecture);
  require(value.image_os === contract.required_image_os && value.image_version === contract.required_image_version);
  require(value.fresh_disposable_vm === true && identifier(value.kernel_release) && identifier(value.kernel_package));
  require(digestString(value.kernel_source_sha256));
}
function registry(value) {
  keys(value, ['filesystem', 'device', 'inode', 'mount_id', 'mount_namespace', 'user_namespace', 'effective_scope']);
  require(value.filesystem === 'binfmt_misc' && value.effective_scope === 'SAME_EFFECTIVE_REGISTRY_FIXTURE');
  require(typeof value.device === 'string' && /^[0-9]{1,10}:[0-9]{1,10}$/.test(value.device));
  for (const key of ['inode', 'mount_id']) require(typeof value[key] === 'string' && /^[1-9][0-9]{0,19}$/.test(value[key]));
  require(typeof value.mount_namespace === 'string' && /^mnt:\[[1-9][0-9]{0,19}\]$/.test(value.mount_namespace));
  require(typeof value.user_namespace === 'string' && /^user:\[[1-9][0-9]{0,19}\]$/.test(value.user_namespace));
}
function snapshot(value, expected, objectIds, identity) {
  keys(value, ['registry', 'global_enabled', 'entries']);
  registry(value.registry);
  require(sameFlat(value.registry, identity) && value.global_enabled === true);
  require(Array.isArray(value.entries) && value.entries.length === expected.length);
  const seen = new Set();
  for (const entry of value.entries) {
    keys(entry, ['name', 'enabled', 'fields', 'sha256', 'object_id']);
    require(typeof entry.name === 'string' && !seen.has(entry.name));
    seen.add(entry.name);
    const accepted = expected.find(e => e.name === entry.name);
    require(accepted !== undefined && entry.enabled === true && entry.sha256 === accepted.sha256);
    require(entry.object_id === objectIds[entry.name]);
    keys(entry.fields, Object.keys(accepted.fields));
    require(sameFlat(entry.fields, accepted.fields));
  }
}
function result(state, acceptedRequests, absenceObservations) {
  return Object.freeze({
    schema: 'DOSAI_BINFMT_REMOVAL_SIMULATION_V2', simulation_only: true,
    execution_authorized: false, runtime_admission: false, builder_receipts: 0,
    trust_authentication: 'NOT_PERFORMED_TEST_FIXTURE',
    write_requests_accepted: acceptedRequests, target_absence_observations: absenceObservations,
    exclusive_causal_removal: 'UNPROVEN', atomic_compare_remove_proven: false,
    privileged_writer_exclusion_proven: false, continuous_registry_emptiness_proven: false, state,
  });
}

export function simulateBinfmtRemovalV2(contractBytes, traceBytes, trustFixtureBytes) {
  require(Buffer.isBuffer(contractBytes) && contractBytes.length <= 32_768 && hash(contractBytes) === contractDigest);
  const contract = parse(contractBytes);
  const trace = parse(traceBytes);
  const trust = parse(trustFixtureBytes);
  keys(trust, ['schema', 'fixture_only', 'contract_sha256', 'boundary_sha256',
    'evaluation_time_ms', 'expected_host', 'expected_registry', 'expected_fence_generation', 'expected_review_sha256']);
  require(trust.schema === 'DOSAI_BINFMT_TRUST_FIXTURE_V2' && trust.fixture_only === true);
  require(trust.contract_sha256 === contractDigest && digestString(trust.boundary_sha256));
  require(Number.isSafeInteger(trust.evaluation_time_ms) && trust.evaluation_time_ms >= 0);
  keys(trace, ['host', 'boundary', 'initial', 'preflight', 'events', 'recheck']);
  host(trace.host, contract); host(trust.expected_host, contract);
  require(sameFlat(trace.host, trust.expected_host));
  registry(trust.expected_registry);
  const boundary = trace.boundary;
  keys(boundary, ['schema', 'fixture_only', 'contract_sha256', 'host', 'registry', 'fence',
    'issued_at_ms', 'expires_at_ms', 'writer_state', 'writer_inventory_sha256', 'kernel_match',
    'trust_assumption', 'assumption_decision_sha256', 'review_sha256', 'entry_object_ids', 'scope']);
  // Hashes relate fixtures only; no signature/issuer validation is implemented here.
  require(hash(Buffer.from(JSON.stringify(boundary))) === trust.boundary_sha256);
  require(boundary.schema === 'DOSAI_BINFMT_BOUNDARY_FIXTURE_V2' && boundary.fixture_only === true);
  require(boundary.contract_sha256 === contractDigest);
  host(boundary.host, contract); require(sameFlat(boundary.host, trace.host));
  registry(boundary.registry); require(sameFlat(boundary.registry, trust.expected_registry));
  require(boundary.writer_state === 'DOCUMENTED_ASSUMPTION_FIXTURE');
  require(digestString(boundary.writer_inventory_sha256) && boundary.kernel_match === 'REVIEWED_IDENTITY_FIXTURE');
  require(boundary.trust_assumption === 'PRIVILEGED_HOST_AND_PROVIDER_TRUSTED_FIXTURE');
  require(digestString(boundary.assumption_decision_sha256));
  require(trust.expected_review_sha256 === contract.review_input.sha256 && boundary.review_sha256 === trust.expected_review_sha256);
  keys(boundary.fence, ['lease_id', 'generation', 'state', 'writer_slots', 'helper_instances', 'privilege_lifetime']);
  require(digestString(boundary.fence.lease_id) && boundary.fence.state === 'ACTIVE');
  require(typeof trust.expected_fence_generation === 'string' && /^[1-9][0-9]{0,19}$/.test(trust.expected_fence_generation) && boundary.fence.generation === trust.expected_fence_generation);
  require(boundary.fence.writer_slots === 1 && boundary.fence.helper_instances === 1);
  require(boundary.fence.privilege_lifetime === 'PREPARATION_ONLY');
  require(Number.isSafeInteger(boundary.issued_at_ms) && boundary.issued_at_ms >= 0);
  require(Number.isSafeInteger(boundary.expires_at_ms) && boundary.expires_at_ms > boundary.issued_at_ms);
  require(boundary.expires_at_ms - boundary.issued_at_ms <= contract.maximum_preparation_seconds * 1000);
  require(boundary.issued_at_ms <= trust.evaluation_time_ms && trust.evaluation_time_ms < boundary.expires_at_ms);
  const names = contract.entries.map(e => e.name);
  keys(boundary.entry_object_ids, names);
  require(Object.values(boundary.entry_object_ids).every(identifier));
  require(new Set(Object.values(boundary.entry_object_ids)).size === names.length);
  require(JSON.stringify(boundary.scope) === JSON.stringify(names));
  const identity = boundary.registry;
  const objectIds = boundary.entry_object_ids;
  const codes = contract.all_original_predicates_must_be_rechecked;
  predicates(trace.preflight, codes.filter(c => !['BINFMT_MISC_INTERPRETER_ACTIVE', 'RECEIPT_EMISSION_FAILED'].includes(c)));
  snapshot(trace.initial, contract.entries, objectIds, identity);
  require(Array.isArray(trace.events) && trace.events.length <= 4);
  let remaining = [...contract.entries];
  let accepted = 0;
  let absent = 0;
  let lastElapsed = 0;
  for (const [index, event] of trace.events.entries()) {
    keys(event, ['entry', 'before', 'after', 'descriptor_object_id', 'descriptor_preimage_sha256',
      'fence_generation', 'fence_state', 'attempts', 'payload_hex', 'request_result', 'written_bytes',
      'elapsed_ms', 'completed_elapsed_ms', 'interference']);
    const target = remaining[0];
    require(event.entry === target.name && event.descriptor_object_id === objectIds[target.name]);
    require(event.descriptor_preimage_sha256 === target.sha256);
    require(event.fence_generation === boundary.fence.generation && event.fence_state === 'ACTIVE');
    snapshot(event.before, remaining, objectIds, identity);
    require(event.attempts === 1 && event.payload_hex === contract.write_payload_hex);
    require(Number.isSafeInteger(event.elapsed_ms) && event.elapsed_ms >= lastElapsed);
    require(event.elapsed_ms <= 5000 && trust.evaluation_time_ms + event.elapsed_ms < boundary.expires_at_ms);
    require(event.completed_elapsed_ms === null || (Number.isSafeInteger(event.completed_elapsed_ms) && event.completed_elapsed_ms >= event.elapsed_ms));
    lastElapsed = event.completed_elapsed_ms ?? event.elapsed_ms;
    require(['ACCEPTED', 'ERROR', 'TIMEOUT', 'UNKNOWN'].includes(event.request_result));
    require(['NOT_DETECTED', 'DETECTED', 'UNKNOWN'].includes(event.interference));
    require(event.written_bytes === null || (Number.isSafeInteger(event.written_bytes) && event.written_bytes >= 0 && event.written_bytes <= 3));
    const requestAccepted = event.request_result === 'ACCEPTED' && event.written_bytes === 3;
    if (requestAccepted) accepted += 1;
    if (!requestAccepted || event.interference !== 'NOT_DETECTED' || event.completed_elapsed_ms === null || event.completed_elapsed_ms > 5000 ||
        trust.evaluation_time_ms + event.completed_elapsed_ms >= boundary.expires_at_ms) {
      require(trace.events.length === index + 1 && trace.recheck === null);
      return result('SIMULATED_QUARANTINE_NO_RETRY', accepted, absent);
    }
    if (event.after === null) {
      require(trace.events.length === index + 1 && trace.recheck === null);
      return result('SIMULATED_ABSENCE_UNOBSERVED_NO_ADMISSION', accepted, absent);
    }
    remaining = remaining.slice(1);
    snapshot(event.after, remaining, objectIds, identity);
    absent += 1;
  }
  if (remaining.length) {
    require(trace.recheck === null);
    return result('SIMULATED_INCOMPLETE_NO_ADMISSION', accepted, absent);
  }
  keys(trace.recheck, ['host', 'inventory', 'predicate_results', 'fence_generation', 'fence_state', 'elapsed_ms', 'mutation_authority']);
  host(trace.recheck.host, contract); require(sameFlat(trace.recheck.host, trace.host));
  require(trace.recheck.mutation_authority === 'DROPPED');
  require(trace.recheck.fence_generation === boundary.fence.generation && trace.recheck.fence_state === 'ACTIVE');
  require(Number.isSafeInteger(trace.recheck.elapsed_ms) && trace.recheck.elapsed_ms >= lastElapsed);
  require(trust.evaluation_time_ms + trace.recheck.elapsed_ms < boundary.expires_at_ms);
  snapshot(trace.recheck.inventory, [], objectIds, identity);
  predicates(trace.recheck.predicate_results, codes);
  return result('SIMULATED_RECHECK_OBSERVED_CAUSALITY_UNPROVEN', accepted, absent);
}
