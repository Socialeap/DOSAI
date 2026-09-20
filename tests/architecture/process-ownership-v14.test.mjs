import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v13Path = resolve(root, 'docs/architecture/process-ownership-v13.json');
const v14Path = resolve(root, 'docs/architecture/process-ownership-v14.json');
const v13Bytes = await readFile(v13Path);
const v13 = JSON.parse(v13Bytes);
const v14 = JSON.parse(await readFile(v14Path, 'utf8'));
const v19 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v19.json'), 'utf8'),
);

test('accepted process ownership v14 is hash-bound to immutable accepted v13', () => {
  const digest = createHash('sha256').update(v13Bytes).digest('hex');
  assert.equal(digest, '8e8f805c644d5cdf4ebc7a068e399fa6070ca08d7c2f9108f78d551b0406fa08');
  assert.equal(v13.status, 'ACCEPTED');
  assert.equal(v14.schema_version, 14);
  assert.equal(v14.status, 'ACCEPTED');
  assert.deepEqual(v14.supersedes, {
    path: 'docs/architecture/process-ownership-v13.json',
    sha256: digest,
  });
  assert.deepEqual(v14.accepted_adrs, v13.accepted_adrs);
});

test('v14 changes only execution-service authentication evidence and invariants', () => {
  assert.deepEqual(v14.source_boundaries, v13.source_boundaries);
  assert.deepEqual(
    v14.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v13.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );

  const before = v13.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v14.native_helpers.find(({ id }) => id === 'execution-service');
  const evidenceFields = new Set([
    'runtime',
    'implementation_state',
    'authenticated_peer_observed',
    'authenticated_peer_team_identifier',
    'authenticated_peer_fixture_identifier',
    'requirement_configured_on_both_connections_observed',
    'disconnect_reduction_observed',
    'synthetic_trust_installed',
  ]);
  const withoutEvidence = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !evidenceFields.has(key)),
  );
  assert.deepEqual(withoutEvidence(after), withoutEvidence(before));
});

test('v14 records exact authenticated-peer and disconnect-reduction observations', () => {
  const service = v14.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.runtime, 'SWIFT_INERT_ANONYMOUS_XPC_TRANSPORT_FIXTURE_AUTHENTICATED');
  assert.equal(service.implementation_state, 'ACTIVE_TEST_FIXTURE_AUTHENTICATED');
  assert.equal(service.owner_authorized_signing_identity_selector, true);
  assert.equal(service.owner_authorized_peer_requirement_team_identifier, true);
  assert.equal(service.authenticated_peer_observed, true);
  assert.equal(service.authenticated_peer_team_identifier, '3RD3TADLRY');
  assert.equal(
    service.authenticated_peer_fixture_identifier,
    'com.socialeap.dosai.watchdog-xpc-fixture',
  );
  assert.equal(service.requirement_configured_on_both_connections_observed, true);
  assert.equal(service.disconnect_reduction_observed, true);
  assert.equal(service.synthetic_trust_installed, false);
});

test('v14 preserves implementation preimages and every authority denial', async () => {
  const service = v14.native_helpers.find(({ id }) => id === 'execution-service');
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
    'keychain_mutation_authority',
    'signing_identity_export_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('v14 adds no schema generation or service registration artifact', async () => {
  for (const path of [
    'docs/architecture/schema-registry-v19.json',
    'native-helpers/execution-service/LaunchAgent.plist',
  ]) {
    await assert.rejects(access(resolve(root, path)));
  }
});
