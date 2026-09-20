import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v20Path = resolve(root, 'docs/architecture/process-ownership-v20.json');
const v21Path = resolve(root, 'docs/architecture/process-ownership-v21.json');
const v20Bytes = await readFile(v20Path);
const v20 = JSON.parse(v20Bytes);
const v21 = JSON.parse(await readFile(v21Path, 'utf8'));
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

test('accepted process ownership v21 is hash-bound to immutable accepted v20', () => {
  const digest = createHash('sha256').update(v20Bytes).digest('hex');
  assert.equal(digest, '397658f28c29f3d2f538eda9087b5588c2411bcb386b16401f0d6492447c7566');
  assert.equal(v20.status, 'ACCEPTED');
  assert.equal(v21.schema_version, 21);
  assert.equal(v21.status, 'ACCEPTED');
  assert.deepEqual(v21.supersedes, {
    path: 'docs/architecture/process-ownership-v20.json',
    sha256: digest,
  });
  assert.deepEqual(v21.accepted_adrs, v20.accepted_adrs);
});

test('v21 changes only named-service executable proposal fields and invariants', () => {
  assert.deepEqual(v21.source_boundaries, v20.source_boundaries);
  assert.deepEqual(
    v21.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v20.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v20.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v21.native_helpers.find(({ id }) => id === 'execution-service');
  const proposalFields = new Set([
    'named_service_executable_candidate_authority',
    'named_service_executable_candidate_source_observed',
    'named_service_executable_candidate_build_observed',
    'named_service_executable_entry_point_source_authorized',
    'named_service_executable_dispatch_main_source_authorized',
    'named_service_temporary_executable_output_authorized',
    'named_service_apple_silicon_adhoc_signing_default_observed',
    'named_service_adhoc_signature_suppression_required',
    'named_service_adhoc_signature_suppression_linker_flag',
    'named_service_explicit_signing_authority',
    'named_service_signing_identity_use_authority',
    'named_service_signature_output_authority',
    'named_service_executable_invocation_authority',
    'named_service_executable_packaging_authority',
    'named_service_executable_plist_authority',
    'named_service_executable_registration_authority',
    'named_service_executable_launch_authority',
    'named_service_application_connection_authority',
    'named_service_runtime_effect_observed',
    'named_service_executable_candidate_proposed_files',
    'named_service_executable_candidate_immutable_inputs',
  ]);
  const withoutProposal = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !proposalFields.has(key)),
  );
  assert.deepEqual(withoutProposal(after), before);

  const proposalInvariants = new Set([
    'The proposed named-service executable slice may add only one fixed test entry-point source and one adversarial test that builds a temporary arm64 macOS 15 binary from the exact accepted source set in an isolated temporary directory.',
    'The proposed entry point accepts no arguments or configuration, obtains only the fixed named listener through the accepted adapter, retains it, and enters Dispatch.main without logging, fallback, discovery, or adjacent authority.',
    'The temporary build must pass -Xlinker -no_adhoc_codesign because Apple Silicon linker output is otherwise ad-hoc signed by default; no explicit signing command, identity use, signature, package copy, or persistent executable is authorized.',
    'The proposed executable candidate may be linked and inspected but cannot be invoked, signed, packaged, declared in a plist, registered, launched, connected from DOSAI, or used for VM, process, filesystem, network, journal, reconciliation, or production work.',
  ]);
  assert.deepEqual(
    v21.invariants.filter((value) => !proposalInvariants.has(value)),
    v20.invariants,
  );
  assert.equal(v21.invariants.length, v20.invariants.length + 4);
});

test('v21 permits only one temporary unsigned executable build candidate', () => {
  const service = v21.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.named_service_executable_candidate_authority,
    'PROPOSED_TEMPORARY_UNSIGNED_BUILD_ONLY',
  );
  assert.equal(service.named_service_executable_entry_point_source_authorized, true);
  assert.equal(service.named_service_executable_dispatch_main_source_authorized, true);
  assert.equal(service.named_service_temporary_executable_output_authorized, true);
  assert.equal(service.named_service_apple_silicon_adhoc_signing_default_observed, true);
  assert.equal(service.named_service_adhoc_signature_suppression_required, true);
  assert.equal(
    service.named_service_adhoc_signature_suppression_linker_flag,
    '-no_adhoc_codesign',
  );
  assert.deepEqual(service.named_service_executable_candidate_proposed_files, [
    'native-helpers/execution-service/WatchdogNamedServiceFixtureMain.swift',
    'tests/security/p3-watchdog-named-service-executable-candidate.test.mjs',
  ]);
});

test('v21 hash-locks every accepted executable-candidate input', async () => {
  const service = v21.native_helpers.find(({ id }) => id === 'execution-service');
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
  assert.equal(service.named_service_executable_candidate_immutable_inputs.length, 5);
  for (const file of service.named_service_executable_candidate_immutable_inputs) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, successorFiles.get(file.path), file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }
});

test('v21 implementation remains temporary and adds no persistent runtime effect', async () => {
  const service = v21.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'named_service_executable_candidate_source_observed',
    'named_service_executable_candidate_build_observed',
    'named_service_explicit_signing_authority',
    'named_service_signing_identity_use_authority',
    'named_service_signature_output_authority',
    'named_service_executable_invocation_authority',
    'named_service_executable_packaging_authority',
    'named_service_executable_plist_authority',
    'named_service_executable_registration_authority',
    'named_service_executable_launch_authority',
    'named_service_application_connection_authority',
    'named_service_runtime_effect_observed',
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
  for (const path of service.named_service_executable_candidate_proposed_files) {
    await access(resolve(root, path));
  }
  for (const path of [
    'native-helpers/execution-service/dosai-execution-service-fixture',
    'docs/architecture/schema-registry-v19.json',
  ]) {
    await assert.rejects(access(resolve(root, path)), undefined, path);
  }
  const plistRecord = v26.native_helpers
    .find(({ id }) => id === 'execution-service')
    .launch_agent_plist_implemented_files[0];
  assert.equal(
    plistRecord.path,
    'native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist',
  );
  assert.equal(await hashFile(plistRecord.path), plistRecord.sha256);
});
