import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const adrPath = resolve(root, 'docs/decisions/0018-native-linux-independent-builders.md');
const evidencePath = resolve(root, 'docs/development/p3-linux-builder-boundary-evaluation.md');

test('accepted ADR 0018 fixes one exact builder input and two independent native executions', async () => {
  const adr = await readFile(adrPath, 'utf8');
  const normalized = adr.replace(/\s+/g, ' ');
  assert.match(adr, /\*\*Status:\*\* Accepted/);
  assert.match(adr, /\*\*Status updated:\*\* 2026-08-02T03:16:53-04:00/);
  for (const required of [
    'digest-pinned OCI builder image',
    'two separate',
    'no shared daemon',
    'pull policy `never`',
    'no QEMU',
    'all Linux capabilities dropped',
    'no Docker socket',
    'read-only input mounts',
    'failed network probe',
    'Any difference fails the candidate',
  ]) {
    assert.ok(normalized.includes(required), required);
  }
  assert.ok(normalized.includes('native `linux/amd64`'));
});

test('builder decision labels common trust and local emulation limitations honestly', async () => {
  const adr = await readFile(adrPath, 'utf8');
  const normalized = adr.replace(/\s+/g, ' ');
  for (const required of [
    'does not prove that the shared builder image is free of compromise',
    'Provider control-plane compromise remains a common trust dependency',
    'cannot count as builder A or B',
    'Schema registry v14 and runtime eligibility remain unchanged',
  ]) {
    assert.ok(normalized.includes(required), required);
  }
  assert.ok(normalized.includes('cannot set `physical_linux_builder_verified`'));
});

test('evaluation records the real local boundary without claiming a Linux proof', async () => {
  const evidence = await readFile(evidencePath, 'utf8');
  assert.match(evidence, /Docker client\/engine `29\.6\.1`/);
  assert.match(evidence, /Docker Desktop\n`4\.82\.0`/);
  assert.match(evidence, /Buildx `0\.35\.0-desktop\.2`/);
  assert.match(evidence, /`linux\/arm64` daemon/);
  assert.match(evidence, /No image was pulled, created, started, tagged, exported, or removed/);
  assert.match(evidence, /No native-amd64 Linux environment was allocated or executed/);
});

test('builder implementation and execution authority remain absent', async () => {
  for (const path of [
    'guest-build/builder/Dockerfile',
    'guest-build/builder-manifest.json',
    '.github/workflows/guest-build.yml',
  ]) {
    await assert.rejects(access(resolve(root, path)));
  }
  const packageJson = await readFile(resolve(root, 'package.json'), 'utf8');
  for (const forbidden of ['docker build', 'docker pull', 'guest-build', 'buildx']) {
    assert.equal(packageJson.includes(forbidden), false, forbidden);
  }
});
