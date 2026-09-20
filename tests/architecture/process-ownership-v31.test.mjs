import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v30Path = resolve(root, 'docs/architecture/process-ownership-v30.json');
const v30Bytes = await readFile(v30Path);
const v30 = JSON.parse(v30Bytes);
const v31 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v31.json'), 'utf8'),
);
const v32 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v32.json'), 'utf8'),
);
const v34 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v34.json'), 'utf8'),
);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);
const adr21Path = resolve(
  root,
  'docs/decisions/0021-electron-main-service-management-status-adapter.md',
);
const adr21Bytes = await readFile(adr21Path);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v31 is hash-bound to accepted v30 and ADR 0021', () => {
  const v30Digest = createHash('sha256').update(v30Bytes).digest('hex');
  const adr21Digest = createHash('sha256').update(adr21Bytes).digest('hex');
  assert.equal(v30Digest, 'b9abc5bf0791dff5254bfbe73cbe1e09c5792c8290de5eb0866f125f7482e10a');
  assert.equal(adr21Digest, 'ac3cbccf89bd4fc6f2e45c5c628deef625989ddc9408151a31c2ff27ffca7fb8');
  assert.equal(v30.status, 'ACCEPTED');
  assert.equal(v31.schema_version, 31);
  assert.equal(v31.status, 'ACCEPTED');
  assert.deepEqual(v31.supersedes, {
    path: 'docs/architecture/process-ownership-v30.json',
    sha256: v30Digest,
  });
  assert.deepEqual(v31.accepted_adrs, [
    ...v30.accepted_adrs,
    'docs/decisions/0021-electron-main-service-management-status-adapter.md',
  ]);
});

test('v31 changes only Main proposal metadata, one reserved native root, and invariants', () => {
  const beforeMain = v30.source_boundaries.find(({ id }) => id === 'main');
  const afterMain = v31.source_boundaries.find(({ id }) => id === 'main');
  const proposalFields = new Set([
    'service_management_status_adapter_authority',
    'service_management_status_adapter_application_reachable',
    'service_management_status_adapter_native_module_load_authority',
    'service_management_status_adapter_renderer_exposure_authority',
    'service_management_status_adapter_inputs',
    'service_management_status_adapter_outputs',
    'service_management_status_adapter_failure_observation',
    'service_management_status_adapter_fixed_plist_name',
    'service_management_status_adapter_target',
    'service_management_status_adapter_proposed_files',
  ]);
  assert.deepEqual(
    v31.source_boundaries.filter(({ id }) => id !== 'main'),
    v30.source_boundaries.filter(({ id }) => id !== 'main'),
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(afterMain).filter(([key]) => !proposalFields.has(key))),
    beforeMain,
  );
  assert.deepEqual(
    v31.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
    v30.native_helpers,
  );

  const proposalInvariants = new Set([
    'The proposed status-adapter slice reserves only one Objective-C++ Node-API source, one dedicated Electron Main adapter, and one adversarial security test over immutable accepted v30, ADR 0021, status-candidate, package, and plist inputs.',
    'The future native source may expose only one zero-argument status observation, compile in the accepted plist name, map the four accepted platform states, and fail closed to NOT_FOUND for unknown values or errors without exporting lifecycle or generic native dispatch.',
    'The future Main adapter may accept no input, validate only NOT_REGISTERED, ENABLED, REQUIRES_APPROVAL, or NOT_FOUND, expose no renderer or preload surface, and treat ENABLED as observation rather than liveness, connection, reconciliation, execution, or authorization evidence.',
    'No workspace Electron Node-API header source is currently selected or observed, so this proposal grants no header acquisition, dependency change, compilation, linking, native-module loading, packaging, signing, or invocation authority.',
    'The proposed status-adapter slice cannot call SMAppService or launchctl, register, unregister, open System Settings, launch or connect to the service, change the package, create or start a VM, launch a process, access application data or networks, write the journal, reconcile ownership, or perform production work.',
  ]);
  assert.deepEqual(
    v31.invariants.filter((value) => !proposalInvariants.has(value)),
    v30.invariants,
  );
  assert.equal(v31.invariants.length, v30.invariants.length + 5);
});

test('v31 fixes the zero-input four-observation Main adapter contract', () => {
  const main = v31.source_boundaries.find(({ id }) => id === 'main');
  assert.equal(
    main.service_management_status_adapter_authority,
    'PROPOSED_SOURCE_ONLY_ZERO_INPUT_OBSERVATION_ADAPTER',
  );
  assert.deepEqual(main.service_management_status_adapter_inputs, []);
  assert.deepEqual(main.service_management_status_adapter_outputs, [
    'NOT_REGISTERED',
    'ENABLED',
    'REQUIRES_APPROVAL',
    'NOT_FOUND',
  ]);
  assert.equal(main.service_management_status_adapter_failure_observation, 'NOT_FOUND');
  assert.equal(
    main.service_management_status_adapter_fixed_plist_name,
    'com.socialeap.dosai.execution-service-fixture.plist',
  );
  assert.equal(main.service_management_status_adapter_target, 'arm64-apple-macos15.0');
  assert.deepEqual(main.service_management_status_adapter_proposed_files, [
    'src/main/execution/service-management-status-adapter.ts',
  ]);
  assert.equal(main.service_management_status_adapter_application_reachable, false);
  assert.equal(main.service_management_status_adapter_native_module_load_authority, false);
  assert.equal(main.service_management_status_adapter_renderer_exposure_authority, false);
});

test('v31 reserves one source-only native addon boundary with every effect denied', () => {
  const addon = v31.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.equal(addon.path, 'native-helpers/service-management-status-addon');
  assert.equal(addon.trust_zone, 'Z3');
  assert.equal(addon.runtime, 'NOT_IMPLEMENTED');
  assert.equal(addon.implementation_state, 'PROPOSED');
  assert.equal(addon.authority, 'PROPOSED_SOURCE_AND_TEST_PATHS_ONLY_NO_IMPLEMENTATION');
  assert.equal(addon.service_management_source_import_authority, true);
  assert.equal(addon.service_management_status_property_source_authority, true);
  assert.deepEqual(addon.allowed_external_imports, ['Node-API C ABI', 'ServiceManagement']);
  assert.deepEqual(addon.inputs, []);
  assert.deepEqual(addon.outputs, [
    'NOT_REGISTERED',
    'ENABLED',
    'REQUIRES_APPROVAL',
    'NOT_FOUND',
  ]);
  assert.equal(addon.unknown_and_error_observation, 'NOT_FOUND');
  assert.equal(addon.target, 'arm64-apple-macos15.0');
  assert.equal(addon.workspace_electron_node_api_headers_observed, false);
  assert.equal(addon.node_api_header_source_selected, false);
  assert.equal(addon.node_api_header_acquisition_authority, false);
  assert.equal(addon.dependency_change_authority, false);

  for (const field of [
    'application_reachable',
    'native_module_load_authority',
    'native_compile_authority',
    'native_link_authority',
    'signing_authority',
    'packaging_authority',
    'invocation_authority',
    'service_management_runtime_call_authority',
    'registration_authority',
    'unregistration_authority',
    'open_system_settings_authority',
    'launchctl_authority',
    'service_launch_authority',
    'application_connection_authority',
    'renderer_exposure_authority',
    'generic_native_dispatch_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
    'xpc_authority',
    'journal_authority',
    'reconciliation_authority',
    'vm_authority',
    'execution_authority',
    'production_authority',
  ]) {
    assert.equal(addon[field], false, field);
  }
});

test('v31 hash-locks inputs while v32 and v34 bind exact implemented successor files', async () => {
  const addon = v31.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.deepEqual(addon.proposed_files, [
    'native-helpers/service-management-status-addon/service-management-status-addon.mm',
    'src/main/execution/service-management-status-adapter.ts',
    'tests/security/p3-service-management-status-adapter-candidate.test.mjs',
  ]);
  assert.equal(addon.immutable_inputs.length, 6);
  const packageSuccessors = new Map(
    [
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_implemented_files,
      ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .physical_proof_implemented_files,
    ]
      .map((file) => [file.path, file.sha256]),
  );
  for (const file of addon.immutable_inputs) {
    assert.equal(await hashFile(file.path), packageSuccessors.get(file.path) ?? file.sha256, file.path);
  }
  assert.deepEqual(v32.supersedes, {
    path: 'docs/architecture/process-ownership-v31.json',
    sha256: createHash('sha256').update(await readFile(
      resolve(root, 'docs/architecture/process-ownership-v31.json'),
    )).digest('hex'),
  });
  const successor = v32.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  assert.deepEqual(
    successor.implemented_files.map(({ path }) => path),
    addon.proposed_files,
  );
  const v34Addon = v34.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  const laterSuccessors = new Map(
    v34Addon.compile_proof_implemented_files.map((file) => [file.path, file.sha256]),
  );
  for (const file of successor.implemented_files) {
    assert.equal(await hashFile(file.path), laterSuccessors.get(file.path) ?? file.sha256, file.path);
  }
});
