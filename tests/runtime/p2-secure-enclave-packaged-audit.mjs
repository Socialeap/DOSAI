import { listPackage } from '@electron/asar';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  describeSecureEnclaveProofHelper,
  secureEnclaveProofHelperName,
} from '../../scripts/secure-enclave-helper.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const appBundle = join(root, 'out/DOSAI-darwin-arm64/DOSAI.app');
const asarPath = join(appBundle, 'Contents/Resources/app.asar');
const helperPath = join(appBundle, 'Contents/Resources', secureEnclaveProofHelperName);

function record(report, id, condition, measurement) {
  const assertion = { id, result: condition ? 'PASS' : 'FAIL' };
  if (measurement !== undefined) {
    assertion.measurement = measurement;
  }
  report.assertions.push(assertion);
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function rejectUnauthorizedLifecycle() {
  try {
    await execFileAsync(
      helperPath,
      ['exercise-test-lifecycle', '00000000-0000-0000-0000-000000000001', 'NOT_AUTHORIZED'],
      {
        encoding: 'utf8',
        env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
        maxBuffer: 64 * 1024,
        timeout: 5_000,
      },
    );
  } catch (error) {
    return {
      exitCode: error.code,
      response: JSON.parse(error.stdout),
      stderr: error.stderr,
    };
  }
  throw new Error('UNAUTHORIZED_LIFECYCLE_ACCEPTED');
}

export async function runP2SecureEnclavePackagedAudit() {
  const report = {
    schema: 'DOSAI_P2_SECURE_ENCLAVE_PACKAGED_AUDIT_V1',
    formal_acceptance_report: false,
    engineering_result: 'ERROR',
    mutation_performed: false,
    assertions: [],
    limitations: [
      'SECURE_ENCLAVE_KEY_LIFECYCLE_NOT_EXECUTED',
      'HELPER_SIGNATURE_AD_HOC_ONLY',
      'HARDENED_RUNTIME_AND_NOTARIZATION_NOT_PROVEN',
      'PRODUCTION_CHECKPOINT_SIGNING_NOT_IMPLEMENTED',
      'REMOTE_HARDWARE_ATTESTATION_UNAVAILABLE',
    ],
  };

  try {
    const [helperStats, helperBytes, description] = await Promise.all([
      stat(helperPath),
      readFile(helperPath),
      describeSecureEnclaveProofHelper(helperPath),
    ]);
    record(report, 'P2-SECURE-HELPER-PACKAGED-FILE', helperStats.isFile());
    record(report, 'P2-SECURE-HELPER-EXECUTABLE', (helperStats.mode & 0o111) !== 0);
    record(
      report,
      'P2-SECURE-HELPER-MACHO64',
      helperBytes.subarray(0, 4).toString('hex') === 'cffaedfe',
    );
    record(report, 'P2-SECURE-HELPER-READ-ONLY-DESCRIBE',
      description.ok === true &&
      description.result?.mutation_performed === false &&
      description.result?.production_checkpoint_signing === false &&
      description.result?.network_authority === false,
    );
    record(
      report,
      'P2-SECURE-HELPER-OPERATIONS-EXACT',
      JSON.stringify(description.result?.operations) ===
        JSON.stringify(['describe', 'exercise-test-lifecycle', 'cleanup-test-key']),
    );

    const packagedFiles = listPackage(asarPath, { isPack: false });
    record(
      report,
      'P2-SECURE-HELPER-OUTSIDE-ASAR',
      !packagedFiles.some((path) => path.includes(secureEnclaveProofHelperName)),
    );

    const [{ stdout: architectures }, { stdout: build }, { stdout: symbols }] = await Promise.all([
      execFileAsync('/usr/bin/lipo', ['-archs', helperPath], { encoding: 'utf8' }),
      execFileAsync('/usr/bin/xcrun', ['vtool', '-show-build', helperPath], { encoding: 'utf8' }),
      execFileAsync('/usr/bin/nm', ['-u', '-j', helperPath], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }),
      execFileAsync('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', helperPath], {
        encoding: 'utf8',
      }),
    ]);
    record(report, 'P2-SECURE-HELPER-ARCHITECTURE', architectures.trim() === 'arm64');
    record(report, 'P2-SECURE-HELPER-MINIMUM-MACOS', /minos 15\.0/.test(build));
    record(
      report,
      'P2-SECURE-HELPER-SECURITY-SYMBOLS',
      symbols.includes('_SecKeyCreateRandomKey') &&
        symbols.includes('_SecKeyCreateSignature') &&
        symbols.includes('_SecItemDelete'),
    );
    record(
      report,
      'P2-SECURE-HELPER-NO-NETWORK-SYMBOLS',
      !/\b_(?:connect|socket|getaddrinfo|URLSession)\b/.test(symbols),
    );
    record(report, 'P2-SECURE-HELPER-CODE-SIGNATURE-VALID', true);

    const rejected = await rejectUnauthorizedLifecycle();
    record(
      report,
      'P2-SECURE-HELPER-UNAUTHORIZED-LIFECYCLE-REJECTED',
      rejected.exitCode === 77 &&
        rejected.stderr === '' &&
        rejected.response?.error?.code === 'DOSAI_SECURE_ENCLAVE_AUTHORIZATION_0001',
    );

    report.artifacts = {
      app_asar_sha256: await sha256(asarPath),
      helper_sha256: await sha256(helperPath),
    };
    report.engineering_result = report.assertions.every(({ result }) => result === 'PASS')
      ? 'PASS'
      : 'FAIL';
  } catch (error) {
    report.failure_code = /^[A-Z][A-Z0-9_]{2,63}$/.test(error?.message)
      ? error.message
      : 'UNEXPECTED_PACKAGED_AUDIT_ERROR';
  }

  const serialized = JSON.stringify(report);
  const secretPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
  ];
  report.secret_scan = secretPatterns.every((pattern) => !pattern.test(serialized))
    ? 'PASS'
    : 'FAIL';
  if (report.secret_scan !== 'PASS') {
    report.engineering_result = 'ERROR';
    report.failure_code = 'SECRET_SCAN_FAILED';
  }
  return report;
}

if (import.meta.main) {
  const report = await runP2SecureEnclavePackagedAudit();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.engineering_result === 'PASS' ? 0 : 1;
}
