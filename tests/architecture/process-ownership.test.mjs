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
  await readFile(join(root, 'docs/architecture/process-ownership-v6.json'), 'utf8'),
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
  assert.equal(manifest.schema_version, 6);
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
  const v4 = JSON.parse(
    await readFile(join(root, 'docs/architecture/process-ownership-v4.json'), 'utf8'),
  );
  const { createHash } = await import('node:crypto');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '403707ec24c938f0012891bccbef848db3bc87a3088d593953b5ff5a965cc4bf',
  );
  assert.equal(v4.supersedes.sha256, '403707ec24c938f0012891bccbef848db3bc87a3088d593953b5ff5a965cc4bf');
});

test('accepted process ownership v4 remains byte-identical', async () => {
  const bytes = await readFile(join(root, 'docs/architecture/process-ownership-v4.json'));
  const v5 = JSON.parse(
    await readFile(join(root, 'docs/architecture/process-ownership-v5.json'), 'utf8'),
  );
  const { createHash } = await import('node:crypto');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '0d86608f3b71ce4b5af317d05978fb4d33c83c13df6ddb3f56e409fa967ea992',
  );
  assert.equal(v5.supersedes.sha256, '0d86608f3b71ce4b5af317d05978fb4d33c83c13df6ddb3f56e409fa967ea992');
});

test('accepted process ownership v5 remains byte-identical', async () => {
  const bytes = await readFile(join(root, 'docs/architecture/process-ownership-v5.json'));
  const { createHash } = await import('node:crypto');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '6417976e00bd8ea6db597f5020b8558ccb32244cb19e08469652d51469d53d87',
  );
  assert.equal(manifest.supersedes.sha256, '6417976e00bd8ea6db597f5020b8558ccb32244cb19e08469652d51469d53d87');
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
  const activeHelperRoots = manifest.native_helpers
    .filter(({ implementation_state }) => implementation_state === 'ACTIVE')
    .map(({ path }) => `${relative(nativeHelperRoot, join(root, path))}/`);
  assert.deepEqual(
    nativeFiles
      .map((path) => relative(nativeHelperRoot, path))
      .filter((path) => !activeHelperRoots.some((rootPath) => path.startsWith(rootPath))),
    ['README.md'],
  );

  assert.deepEqual(
    manifest.native_helpers.map(({ id }) => id),
    [
      'policy-helper',
      'grant-proof-helper',
      'effect-brokers',
      'audit-helper',
      'secure-enclave-proof-helper',
    ],
  );
  for (const helper of manifest.native_helpers.filter(
    ({ implementation_state }) => implementation_state === 'RESERVED',
  )) {
    assert.equal(helper.implementation_state, 'RESERVED');
    assert.ok(helper.path.startsWith(`${manifest.native_helper_root}/`));
    assert.notEqual(helper.component_owner, '');
  }
});

test('grant proof helper is test-only, no-effect, and unreachable from the application', async () => {
  const helper = manifest.native_helpers.find(({ id }) => id === 'grant-proof-helper');
  assert.equal(helper.trust_zone, 'Z4');
  assert.equal(helper.runtime, 'ISOLATED_NODE_SYNTHETIC_AUTHORIZATION_PROOF');
  assert.equal(helper.implementation_state, 'ACTIVE');
  assert.equal(
    helper.authority,
    'TEST_ONLY_OWNER_APPROVAL_AND_SINGLE_USE_NO_EFFECT_GRANT_PROOF',
  );
  assert.equal(helper.application_reachable, false);
  assert.equal(helper.effect_authority, false);
  assert.equal(helper.production_grant_authority, false);
  assert.equal(helper.network_authority, false);
  assert.deepEqual(
    helper.allowed_first_party_imports,
    ['contracts', 'policy', 'audit-helper', 'grant-proof-helper'],
  );
  assert.deepEqual(helper.allowed_external_imports, ['node:crypto']);

  const helperFiles = await collectSourceFiles(join(root, helper.path));
  const firstPartyOwner = (path) => {
    if (containsPath(join(root, 'src/contracts'), path)) return 'contracts';
    if (containsPath(join(root, 'src/policy'), path)) return 'policy';
    if (containsPath(join(root, 'native-helpers/audit'), path)) return 'audit-helper';
    if (containsPath(join(root, helper.path), path)) return 'grant-proof-helper';
    return null;
  };
  for (const path of helperFiles) {
    for (const specifier of await readImportedModules(path)) {
      if (specifier.startsWith('.')) {
        const owner = firstPartyOwner(resolve(dirname(path), specifier));
        assert.ok(owner, `${relative(root, path)} imports unowned ${specifier}`);
        assert.ok(helper.allowed_first_party_imports.includes(owner), owner);
      } else {
        assert.ok(helper.allowed_external_imports.includes(specifier), specifier);
      }
    }
  }

  for (const path of await collectSourceFiles(sourceRoot)) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /native-helpers\/grants/);
  }
  const helperSource = (await Promise.all(
    helperFiles.map((path) => readFile(path, 'utf8')),
  )).join('\n');
  assert.doesNotMatch(
    helperSource,
    /child_process|node:net|node:http|node:https|\bfetch\s*\(|\bspawn\s*\(|\bexec\s*\(/,
  );
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

test('Secure Enclave proof helper is packaged, bounded, and unreachable from the application', async () => {
  const helper = manifest.native_helpers.find(({ id }) => id === 'secure-enclave-proof-helper');
  assert.equal(helper.trust_zone, 'Z6');
  assert.equal(helper.runtime, 'PACKAGED_SWIFT_SECURITY_FRAMEWORK_PROOF');
  assert.equal(helper.implementation_state, 'ACTIVE');
  assert.equal(
    helper.authority,
    'OWNER_GATED_TRANSIENT_SECURE_ENCLAVE_TEST_KEY_LIFECYCLE_ONLY',
  );
  assert.equal(helper.application_reachable, false);
  assert.equal(helper.network_authority, false);
  assert.equal(helper.production_checkpoint_authority, false);
  assert.deepEqual(
    helper.allowed_external_imports,
    ['CryptoKit', 'Darwin', 'Foundation', 'LocalAuthentication', 'Security'],
  );

  const helperSource = await readFile(join(root, helper.path, 'main.swift'), 'utf8');
  const imports = [...helperSource.matchAll(/^import ([A-Za-z0-9_]+)$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, helper.allowed_external_imports);
  assert.doesNotMatch(helperSource, /URLSession|Network\.|CFNetwork|NWConnection|socket\s*\(/);
  assert.doesNotMatch(helperSource, /readToEnd|standardInput|sign-message|sign-digest/);
  assert.match(helperSource, /DOSAI-SECURE-ENCLAVE-LIFECYCLE-PROOF-V1/);
  assert.match(helperSource, /cleanup_confirmed/);

  for (const path of await collectSourceFiles(sourceRoot)) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /dosai-secure-enclave-proof|secure-enclave-proof/);
  }
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
