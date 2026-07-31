import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';

import {
  collectFiles,
  collectSourceFiles,
  importedModules,
  readImportedModules,
} from './source-graph.mjs';

const root = resolve(import.meta.dirname, '../..');
const sourceRoot = join(root, 'src');
const manifest = JSON.parse(
  await readFile(join(root, 'docs/architecture/process-ownership-v4.json'), 'utf8'),
);

function containsPath(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function boundaryForPath(path) {
  return manifest.source_boundaries.find((boundary) =>
    containsPath(join(root, boundary.path), path),
  );
}

test('every source root has one explicit ownership boundary', async () => {
  assert.equal(manifest.schema_version, 4);
  assert.equal(manifest.status, 'ACCEPTED');
  assert.deepEqual(manifest.accepted_adrs, [
    'docs/decisions/0001-runtime-and-privilege-boundaries.md',
    'docs/decisions/0002-typed-operations-policy-and-grants.md',
    'docs/decisions/0004-audit-journal-keys-and-anchoring.md',
    'docs/decisions/0012-secure-enclave-checkpoints-and-rekor-v2-anchoring.md',
  ]);
  assert.equal('proposed_adrs' in manifest, false);

  const sourceDirectories = (await readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const ownedDirectories = manifest.source_boundaries
    .map((boundary) => relative(sourceRoot, join(root, boundary.path)))
    .sort();

  assert.deepEqual(ownedDirectories, sourceDirectories);
  assert.equal(new Set(manifest.source_boundaries.map(({ id }) => id)).size, manifest.source_boundaries.length);

  for (const boundary of manifest.source_boundaries) {
    assert.equal(typeof boundary.component_owner, 'string');
    assert.notEqual(boundary.component_owner, '');
    assert.equal(boundary.may_hold_authority, false);
    assert.ok(boundary.allowed_first_party_imports.includes(boundary.id));
  }
});

test('accepted process ownership v1 remains byte-identical', async () => {
  const bytes = await readFile(join(root, 'docs/architecture/process-ownership-v1.json'));
  const v2 = JSON.parse(
    await readFile(join(root, 'docs/architecture/process-ownership-v2.json'), 'utf8'),
  );
  const { createHash } = await import('node:crypto');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '60552dfd6d0e7d3020b22b84716ff5a9a4e8880da516ca71956dd94923635c1f',
  );
  assert.equal(v2.supersedes.sha256, '60552dfd6d0e7d3020b22b84716ff5a9a4e8880da516ca71956dd94923635c1f');
});

test('accepted process ownership v2 remains byte-identical', async () => {
  const bytes = await readFile(join(root, 'docs/architecture/process-ownership-v2.json'));
  const v3 = JSON.parse(
    await readFile(join(root, 'docs/architecture/process-ownership-v3.json'), 'utf8'),
  );
  const { createHash } = await import('node:crypto');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'bc9fadd5f3e446ebc1935b488a338210c81409ef4092ba7ed6b2ebeeee22ab0e',
  );
  assert.equal(v3.supersedes.sha256, 'bc9fadd5f3e446ebc1935b488a338210c81409ef4092ba7ed6b2ebeeee22ab0e');
});

test('accepted process ownership v3 remains byte-identical', async () => {
  const bytes = await readFile(join(root, 'docs/architecture/process-ownership-v3.json'));
  const { createHash } = await import('node:crypto');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '403707ec24c938f0012891bccbef848db3bc87a3088d593953b5ff5a965cc4bf',
  );
  assert.equal(manifest.supersedes.sha256, '403707ec24c938f0012891bccbef848db3bc87a3088d593953b5ff5a965cc4bf');
});

test('policy boundary is pure, non-authoritative, and isolated from the application', () => {
  const policy = manifest.source_boundaries.find(({ id }) => id === 'policy');
  assert.equal(policy.trust_zone, 'Z4');
  assert.equal(policy.runtime, 'PURE_TESTED_LIBRARY');
  assert.equal(policy.may_hold_authority, false);
  assert.deepEqual(policy.allowed_first_party_imports, ['contracts', 'policy']);
  assert.deepEqual(policy.allowed_external_imports, []);

  for (const id of ['main', 'preload', 'renderer', 'workers']) {
    const boundary = manifest.source_boundaries.find((candidate) => candidate.id === id);
    assert.equal(boundary.allowed_first_party_imports.includes('policy'), false, id);
  }
});

test('source imports follow declared first-party and external allowlists', async () => {
  const sourceFiles = await collectSourceFiles(sourceRoot);

  for (const path of sourceFiles) {
    const owner = boundaryForPath(path);
    assert.ok(owner, `No ownership boundary for ${relative(root, path)}`);

    for (const specifier of await readImportedModules(path)) {
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(path), specifier);
        const targetOwner = boundaryForPath(target);
        assert.ok(targetOwner, `${relative(root, path)} imports unowned ${specifier}`);
        assert.ok(
          owner.allowed_first_party_imports.includes(targetOwner.id),
          `${owner.id} cannot import ${targetOwner.id}: ${relative(root, path)} -> ${specifier}`,
        );
      } else {
        assert.ok(
          owner.allowed_external_imports.includes(specifier),
          `${owner.id} cannot import external module ${specifier}: ${relative(root, path)}`,
        );
      }
    }
  }
});

test('worker and native-helper reservations expose no runtime capability', async () => {
  const workers = manifest.source_boundaries.find(({ id }) => id === 'workers');
  assert.equal(workers.implementation_state, 'NOT_IMPLEMENTED');
  assert.equal(workers.trust_zone, 'Z7');
  assert.equal(workers.may_hold_authority, false);

  const nativeHelperRoot = join(root, manifest.native_helper_root);
  const nativeFiles = await collectFiles(nativeHelperRoot);
  assert.deepEqual(
    nativeFiles
      .map((path) => relative(nativeHelperRoot, path))
      .filter((path) => !path.startsWith('audit/')),
    ['README.md'],
  );

  assert.deepEqual(
    manifest.native_helpers.map(({ trust_zone }) => trust_zone),
    ['Z4', 'Z5', 'Z6'],
  );
  for (const helper of manifest.native_helpers.filter(({ id }) => id !== 'audit-helper')) {
    assert.equal(helper.implementation_state, 'RESERVED');
    assert.ok(helper.path.startsWith(`${manifest.native_helper_root}/`));
    assert.notEqual(helper.component_owner, '');
  }
});

test('audit helper has journal and test-only checkpoint authority without network access', async () => {
  const helper = manifest.native_helpers.find(({ id }) => id === 'audit-helper');
  assert.equal(helper.trust_zone, 'Z6');
  assert.equal(helper.runtime, 'ISOLATED_NODE_SQLITE_AND_CRYPTO_PROOF');
  assert.equal(helper.implementation_state, 'ACTIVE');
  assert.equal(helper.authority, 'AUDIT_JOURNAL_WRITE_AND_TEST_ONLY_CHECKPOINT_PROOF');
  assert.deepEqual(helper.allowed_first_party_imports, ['audit-helper']);
  assert.deepEqual(
    helper.allowed_external_imports,
    ['node:crypto', 'node:fs', 'node:path', 'node:sqlite'],
  );

  const helperFiles = await collectSourceFiles(join(root, helper.path));
  for (const path of helperFiles) {
    for (const specifier of await readImportedModules(path)) {
      if (specifier.startsWith('.')) {
        assert.ok(containsPath(join(root, helper.path), resolve(dirname(path), specifier)));
      } else {
        assert.ok(helper.allowed_external_imports.includes(specifier), specifier);
      }
    }
  }

  for (const path of await collectSourceFiles(sourceRoot)) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /native-helpers\/audit/);
  }

  const helperSource = (await Promise.all(
    helperFiles.map((path) => readFile(path, 'utf8')),
  )).join('\n');
  assert.doesNotMatch(helperSource, /\bfetch\s*\(|node:https|node:http|child_process|node:net/);
  assert.doesNotMatch(helperSource, /createSecureEnclave|kSecAttrTokenIDSecureEnclave/);
});

test('source graph rejects uninspectable module loading', () => {
  assert.throws(
    () => importedModules('import(moduleName)', 'dynamic-import.ts'),
    /non-literal dynamic import/,
  );
  assert.throws(
    () => importedModules('require(moduleName)', 'dynamic-require.ts'),
    /non-literal require call/,
  );
});
