import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  parseP3NativeBuilderHostObservationLines,
  verifyP3NativeBuilderHostObservations,
} from '../../scripts/verify-p3-native-builder-host-observation.mjs';
import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const expectedSha = '2b7ec58d3c1f610f1ab1424604fe9b775318b38f';

function observation(job, uuid, overrides = {}) {
  return {
    schema: 'DOSAI_P3_HOST_OBSERVATION_V1',
    run_id: '123456789',
    run_attempt: '1',
    job,
    sha: expectedSha,
    runner_environment: 'github-hosted',
    runner_os: 'Linux',
    runner_arch: 'X64',
    uname_machine: 'x86_64',
    image_os: 'ubuntu24',
    image_version: '20260915.1.0',
    kernel_release: '6.11.0-1018-azure',
    dmi_product_uuid: uuid,
    docker_server_arch: 'amd64',
    no_active_binfmt_misc_interpreters: true,
    ...overrides,
  };
}

const hostA = () => observation('builder_host_a', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
const hostB = () => observation('builder_host_b', 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB');

test('offline verifier accepts exactly two distinct native x64 candidate hosts', () => {
  const receipt = verifyP3NativeBuilderHostObservations([hostA(), hostB()], expectedSha);
  assert.equal(receipt.status, 'PASS_CANDIDATE_HOSTS_ONLY');
  assert.equal(receipt.candidate_host_count, 2);
  assert.equal(receipt.distinct_dmi_identities, true);
  assert.equal(receipt.physical_linux_builder_verified, false);
  assert.equal(receipt.builder_receipts_produced, 0);
  assert.equal(receipt.provider_charge_usd, 0);
  assert.equal(receipt.hosts.length, 2);
  assert.ok(receipt.hosts.every(host => /^[0-9a-f]{64}$/u.test(host.dmi_identity_sha256)));
  assert.equal(JSON.stringify(receipt).includes('AAAAAAAA-AAAA'), false);
  assert.equal(JSON.stringify(receipt).includes('BBBBBBBB-BBBB'), false);
});

test('parser requires exactly two strict prefixed JSON lines', () => {
  const bytes = new TextEncoder().encode([
    `DOSAI_HOST_OBSERVATION_V1:${JSON.stringify(hostA())}`,
    `DOSAI_HOST_OBSERVATION_V1:${JSON.stringify(hostB())}`,
    '',
  ].join('\n'));
  const parsed = parseP3NativeBuilderHostObservationLines(bytes);
  assert.equal(parsed.length, 2);
  assert.throws(
    () => parseP3NativeBuilderHostObservationLines(new TextEncoder().encode('{}\n')),
    /P3_HOST_OBSERVATION_REJECTED/,
  );
  assert.throws(
    () => parseP3NativeBuilderHostObservationLines(new Uint8Array(16_385)),
    /P3_HOST_OBSERVATION_REJECTED/,
  );
});

test('identity, provenance, architecture, emulation, and shape drift fail closed', () => {
  const mutations = [
    [hostA(), hostA()],
    [hostA(), observation('builder_host_b', hostA().dmi_product_uuid)],
    [hostA(), hostB(), hostB()],
    [hostA(), observation('builder_host_b', hostB().dmi_product_uuid, { sha: '0'.repeat(40) })],
    [hostA(), observation('builder_host_b', hostB().dmi_product_uuid, { runner_arch: 'ARM64' })],
    [hostA(), observation('builder_host_b', hostB().dmi_product_uuid, { docker_server_arch: 'arm64' })],
    [hostA(), observation('builder_host_b', hostB().dmi_product_uuid, { no_active_binfmt_misc_interpreters: false })],
    [hostA(), observation('builder_host_b', hostB().dmi_product_uuid, { image_version: 'different' })],
    [hostA(), { ...hostB(), unexpected: true }],
  ];
  for (const values of mutations) {
    assert.throws(
      () => verifyP3NativeBuilderHostObservations(values, expectedSha),
      /P3_HOST_OBSERVATION_REJECTED/,
    );
  }
});

test('hostile accessors and proxy traps are rejected without invoking accessors', () => {
  let getterCalls = 0;
  const hostile = hostA();
  Object.defineProperty(hostile, 'run_id', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return '123456789';
    },
  });
  assert.throws(
    () => verifyP3NativeBuilderHostObservations([hostile, hostB()], expectedSha),
    /P3_HOST_OBSERVATION_REJECTED/,
  );
  assert.equal(getterCalls, 0);
  assert.throws(
    () => verifyP3NativeBuilderHostObservations([
      new Proxy(hostA(), { ownKeys: () => { throw new Error('trap'); } }),
      hostB(),
    ], expectedSha),
    /P3_HOST_OBSERVATION_REJECTED/,
  );
});

test('verifier source is offline, read-only, and governed as candidate-only', async () => {
  const source = await readFile(resolve(root, 'scripts/verify-p3-native-builder-host-observation.mjs'), 'utf8');
  for (const forbidden of ['node:child_process', 'node:fs', 'node:http', 'node:https', 'node:net', 'fetch(']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  const record = parseStrictJson(await readFile(resolve(
    root,
    'docs/architecture/p3-native-builder-host-observation-verifier-source-record.json',
  )));
  assert.equal(record.status, 'IMPLEMENTED_SOURCE_ONLY_NOT_EXECUTED');
  assert.ok(Object.values(record.authorities).every(value => value === false));
});
