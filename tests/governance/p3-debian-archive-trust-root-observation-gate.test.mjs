import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/p3-debian-archive-trust-root-observation-gate.json';
const expectedAuthorities = Object.freeze({
  network_retrieval: false,
  keyring_download: false,
  keyring_import: false,
  signature_verification: false,
  snapshot_metadata_retrieval: false,
  package_index_retrieval: false,
  package_download: false,
  package_resolution: false,
  image_preparation: false,
  guest_compilation: false,
  guest_execution: false,
  vm_operation: false,
  production_use: false,
});

async function loadRecord() {
  return JSON.parse(await readFile(resolve(root, recordPath), 'utf8'));
}

async function hashFile(path) {
  return createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
}

function assertProposedGate(record) {
  assert.equal(record.record_type, 'P3_DEBIAN_ARCHIVE_TRUST_ROOT_OBSERVATION_GATE');
  assert.equal(record.record_version, 1);
  assert.equal(record.status, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.equal(record.scope, 'TRUST_ROOT_OBSERVATION_PREPARATION_ONLY');
  assert.deepEqual(record.trust_boundary, {
    candidate_keyring_source: 'UNSELECTED',
    independent_fingerprint_reference: 'UNSELECTED',
    host_trust_store_accepted: false,
    snapshot_metadata_self_trusted: false,
    package_manager_trusted: false,
    key_import_allowed: false,
  });
  assert.deepEqual(record.authorities, expectedAuthorities);
  assert.deepEqual(record.required_future_observation, [
    'OWNER_SELECTS_EXACT_PUBLIC_KEYRING_SOURCE',
    'OWNER_SELECTS_INDEPENDENT_FINGERPRINT_REFERENCE',
    'RETRIEVE_ONLY_THE_SELECTED_PUBLIC_KEY_MATERIAL_TO_IGNORED_TEMPORARY_STORAGE',
    'RECORD_KEYRING_DIGEST_SIZE_AND_OPENPGP_FINGERPRINTS',
    'COMPARE_EACH_FINGERPRINT_WITH_THE_INDEPENDENT_REFERENCE',
    'DELETE_TEMPORARY_BYTES_ON_SUCCESS_OR_FAILURE',
  ]);
  assert.equal(
    record.follow_on_gate,
    'SEPARATE_OWNER_AUTHORIZATION_REQUIRED_BEFORE_ANY_PUBLIC_KEY_MATERIAL_OBSERVATION',
  );
}

test('trust-root observation proposal binds the accepted v16/v2 declaration and exposes no effect', async () => {
  const record = await loadRecord();
  assertProposedGate(record);
  assert.equal(record.preconditions.length, 1);
  const [precondition] = record.preconditions;
  assert.equal(await hashFile(precondition.path), precondition.sha256, precondition.path);
});

test('trust-root observation proposal rejects trust shortcuts and authority expansion', async () => {
  const record = await loadRecord();
  for (const property of [
    'host_trust_store_accepted',
    'snapshot_metadata_self_trusted',
    'package_manager_trusted',
    'key_import_allowed',
  ]) {
    const shortcut = structuredClone(record);
    shortcut.trust_boundary[property] = true;
    assert.throws(() => assertProposedGate(shortcut), assert.AssertionError, property);
  }
  for (const authority of Object.keys(expectedAuthorities)) {
    const expanded = structuredClone(record);
    expanded.authorities[authority] = true;
    assert.throws(() => assertProposedGate(expanded), assert.AssertionError, authority);
  }
});

test('trust-root observation proposal rejects a changed accepted-declaration digest', async () => {
  const record = await loadRecord();
  record.preconditions[0].sha256 = '0'.repeat(64);
  await assert.rejects(
    () => hashFile(record.preconditions[0].path).then((hash) => {
      assert.equal(hash, record.preconditions[0].sha256);
    }),
    assert.AssertionError,
  );
});
