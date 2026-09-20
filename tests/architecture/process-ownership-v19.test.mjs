import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v18Path = resolve(root, 'docs/architecture/process-ownership-v18.json');
const v19Path = resolve(root, 'docs/architecture/process-ownership-v19.json');
const v18Bytes = await readFile(v18Path);
const v18 = JSON.parse(v18Bytes);
const v19 = JSON.parse(await readFile(v19Path, 'utf8'));
const v24 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v24.json'), 'utf8'),
);
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

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v19 is hash-bound to immutable accepted v18', () => {
  const digest = createHash('sha256').update(v18Bytes).digest('hex');
  assert.equal(digest, '7e11bd65875092c2d33800442f406757404d8bafdd4b4bdbaacb82a2ccdaf2ef');
  assert.equal(v18.status, 'ACCEPTED');
  assert.equal(v19.schema_version, 19);
  assert.equal(v19.status, 'ACCEPTED');
  assert.deepEqual(v19.supersedes, {
    path: 'docs/architecture/process-ownership-v18.json',
    sha256: digest,
  });
  assert.deepEqual(v19.accepted_adrs, v18.accepted_adrs);
});

test('v19 changes only named-listener transport proposal fields and invariants', () => {
  assert.deepEqual(v19.source_boundaries, v18.source_boundaries);
  assert.deepEqual(
    v19.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v18.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v18.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v19.native_helpers.find(({ id }) => id === 'execution-service');
  const proposalFields = new Set([
    'named_listener_transport_adapter_authority',
    'named_listener_transport_adapter_application_reachable',
    'named_listener_transport_adapter_source_observed',
    'named_listener_transport_adapter_typechecked',
    'named_listener_transport_adapter_shared_handler_refactor_authorized',
    'named_listener_transport_adapter_activation_api_authorized',
    'named_listener_transport_adapter_event_handler_api_authorized',
    'named_listener_transport_adapter_strict_reply_api_authorized',
    'named_listener_transport_adapter_generic_configuration_authority',
    'named_listener_transport_adapter_client_connection_authority',
    'named_listener_transport_adapter_executable_entry_point_authority',
    'named_listener_transport_adapter_executable_output_authority',
    'named_listener_transport_adapter_signing_authority',
    'named_listener_transport_adapter_packaging_authority',
    'named_listener_transport_adapter_plist_authority',
    'named_listener_transport_adapter_registration_authority',
    'named_listener_transport_adapter_launch_authority',
    'named_listener_transport_adapter_runtime_effect_observed',
    'named_listener_transport_refactor_baseline',
    'named_listener_transport_adapter_proposed_files',
    'named_listener_transport_adapter_immutable_inputs',
  ]);
  const withoutProposal = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !proposalFields.has(key)),
  );
  assert.deepEqual(withoutProposal(after), before);
  const proposedInvariants = new Set([
    'The proposed named-listener transport slice may refactor only the accepted anonymous fixture\'s existing strict decode, reply, and disconnect-reduction path into one internal fixed service-side handler, and the signed anonymous self-test must continue exercising that same handler without weaker admission.',
    'The proposed named-listener transport adapter may add only one compile-only, zero-configuration test source that obtains the accepted fixed inactive listener, accepts only XPC connection events, installs the shared strict handler, and activates only that listener and its authenticated incoming peers.',
    'The proposed adapter cannot create a client connection, accept a caller-supplied service name, requirement, identity, queue, handler, core, payload, path, PID, flag, or entitlement, and it cannot use privileged bootstrap or ServiceManagement APIs.',
    'The proposed named-listener transport slice cannot add an executable entry point or output, sign, package, declare a plist, register, launch, connect from DOSAI, create or start a VM, access files or networks, reconcile ownership, write the journal, or perform production work.',
  ]);
  assert.deepEqual(
    v19.invariants.filter((value) => !proposedInvariants.has(value)),
    v18.invariants,
  );
  assert.equal(v19.invariants.length, v18.invariants.length + 4);
});

test('v19 permits only a compile-only fixed named-listener transport adapter', () => {
  const service = v19.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.named_listener_transport_adapter_authority,
    'PROPOSED_COMPILE_ONLY_FIXED_TEST_ADAPTER',
  );
  assert.equal(service.named_listener_transport_adapter_shared_handler_refactor_authorized, true);
  assert.equal(service.named_listener_transport_adapter_activation_api_authorized, true);
  assert.equal(service.named_listener_transport_adapter_event_handler_api_authorized, true);
  assert.equal(service.named_listener_transport_adapter_strict_reply_api_authorized, true);
  assert.deepEqual(service.named_listener_transport_adapter_proposed_files, [
    'native-helpers/execution-service/WatchdogXPCTransport.swift',
    'native-helpers/execution-service/WatchdogNamedListenerTransportCandidate.swift',
    'tests/security/p3-watchdog-named-listener-transport-candidate.test.mjs',
  ]);
  for (const field of [
    'named_listener_transport_adapter_application_reachable',
    'named_listener_transport_adapter_source_observed',
    'named_listener_transport_adapter_typechecked',
    'named_listener_transport_adapter_generic_configuration_authority',
    'named_listener_transport_adapter_client_connection_authority',
    'named_listener_transport_adapter_executable_entry_point_authority',
    'named_listener_transport_adapter_executable_output_authority',
    'named_listener_transport_adapter_signing_authority',
    'named_listener_transport_adapter_packaging_authority',
    'named_listener_transport_adapter_plist_authority',
    'named_listener_transport_adapter_registration_authority',
    'named_listener_transport_adapter_launch_authority',
    'named_listener_transport_adapter_runtime_effect_observed',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('v19 hash-locks accepted inputs and authorizes only its transport preimage change', async () => {
  const service = v19.native_helpers.find(({ id }) => id === 'execution-service');
  const successor = v24.native_helpers.find(({ id }) => id === 'execution-service');
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map(
    [
      ...successor.named_service_static_package_implemented_files,
      ...v28Service.launch_agent_static_package_implemented_files,
      ...v28Service.launch_agent_static_package_guard_remediations,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_implemented_files,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_guard_remediations,
      ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .physical_proof_implemented_files,
    ]
      .map((file) => [file.path, file.sha256]),
  );
  assert.deepEqual(service.named_listener_transport_refactor_baseline, {
    path: 'native-helpers/execution-service/WatchdogXPCTransport.swift',
    sha256: '0350b401ff50519cc97bae9cd0911f77cd6f163e65e243499fbfc6fe7617b7dd',
  });
  assert.notEqual(
    await hashFile(service.named_listener_transport_refactor_baseline.path),
    service.named_listener_transport_refactor_baseline.sha256,
  );
  for (const file of service.named_listener_transport_adapter_immutable_inputs) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, successorFiles.get(file.path), file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }
});

test('v19 implementation remains compile-only and adds no schema, package, or launch artifact', async () => {
  const service = v19.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'launch_daemon_plist_authority',
    'mach_service_listener_authority',
    'named_listener_activation_authority',
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
  for (const path of service.named_listener_transport_adapter_proposed_files) {
    await access(resolve(root, path));
  }
  const plistRecord = v26.native_helpers
    .find(({ id }) => id === 'execution-service')
    .launch_agent_plist_implemented_files[0];
  assert.equal(
    plistRecord.path,
    'native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist',
  );
  assert.equal(await hashFile(plistRecord.path), plistRecord.sha256);
  await assert.rejects(
    access(resolve(root, 'docs/architecture/schema-registry-v19.json')),
  );
});
