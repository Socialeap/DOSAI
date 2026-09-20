import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadGuardSuccessors } from './p3-guard-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const successors = await loadGuardSuccessors(root);
const v21Path = resolve(root, 'docs/architecture/process-ownership-v21.json');
const v22Path = resolve(root, 'docs/architecture/process-ownership-v22.json');
const v21Bytes = await readFile(v21Path);
const v21 = JSON.parse(v21Bytes);
const v22 = JSON.parse(await readFile(v22Path, 'utf8'));
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

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v22 is hash-bound to immutable accepted v21', () => {
  const digest = createHash('sha256').update(v21Bytes).digest('hex');
  assert.equal(digest, 'c89f0f7b1758f0985d079e820bf717a25c677c3eb76f583fd537cb2bdce6722e');
  assert.equal(v21.status, 'ACCEPTED');
  assert.equal(v22.schema_version, 22);
  assert.equal(v22.status, 'ACCEPTED');
  assert.deepEqual(v22.supersedes, {
    path: 'docs/architecture/process-ownership-v21.json',
    sha256: digest,
  });
  assert.deepEqual(v22.accepted_adrs, v21.accepted_adrs);
});

test('v22 changes only named-service executable evidence and invariants', () => {
  assert.deepEqual(v22.source_boundaries, v21.source_boundaries);
  assert.deepEqual(
    v22.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v21.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v21.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v22.native_helpers.find(({ id }) => id === 'execution-service');
  const evidenceFields = new Set([
    'named_service_executable_candidate_authority',
    'named_service_executable_candidate_source_observed',
    'named_service_executable_candidate_build_observed',
    'named_service_executable_target_architecture_observed',
    'named_service_executable_minimum_macos_observed',
    'named_service_adhoc_signature_suppression_observed',
    'named_service_code_signature_load_command_observed',
    'named_service_forbidden_framework_link_observed',
    'named_service_executable_invocation_observed',
    'named_service_executable_persisted_observed',
    'named_service_temporary_cleanup_observed',
    'named_service_executable_inspection_tools',
    'named_service_executable_candidate_implemented_files',
    'named_service_executable_candidate_guard_remediations',
  ]);
  const withoutEvidence = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !evidenceFields.has(key)),
  );
  assert.deepEqual(withoutEvidence(after), withoutEvidence(before));

  const evidenceInvariants = new Set([
    'The implemented entry point imports only Dispatch, accepts no input or configuration, obtains only the accepted fixed named listener, retains it, and enters Dispatch.main without logging or fallback behavior.',
    'The temporary candidate linked for arm64 with minimum macOS 15 and -no_adhoc_codesign, contained no LC_CODE_SIGNATURE or forbidden framework dependency, and was inspected only with lipo, otool, and vtool.',
    'The temporary executable was never invoked, signed, packaged, copied, declared, registered, launched, or connected from DOSAI, and its isolated output directory was removed after inspection.',
  ]);
  assert.deepEqual(
    v22.invariants.filter((value) => !evidenceInvariants.has(value)),
    v21.invariants,
  );
  assert.equal(v22.invariants.length, v21.invariants.length + 3);
});

test('v22 binds exact entry-point and unsigned-link test postimages', async () => {
  const service = v22.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.named_service_executable_candidate_authority,
    'IMPLEMENTED_TEMPORARY_UNSIGNED_BUILD_ONLY',
  );
  assert.deepEqual(service.named_service_executable_candidate_implemented_files, [
    {
      path: 'native-helpers/execution-service/WatchdogNamedServiceFixtureMain.swift',
      sha256: 'bacf02ee54d4228ba25cb4359786c94ff0f8c0dbaf069f1fc6df212ac40741f2',
    },
    {
      path: 'tests/security/p3-watchdog-named-service-executable-candidate.test.mjs',
      sha256: 'fc4fe927551ff254375dd178a1bccce7ff4805d00e6b93834d18fa764de8510d',
    },
  ]);
  for (const file of service.named_service_executable_candidate_implemented_files) {
    assert.equal(await hashFile(file.path), file.sha256, file.path);
  }
});

test('v22 preserves guard postimages while later accepted generations bind successors', async () => {
  const service = v22.native_helpers.find(({ id }) => id === 'execution-service');
  const successor = v24.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map([
    ...successor.named_service_static_package_guard_remediations,
    ...v26.native_helpers.find(({ id }) => id === 'execution-service')
      .launch_agent_plist_guard_remediations,
    ...v28.native_helpers.find(({ id }) => id === 'execution-service')
      .launch_agent_static_package_guard_remediations,
    ...v30.native_helpers.find(({ id }) => id === 'execution-service')
      .launch_agent_status_guard_remediations,
    ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .static_package_guard_remediations,
    ...v37.governance_maintenance_files,
  ]
      .map((file) => [file.path, successors.expected(file.path, file.sha256)]),
  );
  assert.equal(service.named_service_executable_candidate_guard_remediations.length, 7);
  for (const file of service.named_service_executable_candidate_guard_remediations) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, successorFiles.get(file.path), file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }
});

test('v22 records unsigned build inspection, cleanup, and every runtime denial', async () => {
  const service = v22.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.named_service_executable_candidate_source_observed, true);
  assert.equal(service.named_service_executable_candidate_build_observed, true);
  assert.equal(service.named_service_executable_target_architecture_observed, 'arm64');
  assert.equal(service.named_service_executable_minimum_macos_observed, '15.0');
  assert.equal(service.named_service_adhoc_signature_suppression_observed, true);
  assert.equal(service.named_service_temporary_cleanup_observed, true);
  assert.deepEqual(service.named_service_executable_inspection_tools, ['lipo', 'otool', 'vtool']);
  for (const field of [
    'named_service_code_signature_load_command_observed',
    'named_service_forbidden_framework_link_observed',
    'named_service_executable_invocation_observed',
    'named_service_executable_persisted_observed',
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
