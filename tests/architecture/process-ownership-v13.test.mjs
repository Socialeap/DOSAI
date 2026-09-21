import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v12Path = resolve(root, 'docs/architecture/process-ownership-v12.json');
const v13Path = resolve(root, 'docs/architecture/process-ownership-v13.json');
const v12Bytes = await readFile(v12Path);
const v12 = JSON.parse(v12Bytes);
const v13 = JSON.parse(await readFile(v13Path, 'utf8'));
const v19 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v19.json'), 'utf8'),
);

test('accepted process ownership v13 is hash-bound to immutable accepted v12', () => {
  const digest = createHash('sha256').update(v12Bytes).digest('hex');
  assert.equal(digest, '908846c04150e1288a502966b48b7f24e651983685ef386f1a60604f4259fd76');
  assert.equal(v12.status, 'ACCEPTED');
  assert.equal(v13.schema_version, 13);
  assert.equal(v13.status, 'ACCEPTED');
  assert.deepEqual(v13.supersedes, {
    path: 'docs/architecture/process-ownership-v12.json',
    sha256: digest,
  });
  assert.deepEqual(v13.accepted_adrs, v12.accepted_adrs);
});

test('v13 changes only execution-service identity evidence and invariants', () => {
  assert.deepEqual(v13.source_boundaries, v12.source_boundaries);
  assert.deepEqual(
    v13.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v12.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );

  const before = v12.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v13.native_helpers.find(({ id }) => id === 'execution-service');
  const identityFields = new Set([
    'valid_signing_identity_reported_installed',
    'valid_signing_identity_installed',
    'valid_signing_identity_observation',
    'reported_signing_team_id',
    'owner_authorized_signing_identity_available',
    'authorized_signing_identity_selector',
    'signing_certificate_common_name_suffix',
    'observed_code_signing_team_identifier',
    'owner_authorized_signing_identity_selector',
    'owner_authorized_peer_requirement_team_identifier',
    'signed_peer_rejection_observed',
    'signed_peer_rejection_reason',
  ]);
  const withoutIdentity = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !identityFields.has(key)),
  );
  assert.deepEqual(withoutIdentity(after), withoutIdentity(before));
});

test('v13 distinguishes the authorized identity selector from the observed TeamIdentifier', () => {
  const service = v13.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.valid_signing_identity_installed, true);
  assert.equal(service.valid_signing_identity_observation, 'LOCAL_UNSANDBOXED_KEYCHAIN_VERIFIED');
  assert.equal(service.authorized_signing_identity_selector, 'UMXN25Z493');
  assert.equal(service.signing_certificate_common_name_suffix, 'UMXN25Z493');
  assert.equal(service.observed_code_signing_team_identifier, '3RD3TADLRY');
  assert.equal(service.owner_authorized_signing_identity_selector, true);
  assert.equal(service.owner_authorized_peer_requirement_team_identifier, true);
  assert.equal(service.authenticated_peer_observed, false);
  assert.equal(service.signed_peer_rejection_observed, true);
  assert.equal(service.signed_peer_rejection_reason, 'AUTHORIZED_SELECTOR_TEAM_MISMATCH');
  assert.notEqual(
    service.authorized_signing_identity_selector,
    service.observed_code_signing_team_identifier,
  );
});

test('v13 preserves implementation preimages and every authority denial', async () => {
  const service = v13.native_helpers.find(({ id }) => id === 'execution-service');
  const successor = v19.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(v19.status, 'ACCEPTED');
  for (const file of [
    ...service.accepted_implementation_files,
    ...service.proposed_implementation_files,
  ]) {
    const digest = createHash('sha256').update(await readFile(resolve(root, file.path))).digest('hex');
    if (file.path === successor.named_listener_transport_refactor_baseline.path) {
      assert.deepEqual(successor.named_listener_transport_refactor_baseline, file);
      assert.notEqual(digest, file.sha256, file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }
  for (const field of [
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'mach_service_listener_authority',
    'generic_payload_authority',
    'pid_targeting_authority',
    'ownership_release_authority',
    'reconciliation_authority',
    'journal_authority',
    'vm_creation_authority',
    'vm_start_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('v13 adds no schema generation or service registration artifact', async () => {
  for (const path of [
    'docs/architecture/schema-registry-v19.json',
    'native-helpers/execution-service/LaunchAgent.plist',
  ]) {
    await assert.rejects(access(resolve(root, path)));
  }
});
