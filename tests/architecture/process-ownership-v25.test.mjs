import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v24Path = resolve(root, 'docs/architecture/process-ownership-v24.json');
const v25Path = resolve(root, 'docs/architecture/process-ownership-v25.json');
const v24Bytes = await readFile(v24Path);
const v24 = JSON.parse(v24Bytes);
const v25 = JSON.parse(await readFile(v25Path, 'utf8'));
const v26 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v26.json'), 'utf8'),
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
const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v25 is hash-bound to immutable accepted v24', () => {
  const digest = createHash('sha256').update(v24Bytes).digest('hex');
  assert.equal(digest, '8c419831f4d1ee9ac8efc8fd76e1fb47fccbf9197bf21334edf0a6d412098f3e');
  assert.equal(v24.status, 'ACCEPTED');
  assert.equal(v25.schema_version, 25);
  assert.equal(v25.status, 'ACCEPTED');
  assert.deepEqual(v25.supersedes, {
    path: 'docs/architecture/process-ownership-v24.json',
    sha256: digest,
  });
  assert.deepEqual(v25.accepted_adrs, v24.accepted_adrs);
});

test('v25 changes only source-only LaunchAgent proposal fields and invariants', () => {
  assert.deepEqual(v25.source_boundaries, v24.source_boundaries);
  assert.deepEqual(
    v25.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v24.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v24.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v25.native_helpers.find(({ id }) => id === 'execution-service');
  const proposalFields = new Set([
    'launch_agent_plist_candidate_authority',
    'launch_agent_plist_source_authority',
    'launch_agent_plist_test_authority',
    'launch_agent_plist_active_declaration_authority',
    'launch_agent_plist_package_change_authority',
    'launch_agent_plist_service_management_authority',
    'launch_agent_plist_launchctl_authority',
    'launch_agent_plist_label',
    'launch_agent_plist_bundle_program',
    'launch_agent_plist_mach_service',
    'launch_agent_plist_expected_keys',
    'launch_agent_plist_source_observed',
    'launch_agent_plist_parsed_observed',
    'launch_agent_plist_packaged_observed',
    'launch_agent_plist_signed_observed',
    'launch_agent_plist_registration_observed',
    'launch_agent_plist_launch_observed',
    'launch_agent_plist_application_connection_observed',
    'launch_agent_plist_proposed_files',
    'launch_agent_plist_immutable_inputs',
  ]);
  const withoutProposal = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !proposalFields.has(key)),
  );
  assert.deepEqual(withoutProposal(after), before);

  const proposalInvariants = new Set([
    'The proposed LaunchAgent declaration slice may add only one source-only test plist and one adversarial parser test; both remain absent until this process-ownership generation is accepted.',
    'The proposed plist must contain exactly Label, BundleProgram, and MachServices, with the fixed test identifiers and bundle-relative executable path; MachServices must map only the fixed watchdog service to true.',
    'The proposed plist cannot declare Program, ProgramArguments, EnvironmentVariables, RunAtLoad, KeepAlive, Disabled, UserName, GroupName, sockets, path triggers, calendar triggers, network state, output paths, privileged service flags, or caller-controlled configuration.',
    'Source-only LaunchAgent declaration authority does not authorize package changes, Contents/Library/LaunchAgents placement, signing, ServiceManagement or SMAppService calls, launchctl, installation, registration, unregistration, launch, application connection, VM, process, filesystem, network, journal, reconciliation, ownership release, or production behavior.',
  ]);
  assert.deepEqual(
    v25.invariants.filter((value) => !proposalInvariants.has(value)),
    v24.invariants,
  );
  assert.equal(v25.invariants.length, v24.invariants.length + 4);
});

test('v25 fixes the exact minimal source declaration contract', () => {
  const service = v25.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.launch_agent_plist_candidate_authority,
    'PROPOSED_SOURCE_ONLY_UNCOMPOSED_TEST_DECLARATION',
  );
  assert.equal(service.launch_agent_plist_source_authority, true);
  assert.equal(service.launch_agent_plist_test_authority, true);
  assert.equal(service.launch_agent_plist_label, 'com.socialeap.dosai.execution-service-fixture');
  assert.equal(
    service.launch_agent_plist_bundle_program,
    'Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture',
  );
  assert.equal(
    service.launch_agent_plist_mach_service,
    'com.socialeap.dosai.execution-service-fixture.watchdog',
  );
  assert.deepEqual(service.launch_agent_plist_expected_keys, [
    'BundleProgram',
    'Label',
    'MachServices',
  ]);
  assert.deepEqual(service.launch_agent_plist_proposed_files, [
    'native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist',
    'tests/security/p3-watchdog-launch-agent-plist-candidate.test.mjs',
  ]);
});

test('v25 hash-locks every accepted source and package input', async () => {
  const service = v25.native_helpers.find(({ id }) => id === 'execution-service');
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map([
    ...v28Service.launch_agent_static_package_implemented_files,
    ...v28Service.launch_agent_static_package_guard_remediations,
    ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .static_package_implemented_files,
    ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .static_package_guard_remediations,
    ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .physical_proof_implemented_files,
    ...v37.governance_maintenance_files,
  ].map((file) => [file.path, file.sha256]));
  assert.equal(service.launch_agent_plist_immutable_inputs.length, 8);
  for (const file of service.launch_agent_plist_immutable_inputs) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, successorFiles.get(file.path), file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }
});

test('v25 remains historically bounded while v26 and v28 bind its successors', async () => {
  const service = v25.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'launch_agent_plist_active_declaration_authority',
    'launch_agent_plist_package_change_authority',
    'launch_agent_plist_service_management_authority',
    'launch_agent_plist_launchctl_authority',
    'launch_agent_plist_source_observed',
    'launch_agent_plist_parsed_observed',
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
  assert.match(packageSource, /--static-named-service-launch-agent-fixture/);
  const successor = v26.native_helpers.find(({ id }) => id === 'execution-service');
  assert.deepEqual(
    successor.launch_agent_plist_implemented_files.map(({ path }) => path),
    service.launch_agent_plist_proposed_files,
  );
  for (const file of successor.launch_agent_plist_implemented_files) {
    const v28File = v28.native_helpers.find(({ id }) => id === 'execution-service')
      .launch_agent_static_package_guard_remediations
      .find(({ path }) => path === file.path);
    const v36File = v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .static_package_guard_remediations
      .find(({ path }) => path === file.path);
    const v37File = v37.governance_maintenance_files.find(({ path }) => path === file.path);
    assert.equal(
      await hashFile(file.path),
      v37File?.sha256 ?? v36File?.sha256 ?? v28File?.sha256 ?? file.sha256,
      file.path,
    );
  }
  assert.equal(
    v28.native_helpers.find(({ id }) => id === 'execution-service')
      .launch_agent_static_package_registration_observed,
    false,
  );
});
