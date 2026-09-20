import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v25Path = resolve(root, 'docs/architecture/process-ownership-v25.json');
const v26Path = resolve(root, 'docs/architecture/process-ownership-v26.json');
const v25Bytes = await readFile(v25Path);
const v25 = JSON.parse(v25Bytes);
const v26 = JSON.parse(await readFile(v26Path, 'utf8'));
const v27 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v27.json'), 'utf8'),
);
const v28 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v28.json'), 'utf8'),
);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);
const v30 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v30.json'), 'utf8'),
);
const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v26 is hash-bound to immutable accepted v25', () => {
  const digest = createHash('sha256').update(v25Bytes).digest('hex');
  assert.equal(digest, '9f2f529e88577eed7f8c9ee6b1d5c6daa129a8839167d88fe4a459647615977c');
  assert.equal(v25.status, 'ACCEPTED');
  assert.equal(v26.schema_version, 26);
  assert.equal(v26.status, 'ACCEPTED');
  assert.deepEqual(v26.supersedes, {
    path: 'docs/architecture/process-ownership-v25.json',
    sha256: digest,
  });
  assert.deepEqual(v26.accepted_adrs, v25.accepted_adrs);
});

test('v26 changes only source-plist implementation evidence and invariants', () => {
  assert.deepEqual(v26.source_boundaries, v25.source_boundaries);
  assert.deepEqual(
    v26.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v25.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v25.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v26.native_helpers.find(({ id }) => id === 'execution-service');
  const evidenceFields = new Set([
    'launch_agent_plist_candidate_authority',
    'launch_agent_plist_source_observed',
    'launch_agent_plist_parsed_observed',
    'launch_agent_plist_regular_file_observed',
    'launch_agent_plist_symbolic_link_observed',
    'launch_agent_plist_top_level_key_count_observed',
    'launch_agent_plist_mach_service_count_observed',
    'launch_agent_plist_package_script_unchanged_observed',
    'launch_agent_plist_retained_package_unchanged_observed',
    'launch_agent_plist_retained_package_plist_observed',
    'launch_agent_plist_implemented_files',
    'launch_agent_plist_guard_remediations',
  ]);
  const withoutEvidence = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !evidenceFields.has(key)),
  );
  assert.deepEqual(withoutEvidence(after), withoutEvidence(before));

  const evidenceInvariants = new Set([
    'The implemented source plist is a regular non-symlink file that parses to exactly Label, BundleProgram, and one true MachServices entry with the accepted fixed test identifiers and bundle-relative executable path.',
    'The adversarial parser test rejects identity and path substitution, empty or expanded services, non-true service values, adjacent launchd authority keys, duplicate keys, non-dictionary data, BOM input, and oversized input.',
    'The accepted Swift sources, builder, package script, package security test, and retained v24 signed package remain unchanged, and the retained package still contains no LaunchAgent or LaunchDaemon plist.',
    'The source declaration was not packaged, signed, installed, registered, loaded, launched, or connected to the application and grants no ServiceManagement, launchctl, VM, process, filesystem, network, journal, reconciliation, ownership-release, or production authority.',
  ]);
  assert.deepEqual(
    v26.invariants.filter((value) => !evidenceInvariants.has(value)),
    v25.invariants,
  );
  assert.equal(v26.invariants.length, v25.invariants.length + 4);
});

test('v26 records exact source-only declaration observations', () => {
  const service = v26.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.launch_agent_plist_candidate_authority,
    'IMPLEMENTED_SOURCE_ONLY_UNCOMPOSED_TEST_DECLARATION',
  );
  for (const field of [
    'launch_agent_plist_source_observed',
    'launch_agent_plist_parsed_observed',
    'launch_agent_plist_regular_file_observed',
    'launch_agent_plist_package_script_unchanged_observed',
    'launch_agent_plist_retained_package_unchanged_observed',
  ]) {
    assert.equal(service[field], true, field);
  }
  assert.equal(service.launch_agent_plist_symbolic_link_observed, false);
  assert.equal(service.launch_agent_plist_top_level_key_count_observed, 3);
  assert.equal(service.launch_agent_plist_mach_service_count_observed, 1);
  assert.equal(service.launch_agent_plist_retained_package_plist_observed, false);
});

test('v26 binds exact implementation and successor-aware guard postimages', async () => {
  const service = v26.native_helpers.find(({ id }) => id === 'execution-service');
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map(
    [
      ...v27.native_helpers.find(({ id }) => id === 'execution-service')
        .launch_agent_static_package_proposal_guard_remediations,
      ...v28Service.launch_agent_static_package_implemented_files,
      ...v28Service.launch_agent_static_package_guard_remediations,
      ...v30.native_helpers.find(({ id }) => id === 'execution-service')
        .launch_agent_status_guard_remediations,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_guard_remediations,
      ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .physical_proof_implemented_files,
      ...v37.governance_maintenance_files,
    ]
      .map((file) => [file.path, file.sha256]),
  );
  assert.equal(service.launch_agent_plist_implemented_files.length, 2);
  assert.equal(service.launch_agent_plist_guard_remediations.length, 14);
  assert.deepEqual(
    service.launch_agent_plist_implemented_files.map(({ path }) => path),
    service.launch_agent_plist_proposed_files,
  );
  for (const file of [
    ...service.launch_agent_plist_implemented_files,
    ...service.launch_agent_plist_guard_remediations,
  ]) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, successorFiles.get(file.path), file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }
});

test('v26 preserves registration, launch, and effect denials while v28 binds packaging', () => {
  const service = v26.native_helpers.find(({ id }) => id === 'execution-service');
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    createHash('sha256').update(packageSource).digest('hex'),
    v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .physical_proof_implemented_files
      .find(({ path }) => path === 'scripts/package.mjs').sha256,
  );
  for (const field of [
    'launch_agent_plist_active_declaration_authority',
    'launch_agent_plist_package_change_authority',
    'launch_agent_plist_service_management_authority',
    'launch_agent_plist_launchctl_authority',
    'launch_agent_plist_packaged_observed',
    'launch_agent_plist_signed_observed',
    'launch_agent_plist_registration_observed',
    'launch_agent_plist_launch_observed',
    'launch_agent_plist_application_connection_observed',
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'launch_daemon_plist_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
    'reconciliation_authority',
    'journal_authority',
    'vm_creation_authority',
    'vm_start_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
  assert.doesNotMatch(
    packageSource,
    /SMAppService|agent\(plistName|registerAndReturnError|unregisterAndReturnError|launchctl/,
  );
  assert.equal(v28Service.launch_agent_static_package_registration_observed, false);
  assert.equal(v28Service.launch_agent_static_package_launch_observed, false);
});
