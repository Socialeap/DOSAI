import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { parseStrictJson } from '../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '..');
const proofExecutable = resolve(root, 'out/DOSAI-darwin-arm64/DOSAI.app/Contents/MacOS/DOSAI');
const resultPrefix = 'DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:';
const allowedResults = new Set([
  'REGISTERED_AND_CLEANED',
  'REGISTRATION_REJECTED_CLEAN',
  'REGISTRATION_FAILED_RECOVERED',
  'PRECONDITION_FAILED',
  'CLEANUP_UNVERIFIED',
  'BINDING_INVALID',
  'NATIVE_ADDON_LOAD_FAILED',
  'NATIVE_CALL_CONTRACT_FAILED',
  'ELECTRON_READINESS_FAILED',
]);
const allowedStatuses = new Set([
  'NOT_REGISTERED',
  'ENABLED',
  'REQUIRES_APPROVAL',
  'NOT_FOUND',
]);
const receiptKeys = Object.freeze([
  'after_register',
  'after_unregister',
  'before',
  'consumed',
  'observe_attempts',
  'observe_completions',
  'register_attempts',
  'register_completions',
  'result',
  'unregister_attempts',
  'unregister_completions',
].sort());
const execFileAsync = promisify(execFile);

function admitRunnerArguments(arguments_) {
  if (arguments_.length !== 0) {
    throw new Error('DOSAI_LIFECYCLE_PROOF_ARGUMENTS_0001');
  }
}

function boundedCount(value, maximum) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

export function admitLifecycleProofOutput(stdout, stderr) {
  if (stderr !== '') {
    throw new Error('DOSAI_LIFECYCLE_PROOF_STDERR_0001');
  }
  if (!stdout.startsWith(resultPrefix) || !stdout.endsWith('\n')) {
    throw new Error('DOSAI_LIFECYCLE_PROOF_OUTPUT_0001');
  }
  const payload = stdout.slice(resultPrefix.length, -1);
  if (payload.includes('\n') || Buffer.byteLength(payload, 'utf8') > 3072) {
    throw new Error('DOSAI_LIFECYCLE_PROOF_OUTPUT_0001');
  }

  let receipt;
  try {
    receipt = parseStrictJson(Buffer.from(payload, 'utf8'));
  } catch {
    throw new Error('DOSAI_LIFECYCLE_PROOF_OUTPUT_0001');
  }
  if (
    receipt === null
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || Object.getPrototypeOf(receipt) !== Object.prototype
    || Object.keys(receipt).sort().join('\0') !== receiptKeys.join('\0')
    || !allowedResults.has(receipt.result)
    || !allowedStatuses.has(receipt.before)
    || !allowedStatuses.has(receipt.after_register)
    || !allowedStatuses.has(receipt.after_unregister)
    || !boundedCount(receipt.observe_attempts, 3)
    || !boundedCount(receipt.register_attempts, 1)
    || !boundedCount(receipt.unregister_attempts, 1)
    || !boundedCount(receipt.observe_completions, 3)
    || !boundedCount(receipt.register_completions, 1)
    || !boundedCount(receipt.unregister_completions, 1)
    || receipt.observe_completions > receipt.observe_attempts
    || receipt.register_completions > receipt.register_attempts
    || receipt.unregister_completions > receipt.unregister_attempts
    || typeof receipt.consumed !== 'boolean'
  ) {
    throw new Error('DOSAI_LIFECYCLE_PROOF_OUTPUT_0001');
  }

  const terminalWithoutLifecycle = new Set([
    'NATIVE_ADDON_LOAD_FAILED',
    'ELECTRON_READINESS_FAILED',
  ]);
  if (
    terminalWithoutLifecycle.has(receipt.result)
    && (
      receipt.consumed
      || receipt.observe_attempts !== 0
      || receipt.register_attempts !== 0
      || receipt.unregister_attempts !== 0
      || receipt.observe_completions !== 0
      || receipt.register_completions !== 0
      || receipt.unregister_completions !== 0
    )
  ) {
    throw new Error('DOSAI_LIFECYCLE_PROOF_OUTPUT_0001');
  }
  if (
    terminalWithoutLifecycle.has(receipt.result)
    && (
      receipt.before !== 'NOT_FOUND'
      || receipt.after_register !== 'NOT_FOUND'
      || receipt.after_unregister !== 'NOT_FOUND'
    )
  ) {
    throw new Error('DOSAI_LIFECYCLE_PROOF_OUTPUT_0001');
  }
  if (!terminalWithoutLifecycle.has(receipt.result) && !receipt.consumed) {
    throw new Error('DOSAI_LIFECYCLE_PROOF_OUTPUT_0001');
  }
  return Object.freeze({ ...receipt });
}

export function isSuccessfulLifecycleProof(receipt) {
  return receipt.result === 'REGISTERED_AND_CLEANED'
    && receipt.consumed === true
    && (receipt.before === 'NOT_REGISTERED' || receipt.before === 'NOT_FOUND')
    && (receipt.after_register === 'ENABLED'
      || receipt.after_register === 'REQUIRES_APPROVAL')
    && receipt.after_unregister === 'NOT_REGISTERED'
    && receipt.observe_attempts === 3
    && receipt.observe_completions === 3
    && receipt.register_attempts === 1
    && receipt.unregister_attempts === 1
    && receipt.register_completions === 1
    && receipt.unregister_completions === 1;
}

export async function runServiceManagementLifecycleProof() {
  const { stdout, stderr } = await execFileAsync(proofExecutable, [], {
    encoding: 'utf8',
    env: {
      LANG: 'C',
      LC_ALL: 'C',
      PATH: '/usr/bin:/bin',
    },
    killSignal: 'SIGKILL',
    maxBuffer: 4096,
    timeout: 15_000,
    windowsHide: true,
  });
  return admitLifecycleProofOutput(stdout, stderr);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  admitRunnerArguments(process.argv.slice(2));
  const receipt = await runServiceManagementLifecycleProof();
  process.stdout.write(`${resultPrefix}${JSON.stringify(receipt)}\n`);
  if (!isSuccessfulLifecycleProof(receipt)) process.exitCode = 1;
}
