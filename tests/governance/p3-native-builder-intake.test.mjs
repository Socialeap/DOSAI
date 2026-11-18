import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { screenNativeBuilderIntake } from '../../scripts/screen-p3-native-builder-intake.mjs';
import { assessPrivateBetaReadiness } from '../../scripts/report-private-beta-readiness.mjs';
import { verifyP3NativeBuilderHostObservations } from '../../scripts/verify-p3-native-builder-host-observation.mjs';

const template = new URL('../../docs/proposals/p3-native-builder-intake-template-v1.json', import.meta.url);
const entry = fileURLToPath(new URL('../../scripts/screen-p3-native-builder-intake.mjs', import.meta.url));
const worksheet = JSON.parse(readFileSync(template, 'utf8'));
const encode = value => Buffer.from(JSON.stringify(value));
const screen = value => screenNativeBuilderIntake(encode(value));

function documentedWorksheet() {
  const result = structuredClone(worksheet);
  for (const section of [result.pair, result.hosts.host_a, result.hosts.host_b]) {
    for (const key of Object.keys(section)) section[key] = 'DOCUMENTED';
  }
  return result;
}

test('a blank native-builder intake worksheet identifies both hosts and all missing documentation', () => {
  const result = screen(worksheet);
  assert.equal(result.status, 'DOCUMENTATION_INCOMPLETE');
  assert.equal(result.missing.length, 24);
  assert.ok(result.missing.includes('pair.existing_availability_and_zero_incremental_cost'));
  assert.ok(result.missing.includes('host_a.single_full_root_binfmt_misc_mount'));
  assert.ok(result.missing.includes('host_b.full_interval_writer_exclusion'));
  assert.deepEqual(result.contradicted, []);
  assert.equal(result.qualifyingBuilderReceiptsAdded, 0);
  assert.equal(result.qualificationAuthorized, false);
});

test('documentary completeness permits source review only', () => {
  assert.deepEqual(screen(documentedWorksheet()), {
    status: 'FOR_SOURCE_REVIEW',
    missing: [],
    contradicted: [],
    qualifyingBuilderReceiptsAdded: 0,
    qualificationAuthorized: false,
  });
});

test('a documented worksheet cannot pass host observation or clear the private-beta gates', async () => {
  const candidate = documentedWorksheet();
  const screening = screen(candidate);
  assert.equal(screening.status, 'FOR_SOURCE_REVIEW');

  const syntheticSourceSha = 'a'.repeat(40);
  for (const records of [[candidate.hosts.host_a, candidate.hosts.host_b], [screening, screening]]) {
    assert.throws(
      () => verifyP3NativeBuilderHostObservations(records, syntheticSourceSha),
      /P3_HOST_OBSERVATION_REJECTED/,
    );
  }

  const readiness = await assessPrivateBetaReadiness();
  assert.equal(readiness.ready, false);
  assert.equal(readiness.release_status, 'NO_GO');
  assert.deepEqual(readiness.blockers.map(({ id }) => id), ['BETA-CP-004', 'BETA-CP-005', 'BETA-CP-006']);
  assert.equal(
    readiness.blockers.find(({ id }) => id === 'BETA-CP-004').evidence,
    'QUALIFYING_INDEPENDENT_NATIVE_AMD64_BUILDER_RECEIPTS_IN_REPOSITORY_0_OF_2',
  );
});

test('stacked mounts and missing writer exclusion or independence stop candidate intake', () => {
  const candidate = documentedWorksheet();
  candidate.hosts.host_a.single_full_root_binfmt_misc_mount = 'CONTRADICTED';
  candidate.hosts.host_b.single_full_root_binfmt_misc_mount = 'CONTRADICTED';
  candidate.hosts.host_b.full_interval_writer_exclusion = 'UNKNOWN';
  candidate.pair.distinct_hosts = 'UNKNOWN';
  const result = screen(candidate);
  assert.equal(result.status, 'DOCUMENTATION_CONTRADICTED');
  assert.deepEqual(result.contradicted, [
    'host_a.single_full_root_binfmt_misc_mount',
    'host_b.single_full_root_binfmt_misc_mount',
  ]);
  assert.deepEqual(result.missing, ['pair.distinct_hosts', 'host_b.full_interval_writer_exclusion']);
  assert.equal(result.qualifyingBuilderReceiptsAdded, 0);
  assert.equal(result.qualificationAuthorized, false);
});

test('the worksheet rejects missing or fabricated fields, malformed JSON, and oversized input', () => {
  const missingHost = documentedWorksheet();
  delete missingHost.hosts.host_b;

  const missingField = documentedWorksheet();
  delete missingField.hosts.host_b.independent_issuer;

  const bogusState = documentedWorksheet();
  bogusState.hosts.host_a.fresh_native_linux_x86_64 = 'ACCEPTED';

  const extra = documentedWorksheet();
  extra.pair.ownerApproved = true;

  for (const input of [
    encode(missingHost), encode(missingField), encode(bogusState), encode(extra),
    Buffer.from(JSON.stringify(worksheet).replace('"version":1', '"version":1,"version":1')),
    Buffer.from('not json'), Buffer.alloc(4097, 0x20),
  ]) {
    assert.throws(() => screenNativeBuilderIntake(input), /DOSAI_NATIVE_BUILDER_INTAKE_REJECTED/);
  }
});

test('the standalone checker exits without qualification and never echoes malformed input', () => {
  const completed = spawnSync(process.execPath, [entry], {
    input: encode(documentedWorksheet()), encoding: 'utf8', timeout: 5_000,
  });
  assert.ifError(completed.error);
  assert.equal(completed.status, 2, completed.stderr);
  assert.equal(JSON.parse(completed.stdout).status, 'FOR_SOURCE_REVIEW');
  assert.equal(completed.stderr, '');

  const rejected = spawnSync(process.execPath, [entry], {
    input: 'UNTRUSTED_INPUT_DO_NOT_ECHO', encoding: 'utf8', timeout: 5_000,
  });
  assert.ifError(rejected.error);
  assert.equal(rejected.status, 1);
  assert.equal(rejected.stdout, '');
  assert.equal(rejected.stderr, 'DOSAI_NATIVE_BUILDER_INTAKE_REJECTED\n');
});
