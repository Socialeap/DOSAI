import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v7Path = join(root, 'docs/architecture/process-ownership-v7.json');
const v8Path = join(root, 'docs/architecture/process-ownership-v8.json');
const manifest = JSON.parse(await readFile(v8Path, 'utf8'));

test('accepted process ownership v8 is hash-bound to immutable v7 and ADR 0019', async () => {
  const digest = createHash('sha256').update(await readFile(v7Path)).digest('hex');
  assert.equal(digest, 'abf7137a4dd3fc1a3174a18a2962460ae37abe7b2d4a0a82ab91d1bf1da323d1');
  assert.equal(manifest.schema_version, 8);
  assert.equal(manifest.status, 'ACCEPTED');
  assert.deepEqual(manifest.supersedes, {
    path: 'docs/architecture/process-ownership-v7.json',
    sha256: digest,
  });
  assert.equal(
    manifest.accepted_adrs.at(-1),
    'docs/decisions/0019-capsule-registry-audit-journal-binding.md',
  );
});

test('v8 changes only the audit-helper boundary and governing invariants', async () => {
  const v7 = JSON.parse(await readFile(v7Path, 'utf8'));
  assert.deepEqual(manifest.source_boundaries, v7.source_boundaries);
  assert.deepEqual(
    manifest.native_helpers.filter(({ id }) => id !== 'audit-helper'),
    v7.native_helpers.filter(({ id }) => id !== 'audit-helper'),
  );
  const helper = manifest.native_helpers.find(({ id }) => id === 'audit-helper');
  assert.deepEqual(helper.allowed_first_party_imports, ['contracts', 'audit-helper']);
  assert.equal(helper.application_interface, 'INJECTED_CAPSULE_REGISTRY_AUDIT_BINDING_PORT_ONLY');
  assert.equal(helper.general_append_authority_exposed, false);
  assert.equal(helper.source_authentication_exposed, false);
  assert.equal(helper.network_authority, false);
  assert.equal(helper.process_launch_authority, false);

  const main = manifest.source_boundaries.find(({ id }) => id === 'main');
  assert.equal(main.may_hold_authority, false);
  assert.deepEqual(main.allowed_first_party_imports, ['contracts', 'main']);
  assert.equal(main.allowed_first_party_imports.includes('audit-helper'), false);
});

test('v8 preserves the empty execution-service reservation', () => {
  const service = manifest.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.implementation_state, 'RESERVED');
  assert.equal(service.application_reachable, false);
  assert.equal(service.vm_creation_authority, false);
  assert.equal(service.vm_start_authority, false);
  assert.equal(service.process_launch_authority, false);
  assert.equal(service.filesystem_authority, false);
  assert.equal(service.network_authority, false);
});
