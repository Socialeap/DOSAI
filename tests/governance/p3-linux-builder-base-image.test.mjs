import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const evidencePath = resolve(
  root,
  'docs/development/p3-linux-builder-base-image-evidence.md',
);

test('accepted registry v15 remains exact before base candidate selection', async () => {
  const bytes = await readFile(resolve(root, 'docs/architecture/schema-registry-v15.json'));
  const registry = JSON.parse(bytes);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'ec122a0151e109bc9f84de7eeeef9667e68cccca214d578405b48ea7190ea76c',
  );
  assert.equal(registry.status, 'ACCEPTED');
  assert.equal(registry.registry_version, 15);
});

test('base candidate binds the index, amd64 manifest, config, and layer identities', async () => {
  const evidence = await readFile(evidencePath, 'utf8');
  for (const required of [
    'sha256:fac46bff2e02f51425b6e33b0e1169f55dfb053d83511ca28aa50c09fd5ed7a4',
    'sha256:d63a99144861e4e460196ed93d07777490cbeab53ca660c434f2a589a6c50ea3',
    'sha256:b67c8a175d84bbbf1b674f66b32ad0ad246e962ac52a80de5a4014c375683d18',
    'sha256:b890c9407285c31d25426ef154b55c72e225f19b478a59451b01a8a44f5ea4f7',
    '`trixie-20260713`',
    '`linux/amd64`',
    '`49312572` bytes',
    '`2b9b380c71ad8a3b6ce55c083c9ecfb901dabf71`',
  ]) {
    assert.ok(evidence.includes(required), required);
  }
});

test('accepted base candidate remains explicitly unverified and non-authorizing', async () => {
  const evidence = await readFile(evidencePath, 'utf8');
  assert.match(evidence, /\*\*Status:\*\* `ACCEPTED`/);
  assert.match(evidence, /\*\*Accepted:\*\* `2026-08-02T13:22:39-04:00`/);
  assert.match(evidence, /accepted candidate remains `OBSERVED_UNVERIFIED`/);
  assert.match(evidence, /does not elevate the assurance\nstate/);
  assert.match(evidence, /blobs were not\n  downloaded and hashed locally/);
  assert.match(evidence, /all verification flags remain false/);
  assert.match(evidence, /no Debian image/);
});

test('base observation adds no builder implementation or local artifact', async () => {
  for (const path of [
    'guest-build/builder/Dockerfile',
    'guest-build/builder/build-policy.json',
    'guest-build/builder-manifest.json',
    'builder-artifacts',
    '.github/workflows/guest-build.yml',
  ]) {
    await assert.rejects(access(resolve(root, path)));
  }
  const packageJson = await readFile(resolve(root, 'package.json'), 'utf8');
  for (const forbidden of ['docker build', 'docker pull', 'imagetools', 'builder-artifacts']) {
    assert.equal(packageJson.includes(forbidden), false, forbidden);
  }
});
