import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  buildSecureEnclaveProofHelper,
  describeSecureEnclaveProofHelper,
  secureEnclaveProofHelperName,
} from '../../scripts/secure-enclave-helper.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const sourcePath = join(root, 'native-helpers/secure-enclave-proof/main.swift');
const liveAuditPath = join(root, 'tests/runtime/p2-secure-enclave-live-audit.mjs');

async function rejectedInvocation(executable, arguments_) {
  try {
    await execFileAsync(executable, arguments_, {
      encoding: 'utf8',
      env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
      maxBuffer: 64 * 1024,
      timeout: 5_000,
    });
  } catch (error) {
    return {
      exitCode: error.code,
      response: JSON.parse(error.stdout),
      stderr: error.stderr,
    };
  }
  assert.fail(`Expected invocation to fail: ${arguments_.join(' ')}`);
}

test('proof helper source exposes no arbitrary signing, input, network, or production operation', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.doesNotMatch(source, /standardInput|readToEnd|URLSession|CFNetwork|NWConnection|socket\s*\(/);
  assert.doesNotMatch(source, /sign-message|sign-digest|production-checkpoint|SecItemUpdate/);
  assert.match(source, /DOSAI-SECURE-ENCLAVE-LIFECYCLE-PROOF-V1/);
  assert.match(source, /UNIQUE_TRANSIENT_TEST_TAG_ONLY/);
  assert.match(source, /DOSAI_OWNER_AUTHORIZED_LOCAL_SECURE_ENCLAVE_PROOF_V1/);
  assert.match(source, /SecItemDelete/);
  assert.match(source, /guard try !testKeyExists\(tag: tag\)/);
  assert.match(source, /cleanup-test-key/);
  assert.match(source, /signature_der_base64/);
});

test('live audit has one exact proof command, independent verification, and mandatory cleanup', async () => {
  const source = await readFile(liveAuditPath, 'utf8');
  assert.match(source, /exercise-test-lifecycle/);
  assert.match(source, /createPublicKey/);
  assert.match(source, /verify\('sha256', challenge, publicKey, signature\)/);
  assert.match(source, /cleanup-test-key/);
  assert.match(source, /finally/);
  assert.doesNotMatch(source, /fetch\s*\(|https?:\/\//);
});

test('proof helper compiles for the minimum target and read-only protocol rejects unsafe input', {
  timeout: 120_000,
}, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'dosai-secure-enclave-helper-test-'));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  const executable = join(directory, secureEnclaveProofHelperName);
  await buildSecureEnclaveProofHelper(executable);

  const executableStats = await stat(executable);
  assert.ok(executableStats.isFile());
  assert.notEqual(executableStats.mode & 0o111, 0);
  assert.deepEqual(await describeSecureEnclaveProofHelper(executable), {
    ok: true,
    result: {
      helper_id: 'com.socialeap.dosai.secure-enclave-proof',
      key_scope: 'UNIQUE_TRANSIENT_TEST_TAG_ONLY',
      minimum_macos_version: '15.0',
      mutation_performed: false,
      network_authority: false,
      operations: ['describe', 'exercise-test-lifecycle', 'cleanup-test-key'],
      production_checkpoint_signing: false,
      protocol_version: 1,
      remote_attestation: 'UNAVAILABLE',
      stdin_consumed: false,
    },
    schema: 'DOSAI_SECURE_ENCLAVE_PROOF_HELPER_V1',
  });

  const { stdout: architectures } = await execFileAsync('/usr/bin/lipo', ['-archs', executable], {
    encoding: 'utf8',
  });
  assert.equal(architectures.trim(), 'arm64');
  const { stdout: loadCommands } = await execFileAsync('/usr/bin/otool', ['-l', executable], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  assert.match(loadCommands, /cmd LC_BUILD_VERSION[\s\S]*?platform 1[\s\S]*?minos 15\.0/);

  const cases = [
    { arguments: [], code: 'DOSAI_SECURE_ENCLAVE_PROTOCOL_0001', exitCode: 64 },
    { arguments: ['unknown'], code: 'DOSAI_SECURE_ENCLAVE_PROTOCOL_0001', exitCode: 64 },
    { arguments: ['describe', 'extra'], code: 'DOSAI_SECURE_ENCLAVE_PROTOCOL_0001', exitCode: 64 },
    {
      arguments: ['exercise-test-lifecycle', '00000000-0000-0000-0000-000000000001'],
      code: 'DOSAI_SECURE_ENCLAVE_PROTOCOL_0001',
      exitCode: 64,
    },
    {
      arguments: [
        'exercise-test-lifecycle',
        '00000000-0000-0000-0000-000000000001',
        'NOT_AUTHORIZED',
      ],
      code: 'DOSAI_SECURE_ENCLAVE_AUTHORIZATION_0001',
      exitCode: 77,
    },
    {
      arguments: ['cleanup-test-key', '00000000-0000-0000-0000-000000000001', 'NOT_AUTHORIZED'],
      code: 'DOSAI_SECURE_ENCLAVE_AUTHORIZATION_0001',
      exitCode: 77,
    },
    {
      arguments: [
        'exercise-test-lifecycle',
        'not-a-uuid',
        'DOSAI_OWNER_AUTHORIZED_LOCAL_SECURE_ENCLAVE_PROOF_V1',
      ],
      code: 'DOSAI_SECURE_ENCLAVE_PROTOCOL_0002',
      exitCode: 64,
    },
  ];
  for (const candidate of cases) {
    const rejected = await rejectedInvocation(executable, candidate.arguments);
    assert.equal(rejected.exitCode, candidate.exitCode);
    assert.equal(rejected.stderr, '');
    assert.deepEqual(rejected.response, {
      error: { code: candidate.code },
      ok: false,
      schema: 'DOSAI_SECURE_ENCLAVE_PROOF_HELPER_V1',
    });
  }
});
