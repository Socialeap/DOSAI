import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadLifecycleCompositionSuccessor } from './p3-lifecycle-composition-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const lifecycleSuccessor = await loadLifecycleCompositionSuccessor(root);
const v19Path = resolve(root, 'docs/architecture/process-ownership-v19.json');
const v20Path = resolve(root, 'docs/architecture/process-ownership-v20.json');
const v19Bytes = await readFile(v19Path);
const v19 = JSON.parse(v19Bytes);
const v20 = JSON.parse(await readFile(v20Path, 'utf8'));
const v22 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v22.json'), 'utf8'),
);
const v24 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v24.json'), 'utf8'),
);
const v26 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v26.json'), 'utf8'),
);
const v28 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v28.json'), 'utf8'),
);
const v30 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v30.json'), 'utf8'),
);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);
const v40 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v40.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v20 is hash-bound to immutable accepted v19', () => {
  const digest = createHash('sha256').update(v19Bytes).digest('hex');
  assert.equal(digest, '33f62ea2e93b826d7193ec44b026a0f3443855b773cde6bbdf108c59d8c89c69');
  assert.equal(v19.status, 'ACCEPTED');
  assert.equal(v20.schema_version, 20);
  assert.equal(v20.status, 'ACCEPTED');
  assert.deepEqual(v20.supersedes, {
    path: 'docs/architecture/process-ownership-v19.json',
    sha256: digest,
  });
  assert.deepEqual(v20.accepted_adrs, v19.accepted_adrs);
});

test('v20 changes only named-listener transport evidence and invariants', () => {
  assert.deepEqual(v20.source_boundaries, v19.source_boundaries);
  assert.deepEqual(
    v20.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v19.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v19.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v20.native_helpers.find(({ id }) => id === 'execution-service');
  const evidenceFields = new Set([
    'named_listener_transport_adapter_authority',
    'named_listener_transport_adapter_source_observed',
    'named_listener_transport_adapter_typechecked',
    'named_listener_transport_adapter_typecheck_target',
    'named_listener_transport_adapter_shared_handler_refactor_observed',
    'named_listener_transport_adapter_anonymous_regression_observed',
    'named_listener_transport_adapter_imports',
    'named_listener_transport_adapter_compiled_to_executable',
    'named_listener_transport_adapter_signed',
    'named_listener_transport_adapter_packaged',
    'named_listener_transport_adapter_executed',
    'named_listener_transport_adapter_listener_activated_observed',
    'named_listener_transport_adapter_peer_accepted_observed',
    'named_listener_transport_adapter_message_exchange_observed',
    'named_listener_transport_adapter_implemented_files',
    'named_listener_transport_adapter_guard_remediations',
  ]);
  const withoutEvidence = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !evidenceFields.has(key)),
  );
  assert.deepEqual(withoutEvidence(after), withoutEvidence(before));
  const evidenceInvariants = new Set([
    'The implemented transport refactor preserves one strict decoder, reply builder, and service event router, and the accepted anonymous signed fixture continues exercising that same route with no weaker admission or identity behavior.',
    'The implemented named-listener transport adapter has one zero-argument factory, creates its inert core internally, accepts only XPC connection events, and routes incoming peer events through the shared strict handler.',
    'The named-listener transport adapter typechecked for arm64 macOS 15 without executable output and was not signed, packaged, executed, activated, registered, connected from DOSAI, or observed exchanging a named-service message.',
  ]);
  assert.deepEqual(
    v20.invariants.filter((value) => !evidenceInvariants.has(value)),
    v19.invariants,
  );
  assert.equal(v20.invariants.length, v19.invariants.length + 3);
});

test('v20 binds exact compile-only transport implementation postimages', async () => {
  const service = v20.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.named_listener_transport_adapter_authority,
    'IMPLEMENTED_COMPILE_ONLY_FIXED_TEST_ADAPTER',
  );
  assert.equal(service.named_listener_transport_adapter_source_observed, true);
  assert.equal(service.named_listener_transport_adapter_typechecked, true);
  assert.equal(
    service.named_listener_transport_adapter_typecheck_target,
    'arm64-apple-macos15.0',
  );
  assert.equal(service.named_listener_transport_adapter_shared_handler_refactor_observed, true);
  assert.equal(service.named_listener_transport_adapter_anonymous_regression_observed, true);
  assert.deepEqual(service.named_listener_transport_adapter_imports, ['XPC']);
  assert.deepEqual(service.named_listener_transport_adapter_implemented_files, [
    {
      path: 'native-helpers/execution-service/WatchdogXPCTransport.swift',
      sha256: '29834171f3fc1a9cc8850f1bec32e42216747c0ed676ca62067cb88c27c3b66a',
    },
    {
      path: 'native-helpers/execution-service/WatchdogNamedListenerTransportCandidate.swift',
      sha256: 'a7180d292d066f75bf6f0a450c74b4f610cde50a1d55662661c3c5aeaece5195',
    },
    {
      path: 'tests/security/p3-watchdog-named-listener-transport-candidate.test.mjs',
      sha256: '842454ac9b7881208b097155e3a29ae0e96a715e99b793066ab53a3b0475e8f3',
    },
  ]);
  for (const file of service.named_listener_transport_adapter_implemented_files) {
    assert.equal(await hashFile(file.path), file.sha256, file.path);
  }
});

test('v20 preserves guard preimages while later accepted generations bind successors', async () => {
  const service = v20.native_helpers.find(({ id }) => id === 'execution-service');
  const successor = v22.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(v40.status, 'ACCEPTED');
  assert.deepEqual(v40.implemented_files, [{
    path: 'tests/architecture/process-ownership-v12.test.mjs',
    sha256: '24bec2421182f813765c6daadf903e5ea7394ebcec4a65d1d7efc7f8b3158030',
  }]);
  const successorFiles = new Map(
    [
      ...successor.named_service_executable_candidate_guard_remediations,
      ...v24.native_helpers.find(({ id }) => id === 'execution-service')
        .named_service_static_package_guard_remediations,
      ...v26.native_helpers.find(({ id }) => id === 'execution-service')
        .launch_agent_plist_guard_remediations,
      ...v28.native_helpers.find(({ id }) => id === 'execution-service')
        .launch_agent_static_package_guard_remediations,
      ...v30.native_helpers.find(({ id }) => id === 'execution-service')
        .launch_agent_status_guard_remediations,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_guard_remediations,
      ...v37.governance_maintenance_files,
      ...v40.implemented_files,
    ]
      .map((file) => [file.path, file.sha256]),
  );
  assert.equal(service.named_listener_transport_adapter_guard_remediations.length, 10);
  for (const file of service.named_listener_transport_adapter_guard_remediations) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(
        digest,
        lifecycleSuccessor.expected(file.path, successorFiles.get(file.path)),
        file.path,
      );
    } else {
      assert.equal(digest, lifecycleSuccessor.expected(file.path, file.sha256), file.path);
    }
  }
});

test('v20 records no executable, package, registration, launch, or runtime effect', async () => {
  const service = v20.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'named_listener_transport_adapter_application_reachable',
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
    'named_listener_transport_adapter_compiled_to_executable',
    'named_listener_transport_adapter_signed',
    'named_listener_transport_adapter_packaged',
    'named_listener_transport_adapter_executed',
    'named_listener_transport_adapter_listener_activated_observed',
    'named_listener_transport_adapter_peer_accepted_observed',
    'named_listener_transport_adapter_message_exchange_observed',
    'application_reachable',
    'registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
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
