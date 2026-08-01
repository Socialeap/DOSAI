import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { RekorTufFailure, resolveRekorV2Trust } from '../../native-helpers/audit/rekor-tuf.ts';
import {
  buildRekorV2CreateEntry,
  verifyRekorV2CreateEntryResponse,
  verifyStoredRekorV2Receipt,
} from '../../native-helpers/audit/rekor-v2.ts';
import { checkpointFixture } from '../support/p2-checkpoint-fixtures.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const evidenceRoot = join(root, 'evidence');
const tufToolRoot = join(root, 'audit-tools/rekor-tuf');
const mirrorUrl = 'https://tuf-repo-cdn.sigstore.dev';
const authorizationPhrase = 'DOSAI_OWNER_AUTHORIZED_PUBLIC_REKOR_SYNTHETIC_PROOF_V1';
const schema = 'DOSAI_P2_REKOR_LIVE_AUDIT_V1';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function argumentsFrom(values) {
  if (
    (values.length !== 4 && values.length !== 6) ||
    values[0] !== '--run-id' ||
    values[2] !== '--mode' ||
    !['trust-only', 'publish'].includes(values[3])
  ) {
    throw new Error('USAGE_INVALID');
  }
  const runID = values[1];
  const mode = values[3];
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(runID)) {
    throw new Error('RUN_ID_INVALID');
  }
  if (
    mode === 'publish' &&
    (values.length !== 6 || values[4] !== '--authorization' || values[5] !== authorizationPhrase)
  ) {
    throw new Error('PUBLICATION_NOT_AUTHORIZED');
  }
  if (mode === 'trust-only' && values.length !== 4) {
    throw new Error('USAGE_INVALID');
  }
  return { authorization: values[5], mode, runID };
}

async function gitOutput(arguments_) {
  const { stdout } = await execFileAsync('/usr/bin/git', arguments_, {
    cwd: root,
    encoding: 'utf8',
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
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

function record(report, id, result, measurement) {
  const assertion = { id, result };
  if (measurement !== undefined) {
    assertion.measurement = measurement;
  }
  report.assertions.push(assertion);
}

function metadataSummary(text, now) {
  const document = JSON.parse(text);
  const version = document?.signed?.version;
  const expires = document?.signed?.expires;
  if (!Number.isSafeInteger(version) || typeof expires !== 'string') {
    throw new Error('TUF_METADATA_SHAPE_INVALID');
  }
  return {
    expires,
    sha256: sha256(text),
    unexpired_at_audit: Date.parse(expires) > now.getTime(),
    version,
  };
}

async function verifiedTufMaterial(cachePath, now, initTUF) {
  const client = await initTUF({
    cachePath,
    forceInit: true,
    mirrorURL: mirrorUrl,
    timeout: 20_000,
  });
  const [signingConfigJson, trustedRootJson] = await Promise.all([
    client.getTarget('signing_config.v0.2.json'),
    client.getTarget('trusted_root.json'),
  ]);
  const entries = await readdir(cachePath, { withFileTypes: true });
  const repositories = entries.filter((entry) => entry.isDirectory());
  if (repositories.length !== 1) {
    throw new Error('TUF_CACHE_SHAPE_INVALID');
  }
  const metadataRoot = join(cachePath, repositories[0].name);
  const metadataNames = ['root.json', 'timestamp.json', 'snapshot.json', 'targets.json'];
  const metadataTexts = Object.fromEntries(await Promise.all(metadataNames.map(async (name) => [
    name,
    await readFile(join(metadataRoot, name), 'utf8'),
  ])));
  const metadata = Object.fromEntries(metadataNames.map((name) => [
    name,
    metadataSummary(metadataTexts[name], now),
  ]));
  return { metadata, metadataTexts, signingConfigJson, trustedRootJson };
}

async function loadTufClient() {
  const entryPath = join(tufToolRoot, 'node_modules/@sigstore/tuf/dist/index.js');
  const packageText = await readFile(
    join(tufToolRoot, 'node_modules/@sigstore/tuf/package.json'),
    'utf8',
  );
  const packageManifest = JSON.parse(packageText);
  if (packageManifest.name !== '@sigstore/tuf' || packageManifest.version !== '5.0.0') {
    throw new Error('TUF_CLIENT_VERSION_INVALID');
  }
  const module = await import(pathToFileURL(entryPath).href);
  if (typeof module.initTUF !== 'function') {
    throw new Error('TUF_CLIENT_API_INVALID');
  }
  return { initTUF: module.initTUF, packageManifest, packageText };
}

async function postEntry(endpointUrl, request) {
  const response = await fetch(endpointUrl, {
    body: JSON.stringify(request),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok || text.length < 1 || text.length > 262_144) {
    throw new Error('REKOR_PUBLICATION_FAILED');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('REKOR_RESPONSE_INVALID');
  }
}

export async function runP2RekorLiveAudit(runID, mode, authorization) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(runID)) {
    throw new Error('RUN_ID_INVALID');
  }
  if (!['trust-only', 'publish'].includes(mode)) {
    throw new Error('MODE_INVALID');
  }
  if (mode === 'publish' && authorization !== authorizationPhrase) {
    throw new Error('PUBLICATION_NOT_AUTHORIZED');
  }
  const now = new Date();
  const cachePath = join(tmpdir(), `dosai-rekor-tuf-${runID}`);
  const report = {
    schema,
    formal_acceptance_report: false,
    engineering_result: 'ERROR',
    completion_status: 'ERROR',
    run_id: runID,
    mode,
    publication_performed: false,
    assertions: [],
    limitations: [
      'SYNTHETIC_SOFTWARE_CHECKPOINT_ONLY',
      'NO_TRUSTED_INTEGRATED_TIME',
      'NO_INDEPENDENT_LOG_MONITOR_OR_WITNESS',
      'NO_PRODUCT_RUNTIME_AUTHORITY',
    ],
  };

  try {
    const [subject, worktree, tufManifestText, tufLockText] = await Promise.all([
      gitOutput(['rev-parse', 'HEAD']),
      gitOutput(['status', '--porcelain', '--untracked-files=all']),
      readFile(join(tufToolRoot, 'package.json'), 'utf8'),
      readFile(join(tufToolRoot, 'package-lock.json'), 'utf8'),
    ]);
    report.subject_commit = subject;
    record(report, 'P2-REKOR-LIVE-CLEAN-SUBJECT', worktree === '' ? 'PASS' : 'FAIL');
    if (worktree !== '') {
      throw new Error('SUBJECT_NOT_CLEAN');
    }
    const tufManifest = JSON.parse(tufManifestText);
    const tufLock = JSON.parse(tufLockText);
    const lockedTuf = tufLock.packages?.['node_modules/@sigstore/tuf'];
    const tufClient = await loadTufClient();
    report.tuf_client = {
      dependency_integrity: lockedTuf?.integrity,
      dependency_lock_sha256: sha256(tufLockText),
      manifest_sha256: sha256(tufManifestText),
      name: tufClient.packageManifest.name,
      version: tufClient.packageManifest.version,
    };
    record(report, 'P2-REKOR-LIVE-OFFICIAL-TUF-CLIENT',
      tufManifest.dependencies?.['@sigstore/tuf'] === '5.0.0' &&
      lockedTuf?.version === '5.0.0' &&
      typeof lockedTuf?.integrity === 'string' &&
      tufClient.packageManifest.name === '@sigstore/tuf' &&
      tufClient.packageManifest.version === '5.0.0'
        ? 'PASS'
        : 'FAIL');

    await rm(cachePath, { force: true, recursive: true });
    const verified = await verifiedTufMaterial(cachePath, now, tufClient.initTUF);
    report.tuf = {
      metadata: verified.metadata,
      metadata_documents: Object.fromEntries(Object.entries(verified.metadataTexts).map(
        ([name, text]) => [name, JSON.parse(text)],
      )),
      mirror_url: mirrorUrl,
      targets: {
        signing_config_raw_base64: Buffer.from(verified.signingConfigJson, 'utf8').toString('base64'),
        signing_config_sha256: sha256(verified.signingConfigJson),
        signing_config_v0_2: JSON.parse(verified.signingConfigJson),
        trusted_root: JSON.parse(verified.trustedRootJson),
        trusted_root_raw_base64: Buffer.from(verified.trustedRootJson, 'utf8').toString('base64'),
        trusted_root_sha256: sha256(verified.trustedRootJson),
      },
    };
    record(report, 'P2-REKOR-LIVE-TUF-REFRESH', 'PASS');
    record(report, 'P2-REKOR-LIVE-TUF-METADATA-CURRENT',
      Object.values(verified.metadata).every(({ unexpired_at_audit }) => unexpired_at_audit)
        ? 'PASS'
        : 'FAIL');

    let resolved;
    try {
      resolved = resolveRekorV2Trust({
        now,
        signingConfigJson: verified.signingConfigJson,
        trustedRootJson: verified.trustedRootJson,
      });
    } catch (error) {
      if (
        error instanceof RekorTufFailure &&
        error.code === 'DOSAI_REKOR_TUF_SERVICE_0001'
      ) {
        record(report, 'P2-REKOR-LIVE-TUF-AUTHORIZED-V2-SERVICE', 'BLOCKED');
        report.engineering_result = 'PASS_FAIL_CLOSED';
        report.completion_status = 'BLOCKED_EXTERNAL_TUF_NO_REKOR_V2_SERVICE';
        report.failure_code = error.code;
        return report;
      }
      throw error;
    }

    report.resolved = resolved;
    record(report, 'P2-REKOR-LIVE-TUF-AUTHORIZED-V2-SERVICE', 'PASS');
    record(report, 'P2-REKOR-LIVE-TUF-TRUST-MATERIAL', 'PASS');
    if (mode === 'trust-only') {
      report.engineering_result = 'PASS';
      report.completion_status = 'READY_FOR_OWNER_AUTHORIZED_PUBLICATION';
      return report;
    }

    const { checkpoint } = await checkpointFixture({
      checkpoint_id: runID,
      created_at: now.toISOString(),
    });
    const request = buildRekorV2CreateEntry(checkpoint);
    const requestText = JSON.stringify(request);
    record(report, 'P2-REKOR-LIVE-MINIMAL-PUBLIC-BODY',
      !['journal_id', 'journal_epoch_id', 'event_hash', 'payload', 'secret', 'token']
        .some((prohibited) => requestText.includes(prohibited))
        ? 'PASS'
        : 'FAIL');
    const response = await postEntry(resolved.endpointUrl, request);
    report.publication_performed = true;
    const receipt = verifyRekorV2CreateEntryResponse({
      checkpoint,
      producerGeneration: '1',
      response,
      trust: resolved.trust,
    });
    verifyStoredRekorV2Receipt(checkpoint, receipt, resolved.trust);
    report.proof_bundle = { checkpoint, receipt, response };
    record(report, 'P2-REKOR-LIVE-PUBLICATION', 'PASS');
    record(report, 'P2-REKOR-LIVE-INDEPENDENT-OFFLINE-VERIFICATION', 'PASS');
    report.engineering_result = 'PASS';
    report.completion_status = 'PUBLIC_SYNTHETIC_PROOF_VERIFIED';
    return report;
  } catch (error) {
    report.failure_code = /^[A-Z][A-Z0-9_]{2,63}$/.test(error?.message)
      ? error.message
      : 'UNEXPECTED_LIVE_AUDIT_ERROR';
    report.engineering_result = 'FAIL';
    report.completion_status = 'FAILED';
    return report;
  } finally {
    await rm(cachePath, { force: true, recursive: true });
  }
}

if (import.meta.main) {
  const { authorization, mode, runID } = argumentsFrom(process.argv.slice(2));
  const report = await runP2RekorLiveAudit(runID, mode, authorization);
  const serialized = JSON.stringify(report);
  report.secret_scan = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
  ].every((pattern) => !pattern.test(serialized)) ? 'PASS' : 'FAIL';
  if (report.secret_scan !== 'PASS') {
    report.engineering_result = 'ERROR';
    report.completion_status = 'FAILED';
    report.failure_code = 'SECRET_SCAN_FAILED';
  }
  const evidencePath = join(evidenceRoot, `p2-rekor-live-${mode}-${runID}.json`);
  await writeEvidence(evidencePath, report);
  const evidenceBytes = await readFile(evidencePath);
  console.log(JSON.stringify({
    completion_status: report.completion_status,
    engineering_result: report.engineering_result,
    evidence_path: join('evidence', basename(evidencePath)),
    evidence_sha256: sha256(evidenceBytes),
    publication_performed: report.publication_performed,
    run_id: runID,
    secret_scan: report.secret_scan,
    subject_commit: report.subject_commit,
  }, null, 2));
  process.exitCode = ['PASS', 'PASS_FAIL_CLOSED'].includes(report.engineering_result) ? 0 : 1;
}
