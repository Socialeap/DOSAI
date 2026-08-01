import { createHash, createPublicKey, verify } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { secureEnclaveProofHelperName } from '../../scripts/secure-enclave-helper.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const helperPath = join(
  root,
  'out/DOSAI-darwin-arm64/DOSAI.app/Contents/Resources',
  secureEnclaveProofHelperName,
);
const evidenceRoot = join(root, 'evidence');
const authorizationPhrase = 'DOSAI_OWNER_AUTHORIZED_LOCAL_SECURE_ENCLAVE_PROOF_V1';
const schema = 'DOSAI_P2_SECURE_ENCLAVE_LIVE_AUDIT_V1';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactRunID(arguments_) {
  if (arguments_.length !== 2 || arguments_[0] !== '--run-id') {
    throw new Error('USAGE_INVALID');
  }
  const runID = arguments_[1];
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(runID)) {
    throw new Error('RUN_ID_INVALID');
  }
  return runID;
}

function helperEnvironment() {
  return {
    HOME: homedir(),
    LANG: 'C',
    LC_ALL: 'C',
    PATH: '/usr/bin:/bin',
    TMPDIR: tmpdir(),
  };
}

async function invokeHelper(arguments_) {
  const { stderr, stdout } = await execFileAsync(helperPath, arguments_, {
    encoding: 'utf8',
    env: helperEnvironment(),
    maxBuffer: 256 * 1024,
    timeout: 30_000,
  });
  if (stderr !== '') {
    throw new Error('HELPER_STDERR_NOT_EMPTY');
  }
  return JSON.parse(stdout);
}

async function gitOutput(arguments_) {
  const { stdout } = await execFileAsync('/usr/bin/git', arguments_, {
    cwd: root,
    encoding: 'utf8',
    env: helperEnvironment(),
    maxBuffer: 64 * 1024,
    timeout: 5_000,
  });
  return stdout.trim();
}

async function writeEvidence(path, report) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await rm(temporaryPath, { force: true });
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
}

function record(report, id, condition, measurement) {
  const assertion = { id, result: condition ? 'PASS' : 'FAIL' };
  if (measurement !== undefined) {
    assertion.measurement = measurement;
  }
  report.assertions.push(assertion);
}

export async function runP2SecureEnclaveLiveAudit(runID) {
  const report = {
    schema,
    formal_acceptance_report: false,
    engineering_result: 'ERROR',
    run_id: runID,
    assertions: [],
    limitations: [
      'LOCAL_PLATFORM_EVIDENCE_ONLY',
      'REMOTE_HARDWARE_ATTESTATION_UNAVAILABLE',
      'AD_HOC_HELPER_SIGNATURE_ONLY',
      'PRODUCTION_CHECKPOINT_SIGNING_NOT_IMPLEMENTED',
    ],
  };
  let cleanupResponse;
  let lifecycleStarted = false;

  try {
    const [subject, worktree, helperBytes] = await Promise.all([
      gitOutput(['rev-parse', 'HEAD']),
      gitOutput(['status', '--porcelain', '--untracked-files=all']),
      readFile(helperPath),
    ]);
    report.subject_commit = subject;
    report.helper_sha256 = sha256(helperBytes);
    record(report, 'P2-SECURE-LIVE-CLEAN-SUBJECT', worktree === '');
    if (worktree !== '') {
      throw new Error('SUBJECT_NOT_CLEAN');
    }
    record(report, 'P2-SECURE-LIVE-PACKAGED-HELPER', (await stat(helperPath)).isFile());

    lifecycleStarted = true;
    const envelope = await invokeHelper([
      'exercise-test-lifecycle',
      runID,
      authorizationPhrase,
    ]);
    const proof = envelope.result;
    record(report, 'P2-SECURE-LIVE-HELPER-SUCCESS',
      envelope.ok === true && envelope.schema === 'DOSAI_SECURE_ENCLAVE_PROOF_HELPER_V1');
    record(report, 'P2-SECURE-LIVE-TOKEN', proof?.token === 'SECURE_ENCLAVE');
    record(report, 'P2-SECURE-LIVE-ALGORITHM', proof?.algorithm === 'ECDSA_P256_SHA256');
    record(report, 'P2-SECURE-LIVE-PRIVATE-KEY-NONEXPORTABLE',
      proof?.private_key_export === 'UNAVAILABLE');
    record(report, 'P2-SECURE-LIVE-HELPER-VERIFICATION', proof?.signature_verified === true);
    record(report, 'P2-SECURE-LIVE-HELPER-CLEANUP',
      proof?.cleanup_confirmed === true && proof?.mutation_performed === true);
    record(report, 'P2-SECURE-LIVE-NO-REMOTE-ATTESTATION-CLAIM',
      proof?.remote_attestation === 'UNAVAILABLE');

    const challenge = Buffer.from(
      `DOSAI-SECURE-ENCLAVE-LIFECYCLE-PROOF-V1\n${runID}\n`,
      'utf8',
    );
    const publicKeyBytes = Buffer.from(proof.public_key_spki_der_base64, 'base64');
    const signature = Buffer.from(proof.signature_der_base64, 'base64');
    const publicKey = createPublicKey({ format: 'der', key: publicKeyBytes, type: 'spki' });
    record(report, 'P2-SECURE-LIVE-CHALLENGE-BINDING',
      proof.challenge_sha256 === sha256(challenge));
    record(report, 'P2-SECURE-LIVE-KEY-IDENTITY',
      proof.key_id_sha256 === sha256(publicKeyBytes));
    record(report, 'P2-SECURE-LIVE-INDEPENDENT-SIGNATURE-VERIFICATION',
      verify('sha256', challenge, publicKey, signature));

    report.proof_bundle = {
      algorithm: proof.algorithm,
      challenge_sha256: proof.challenge_sha256,
      key_id_sha256: proof.key_id_sha256,
      public_key_spki_der_base64: proof.public_key_spki_der_base64,
      signature_der_base64: proof.signature_der_base64,
      token: proof.token,
    };
  } catch (error) {
    report.failure_code = /^[A-Z][A-Z0-9_]{2,63}$/.test(error?.message)
      ? error.message
      : 'UNEXPECTED_LIVE_AUDIT_ERROR';
  } finally {
    if (lifecycleStarted) {
      try {
        cleanupResponse = await invokeHelper(['cleanup-test-key', runID, authorizationPhrase]);
        record(report, 'P2-SECURE-LIVE-RECOVERY-CLEANUP',
          cleanupResponse.ok === true &&
          cleanupResponse.result?.cleanup_confirmed === true &&
          cleanupResponse.result?.preexisting_test_key_found === false &&
          cleanupResponse.result?.mutation_performed === false);
      } catch {
        record(report, 'P2-SECURE-LIVE-RECOVERY-CLEANUP', false);
        report.failure_code = 'RECOVERY_CLEANUP_FAILED';
      }
    }
  }

  report.engineering_result = report.assertions.length === 13 &&
    report.assertions.every(({ result }) => result === 'PASS')
    ? 'PASS'
    : 'FAIL';
  const serialized = JSON.stringify(report);
  report.secret_scan = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
  ].every((pattern) => !pattern.test(serialized)) ? 'PASS' : 'FAIL';
  if (report.secret_scan !== 'PASS') {
    report.engineering_result = 'ERROR';
    report.failure_code = 'SECRET_SCAN_FAILED';
  }

  const evidencePath = join(evidenceRoot, `p2-secure-enclave-live-${runID}.json`);
  await writeEvidence(evidencePath, report);
  const evidenceBytes = await readFile(evidencePath);
  return {
    evidence_path: evidencePath,
    evidence_sha256: sha256(evidenceBytes),
    report,
  };
}

if (import.meta.main) {
  const runID = exactRunID(process.argv.slice(2));
  const result = await runP2SecureEnclaveLiveAudit(runID);
  console.log(JSON.stringify({
    engineering_result: result.report.engineering_result,
    evidence_path: join('evidence', basename(result.evidence_path)),
    evidence_sha256: result.evidence_sha256,
    run_id: runID,
    secret_scan: result.report.secret_scan,
    subject_commit: result.report.subject_commit,
  }, null, 2));
  process.exitCode = result.report.engineering_result === 'PASS' ? 0 : 1;
}
