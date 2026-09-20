import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const evidencePath = resolve(
  root,
  'docs/development/p3-linux-builder-package-intent-evaluation.md',
);

const expectedPackages = [
  'bash',
  'bc',
  'binutils',
  'build-essential',
  'bzip2',
  'ca-certificates',
  'coreutils',
  'cpio',
  'debianutils',
  'diffutils',
  'file',
  'findutils',
  'g++',
  'gawk',
  'gcc',
  'gzip',
  'make',
  'patch',
  'perl',
  'python3',
  'rsync',
  'sed',
  'tar',
  'unzip',
  'wget',
  'xz-utils',
  'zstd',
];

function extractPackageIntent(evidence) {
  const match = evidence.match(
    /DIRECT_PACKAGE_INTENT_BEGIN\n(?<packages>[^`]+)DIRECT_PACKAGE_INTENT_END/,
  );
  assert.ok(match?.groups?.packages, 'canonical package-intent block');
  return match.groups.packages.trim().split('\n');
}

test('accepted registry v15 remains exact before package intent selection', async () => {
  const bytes = await readFile(resolve(root, 'docs/architecture/schema-registry-v15.json'));
  const registry = JSON.parse(bytes);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'ec122a0151e109bc9f84de7eeeef9667e68cccca214d578405b48ea7190ea76c',
  );
  assert.equal(registry.status, 'ACCEPTED');
  assert.equal(registry.registry_version, 15);
});

test('package intent is an exact sorted direct set', async () => {
  const evidence = await readFile(evidencePath, 'utf8');
  const packages = extractPackageIntent(evidence);
  assert.deepEqual(packages, expectedPackages);
  assert.deepEqual(packages, packages.toSorted());
  assert.equal(new Set(packages).size, packages.length);
});

test('Debian command mappings and deliberate exclusions are explicit', async () => {
  const evidence = await readFile(evidencePath, 'utf8');
  assert.match(evidence, /Buildroot `which` command \| `debianutils`/);
  assert.match(evidence, /Buildroot `awk` command \| `gawk`/);
  assert.match(evidence, /excludes `curl`, `git`, `gnupg`, `jq`, `syft`, and\n`diffoscope`/);
  for (const excluded of ['curl', 'git', 'gnupg', 'jq', 'syft', 'diffoscope']) {
    assert.equal(expectedPackages.includes(excluded), false, excluded);
  }
});

test('accepted package intent remains unresolved and non-authorizing', async () => {
  const evidence = await readFile(evidencePath, 'utf8');
  assert.match(evidence, /\*\*Status:\*\* `ACCEPTED`/);
  assert.match(evidence, /\*\*Accepted:\*\* `2026-08-02T15:32:27-04:00`/);
  assert.match(evidence, /package intent, not a package lock/);
  assert.match(evidence, /versions shown by the live Debian archive are\nobservations only/);
  assert.match(evidence, /builds remain network-denied and credential-free/);
  assert.match(evidence, /all builder preparation, package, closure, image, and runtime\nverification flags remain false/);
});

test('package intent adds no builder implementation, package, or local artifact', async () => {
  for (const path of [
    'guest-build/builder/Dockerfile',
    'guest-build/builder/build-policy.json',
    'guest-build/builder-manifest.json',
    'guest-build/builder-packages.lock.json',
    'builder-artifacts',
    '.github/workflows/guest-build.yml',
  ]) {
    await assert.rejects(access(resolve(root, path)));
  }
  const packageJson = await readFile(resolve(root, 'package.json'), 'utf8');
  for (const forbidden of [
    'apt-get',
    'apt download',
    'docker build',
    'docker pull',
    'builder-artifacts',
  ]) {
    assert.equal(packageJson.includes(forbidden), false, forbidden);
  }
});
