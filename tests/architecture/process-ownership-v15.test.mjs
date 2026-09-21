import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v14Path = resolve(root, 'docs/architecture/process-ownership-v14.json');
const v15Path = resolve(root, 'docs/architecture/process-ownership-v15.json');
const v14Bytes = await readFile(v14Path);
const v14 = JSON.parse(v14Bytes);
const v15 = JSON.parse(await readFile(v15Path, 'utf8'));
const v28 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v28.json'), 'utf8'),
);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v15 is hash-bound to immutable accepted v14', () => {
  const digest = createHash('sha256').update(v14Bytes).digest('hex');
  assert.equal(digest, 'a6da3b8e2042147f52493389d27eac6c91d9499239464bc5ad81fe0c59b2ef35');
  assert.equal(v14.status, 'ACCEPTED');
  assert.equal(v15.schema_version, 15);
  assert.equal(v15.status, 'ACCEPTED');
  assert.deepEqual(v15.supersedes, {
    path: 'docs/architecture/process-ownership-v14.json',
    sha256: digest,
  });
  assert.deepEqual(v15.accepted_adrs, v14.accepted_adrs);
});

test('v15 changes only execution-service static package composition and invariants', () => {
  assert.deepEqual(v15.source_boundaries, v14.source_boundaries);
  assert.deepEqual(
    v15.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v14.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );

  const before = v14.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v15.native_helpers.find(({ id }) => id === 'execution-service');
  const packageFields = new Set([
    'service_management_authority',
    'launch_agent_plist_authority',
    'launch_daemon_plist_authority',
    'static_packaged_composition_authority',
    'packaged_fixture_application_reachable',
    'packaged_test_app_identifier',
    'packaged_test_fixture_identifier',
    'packaged_test_fixture_relative_path',
    'packaged_test_signing_identity_selector',
    'packaged_test_signing_team_identifier',
    'owner_authorized_packaged_test_app_signing',
    'owner_authorized_packaged_test_fixture_signing',
    'packaging_baseline_files',
    'proposed_packaging_changes',
  ]);
  const withoutPackage = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !packageFields.has(key)),
  );
  assert.deepEqual(withoutPackage(after), withoutPackage(before));
});

test('v15 permits only a static nested anonymous fixture candidate', () => {
  const service = v15.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.static_packaged_composition_authority,
    'PROPOSED_SIGNED_NESTED_ANONYMOUS_FIXTURE_ONLY',
  );
  assert.equal(service.packaged_fixture_application_reachable, false);
  assert.equal(service.packaged_test_app_identifier, 'com.socialeap.dosai');
  assert.equal(
    service.packaged_test_fixture_identifier,
    'com.socialeap.dosai.watchdog-xpc-fixture',
  );
  assert.equal(
    service.packaged_test_fixture_relative_path,
    'Contents/Library/LaunchServices/com.socialeap.dosai.watchdog-xpc-fixture',
  );
  assert.equal(service.packaged_test_signing_identity_selector, 'UMXN25Z493');
  assert.equal(service.packaged_test_signing_team_identifier, '3RD3TADLRY');
  assert.equal(service.owner_authorized_packaged_test_app_signing, true);
  assert.equal(service.owner_authorized_packaged_test_fixture_signing, true);
});

test('v15 binds package baselines and exact implementation paths', async () => {
  const service = v15.native_helpers.find(({ id }) => id === 'execution-service');
  assert.deepEqual(service.packaging_baseline_files, [
    {
      path: 'scripts/package.mjs',
      sha256: '9aebb658b82b60fd8203cb833f2e639152b40c77a843d9c845d9725350e82440',
    },
    {
      path: 'package.json',
      sha256: '90908d571d3e54c9c03be4fa75d97cd401e6ef1dab5dbe0d48943f9ed30fd700',
    },
  ]);
  assert.notEqual(
    await hashFile('scripts/package.mjs'),
    service.packaging_baseline_files[0].sha256,
    'accepted implementation must advance the package script from its v15 preimage',
  );
  assert.equal(
    await hashFile('package.json'),
    service.packaging_baseline_files[1].sha256,
    'package metadata must remain byte-identical',
  );
  assert.deepEqual(service.proposed_packaging_changes, [
    'scripts/package.mjs',
    'tests/security/p3-packaged-service-composition.test.mjs',
  ]);
  await access(resolve(root, 'tests/security/p3-packaged-service-composition.test.mjs'));
});

test('v15 preserves registration, listener, and effect denials', async () => {
  const service = v15.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'launch_daemon_plist_authority',
    'packaged_fixture_application_reachable',
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

  const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');
  assert.doesNotMatch(packageSource, /SMAppService|launchctl|\.register\s*\(|\.unregister\s*\(/);
  assert.match(packageSource, /Contents\/Library\/LaunchAgents/);
  assert.match(packageSource, /Contents\/Library\/LaunchDaemons/);
  assert.match(packageSource, /assert\.rejects\(access\(forbiddenPath\)\)/);
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(v28Service.launch_agent_static_package_registration_observed, false);
  assert.equal(v28Service.launch_agent_static_package_launch_observed, false);
  const statusAddon = v36.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  assert.equal(statusAddon.static_package_addon_load_observed, false);
  assert.equal(statusAddon.static_package_status_call_observed, false);
  for (const path of [
    'native-helpers/execution-service/LaunchAgent.plist',
    'native-helpers/execution-service/LaunchAgent.fixture.plist',
    'docs/architecture/schema-registry-v19.json',
  ]) {
    await assert.rejects(access(resolve(root, path)));
  }
});
