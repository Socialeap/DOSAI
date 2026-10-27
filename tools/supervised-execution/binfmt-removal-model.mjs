// Inert trace model. No executor, CLI, host filesystem, process or network access.
import { createHash } from 'node:crypto';
import { parseStrictJson } from '../dosai-acceptance/src/strict-json.mjs';

const planDigest = 'f9ce860088aa2d85fb123aeee0ad882a9b8ad58085a0bea001a78353a593b772';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reject = () => { throw new Error('BINFMT_REMOVAL_MODEL_REJECTED'); };
const require = condition => { if (!condition) reject(); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, expected) {
  require(isRecord(value));
  require(Object.keys(value).sort().join('|') === [...expected].sort().join('|'));
}
const ordered = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
const sameFlat = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));

function snapshot(value, expected) {
  keys(value, ['global_enabled', 'entries']);
  require(value.global_enabled === true && Array.isArray(value.entries));
  require(value.entries.length === expected.length);
  const names = new Set();
  for (const entry of value.entries) {
    keys(entry, ['name', 'enabled', 'fields', 'sha256']);
    require(typeof entry.name === 'string' && !names.has(entry.name));
    names.add(entry.name);
    const accepted = expected.find(item => item.name === entry.name);
    require(accepted !== undefined && entry.enabled === true && entry.sha256 === accepted.sha256);
    keys(entry.fields, Object.keys(accepted.fields));
    require(Object.values(entry.fields).every(value => typeof value === 'string'));
    require(sameFlat(entry.fields, accepted.fields));
  }
}

function predicateResults(value, codes) {
  keys(value, codes);
  require(Object.values(value).every(result => result === true));
}

function result(state, completed) {
  return Object.freeze({
    schema: 'DOSAI_BINFMT_REMOVAL_SIMULATION_V1', simulation_only: true,
    execution_authorized: false, runtime_admission: false, builder_receipts: 0,
    state, simulated_completed_entries: completed,
  });
}

export function simulateExactBinfmtRemoval(planBytes, traceBytes) {
  require(Buffer.isBuffer(planBytes) && planBytes.length <= 32_768 && hash(planBytes) === planDigest);
  require(Buffer.isBuffer(traceBytes) && traceBytes.length <= 65_536);
  const plan = parseStrictJson(planBytes);
  const trace = parseStrictJson(traceBytes);
  keys(trace, ['host', 'preflight', 'initial', 'events', 'recheck']);
  keys(trace.host, ['run_id', 'run_attempt', 'job', 'sha', 'runner_environment', 'runner_os',
    'runner_arch', 'uname_machine', 'docker_arch', 'image_os', 'image_version', 'fresh_disposable_vm']);
  require(typeof trace.host.run_id === 'string' && /^[1-9][0-9]{0,31}$/.test(trace.host.run_id));
  require(trace.host.run_id !== plan.observed_run_id && trace.host.run_attempt === '1');
  require(['builder_host_a', 'builder_host_b'].includes(trace.host.job));
  require(typeof trace.host.sha === 'string' && /^[0-9a-f]{40}$/.test(trace.host.sha));
  require(trace.host.runner_environment === plan.required_provider && trace.host.runner_os === 'Linux');
  require(trace.host.runner_arch === 'X64' && trace.host.uname_machine === plan.required_native_architecture);
  require(trace.host.docker_arch === plan.required_docker_architecture);
  require(trace.host.image_os === plan.required_image_os && trace.host.image_version === plan.required_image_version);
  require(trace.host.fresh_disposable_vm === true);
  const codes = plan.all_original_predicates_must_be_rechecked;
  const preflightCodes = codes.filter(code => !['BINFMT_MISC_INTERPRETER_ACTIVE', 'RECEIPT_EMISSION_FAILED'].includes(code));
  predicateResults(trace.preflight, preflightCodes);
  snapshot(trace.initial, plan.entries);
  require(Array.isArray(trace.events) && trace.events.length <= plan.maximum_writes_per_host);
  let remaining = [...plan.entries];
  let lastElapsed = 0;
  for (const [index, event] of trace.events.entries()) {
    keys(event, ['entry', 'before', 'after', 'descriptor_preimage_sha256',
      'descriptor_identity_unchanged', 'attempts', 'result', 'written_bytes', 'elapsed_ms', 'payload_hex']);
    const target = remaining[0];
    require(event.entry === target.name && event.payload_hex === plan.write_payload_hex);
    snapshot(event.before, remaining);
    require(event.descriptor_preimage_sha256 === target.sha256 && event.descriptor_identity_unchanged === true);
    require(event.attempts === plan.maximum_attempts_per_entry);
    require(Number.isSafeInteger(event.elapsed_ms) && event.elapsed_ms >= lastElapsed);
    lastElapsed = event.elapsed_ms;
    require(['WRITTEN', 'ERROR', 'TIMEOUT', 'UNKNOWN'].includes(event.result));
    require(event.written_bytes === null || (Number.isSafeInteger(event.written_bytes) && event.written_bytes >= 0 && event.written_bytes <= 3));
    if (event.result !== 'WRITTEN' || event.written_bytes !== 3 || event.elapsed_ms > plan.maximum_preparation_seconds * 1000) {
      require(trace.events.length === index + 1 && trace.recheck === null);
      return result('SIMULATED_QUARANTINE_NO_RETRY', index);
    }
    remaining = remaining.slice(1);
    // Missing, extra, changed, or reappearing entries are never treated as success.
    snapshot(event.after, remaining);
  }
  if (remaining.length !== 0) {
    require(trace.recheck === null);
    return result('SIMULATED_INCOMPLETE_NO_ADMISSION', plan.entries.length - remaining.length);
  }
  keys(trace.recheck, ['host', 'predicate_results', 'inventory']);
  require(sameFlat(trace.recheck.host, trace.host));
  predicateResults(trace.recheck.predicate_results, codes);
  snapshot(trace.recheck.inventory, []);
  return result('SIMULATED_RECHECK_COMPLETE_NOT_RUNTIME_EVIDENCE', plan.entries.length);
}
