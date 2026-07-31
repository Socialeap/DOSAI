import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, mkdir, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { createEvidenceStore, prepareArtifact } from '../../tools/dosai-acceptance/src/evidence-store.mjs';
import {
  buildEvidenceBundle,
  parseCliArguments,
  runCli,
} from '../../tools/dosai-acceptance/src/runner.mjs';
import { createSchemaValidator, requireValid } from '../../tools/dosai-acceptance/src/schema-validator.mjs';
import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const paths = {
  catalogV2: 'docs/testing/acceptance-test-catalog-v2.json',
  catalogV3: 'docs/testing/acceptance-test-catalog-v3.json',
  catalogSchemaV2: 'docs/architecture/schemas/v2/acceptance-test-catalog.schema.json',
  catalogSchemaV3: 'docs/architecture/schemas/v3/acceptance-test-catalog.schema.json',
  commonSchema: 'docs/architecture/schemas/v1/common.schema.json',
  evidenceSchemaV2: 'docs/architecture/schemas/v2/evidence-report.schema.json',
  evidenceSchemaV3: 'docs/architecture/schemas/v3/evidence-report.schema.json',
  fixtureSchema: 'docs/architecture/schemas/v1/acceptance-fixture-manifest.schema.json',
  implementation: 'docs/testing/acceptance-catalog-v2-to-v3-implementation.json',
  implementationSchema: 'docs/architecture/schemas/v1/acceptance-catalog-implementation.schema.json',
  registryV3: 'docs/architecture/schema-registry-v3.json',
  registryV4: 'docs/architecture/schema-registry-v4.json',
};

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), 'utf8'));
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(join(root, path))).digest('hex');
}

const [catalogV2, catalogV3, implementation] = await Promise.all([
  readJson(paths.catalogV2),
  readJson(paths.catalogV3),
  readJson(paths.implementation),
]);

const runnerSourcePaths = [
  'tools/dosai-acceptance/bin/dosai-acceptance.mjs',
  'tools/dosai-acceptance/package.json',
  'tools/dosai-acceptance/src/canonical-json.mjs',
  'tools/dosai-acceptance/src/evidence-store.mjs',
  'tools/dosai-acceptance/src/fixed-process.mjs',
  'tools/dosai-acceptance/src/p1-suite.mjs',
  'tools/dosai-acceptance/src/runner.mjs',
  'tools/dosai-acceptance/src/schema-validator.mjs',
  'tools/dosai-acceptance/src/strict-json.mjs',
];

async function executableDigest() {
  const hash = createHash('sha256');
  for (const path of runnerSourcePaths) {
    hash.update(path);
    hash.update('\0');
    hash.update(await readFile(join(root, path)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

test('accepted v2 generation remains byte-identical', async () => {
  const immutable = new Map([
    [paths.catalogV2, '5fe489ee6695aa5c42c477173753bf3ef6e233f293e8925be4aebd633bc4a914'],
    [paths.catalogSchemaV2, 'ebe0ed80336f29d8496fbf86028bb0f6b83984b8351300fb5b55ce8f4de437b5'],
    [paths.evidenceSchemaV2, 'e87aa3ca1e2e9c93fb2cc182ebe91df12a957617a72a282390162eb90f06f7b6'],
    [paths.registryV3, '9ec57027a9f73bd20f776d7581eaf7f94e3bf3a22f210628aefc2f43eea5feea'],
  ]);
  for (const [path, digest] of immutable) {
    assert.equal(await sha256(path), digest, path);
  }
});

test('workspace addition preserves every accepted supply-chain policy', async () => {
  assert.equal(
    await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8'),
    `packages:
  - tools/*
allowBuilds:
  electron: true
blockExoticSubdeps: true
engineStrict: true
minimumReleaseAge: 1440
minimumReleaseAgeIgnoreMissingTime: false
minimumReleaseAgeStrict: true
preferFrozenLockfile: true
saveExact: true
strictPeerDependencies: true
trustLockfile: false
verifyStoreIntegrity: true
`,
  );
});

test('v3 changes only P1 implementation state and generation metadata', () => {
  assert.equal(catalogV3.status, 'ACCEPTED');
  assert.equal(catalogV3.catalog_id, catalogV2.catalog_id);
  assert.equal(catalogV3.catalog_version, 3);
  assert.equal(catalogV3.predecessor_catalog.path, paths.catalogV2);
  assert.equal(catalogV3.predecessor_catalog.sha256, implementation.predecessor.sha256);
  assert.deepEqual(
    catalogV3.suites.map(({ id }) => id),
    catalogV2.suites.map(({ id }) => id),
  );

  for (const [index, successor] of catalogV3.suites.entries()) {
    const predecessor = catalogV2.suites[index];
    if (/^P1-AT-00[1-3]$/.test(successor.id)) {
      assert.deepEqual(
        { ...successor, implementation_state: 'NOT_IMPLEMENTED' },
        predecessor,
        successor.id,
      );
      assert.equal(successor.implementation_state, 'IMPLEMENTED');
    } else {
      assert.deepEqual(successor, predecessor, successor.id);
    }
  }
});

test('v3 catalog, fixtures, and implementation manifest validate strictly', async () => {
  const validator = await createSchemaValidator(root, [
    paths.commonSchema,
    paths.catalogSchemaV3,
    paths.evidenceSchemaV3,
    paths.fixtureSchema,
    paths.implementationSchema,
  ]);
  requireValid(validator, 'urn:dosai:schema:acceptance-test-catalog:3', catalogV3);
  requireValid(validator, 'urn:dosai:schema:acceptance-catalog-implementation:1', implementation);
  assert.equal(implementation.status, 'ACCEPTED');

  const implementedIds = catalogV3.suites
    .filter(({ implementation_state: state }) => state === 'IMPLEMENTED')
    .map(({ id }) => id);
  assert.deepEqual(implementedIds, ['P1-AT-001', 'P1-AT-002', 'P1-AT-003']);
  assert.deepEqual(
    implementation.implementations.map(({ suite_id: id }) => id),
    implementedIds,
  );
  assert.equal(implementation.successor.sha256, await sha256(paths.catalogV3));
  assert.equal(implementation.runner.package_digest.value, await sha256(implementation.runner.package_path));
  assert.equal(implementation.runner.dependency_lock_digest.value, await sha256('pnpm-lock.yaml'));
  assert.equal(implementation.runner.workspace_config_digest.value, await sha256('pnpm-workspace.yaml'));
  assert.equal(implementation.runner.executable_digest.value, await executableDigest());

  for (const schema of implementation.schemas) {
    assert.equal(schema.sha256, await sha256(schema.path), schema.path);
  }

  for (const item of implementation.implementations) {
    const fixture = await readJson(item.fixture_manifest);
    requireValid(validator, 'urn:dosai:schema:acceptance-fixture-manifest:1', fixture);
    assert.equal(fixture.status, 'ACCEPTED');
    assert.equal(item.fixture_status, fixture.status);
    assert.equal(item.fixture_digest.value, await sha256(item.fixture_manifest));

    const suite = catalogV3.suites.find(({ id }) => id === item.suite_id);
    assert.deepEqual(fixture.required_artifacts, suite.required_artifacts);
    assert.deepEqual(
      fixture.cases.map(({ scenario_id: id }) => id),
      suite.scenarios.map(({ id }) => id),
    );
    for (const fixtureCase of fixture.cases) {
      assert.equal(
        fixtureCase.input_digest.value,
        createHash('sha256').update(`${fixtureCase.input_profile}\n`).digest('hex'),
      );
    }
  }
});

test('registry v4 points to the implemented generation without changing v3', async () => {
  const registry = await readJson(paths.registryV4);
  assert.equal(registry.registry_id, 'urn:dosai:schema-registry:4');
  assert.equal(registry.supersedes, 'urn:dosai:schema-registry:3');
  assert.equal(registry.status, 'ACCEPTED');
  const schemas = new Map(registry.schemas.map((schema) => [schema.name, schema]));
  assert.equal(
    schemas.get('acceptance-test-catalog').schema_id,
    'urn:dosai:schema:acceptance-test-catalog:3',
  );
  assert.equal(
    schemas.get('evidence-report').schema_id,
    'urn:dosai:schema:evidence-report:3',
  );
  assert.equal(
    schemas.get('acceptance-fixture-manifest').schema_id,
    'urn:dosai:schema:acceptance-fixture-manifest:1',
  );
  assert.equal(
    schemas.get('acceptance-catalog-implementation').schema_id,
    implementation.schema_id,
  );
});

test('simulated passing execution assembles schema-valid, complete evidence', async () => {
  const fixturePath = 'tests/acceptance/manifests/p1-at-001.json';
  const fixture = await readJson(fixturePath);
  const fixtureBytes = await readFile(join(root, fixturePath));
  const catalogBytes = await readFile(join(root, paths.catalogV3));
  const suite = catalogV3.suites.find(({ id }) => id === fixture.suite_id);
  const results = new Map(
    fixture.cases.flatMap(({ assertions }) =>
      assertions.map(({ id }) => [id, { pass: true }]),
    ),
  );
  const digest = { algorithm: 'SHA-256', value: 'a'.repeat(64) };
  const simulation = {
    catalog: catalogV3,
    catalogBytes,
    catalogPath: paths.catalogV3,
    dependencyLockBytes: Buffer.from('simulated-lock\n'),
    environment: {
      architecture: 'arm64',
      components: {
        app: '0.1.0',
        chromium: '144.0.0.0',
        electron: '43.2.0',
        git: '2.50.1',
        node: '24.18.0',
        v8: '14.4.0',
      },
      hardware_model: 'Mac15,7',
      macos_build: '24G90',
      macos_version: '15.6',
      platform_profile: 'MACOS_ARM64_V1',
    },
    executableDigest: digest,
    execution: { packageDigest: digest, results },
    finished: 1_753_996_900_100,
    fixture,
    fixtureBytes,
    headCommit: 'b'.repeat(40),
    policy: {
      evidenceSchemaId: 'urn:dosai:schema:evidence-report:3',
      registryId: 'urn:dosai:schema-registry:4',
    },
    started: 1_753_996_900_000,
    suite,
    suiteId: suite.id,
    worktreeClean: true,
  };
  const bundle = buildEvidenceBundle(simulation);

  const validator = await createSchemaValidator(root, [
    paths.commonSchema,
    paths.evidenceSchemaV3,
  ]);
  requireValid(validator, 'urn:dosai:schema:evidence-report:3', bundle.report);
  assert.equal(bundle.result, 'PASS');
  assert.equal(bundle.exitCode, 0);
  assert.equal(bundle.secretScanPassed, true);
  assert.deepEqual(
    bundle.report.artifacts.map(({ artifact_class: artifactClass }) => artifactClass),
    suite.required_artifacts.filter((artifactClass) => artifactClass !== 'REPORT'),
  );
  assert.equal(bundle.report.assertions.every(({ result }) => result === 'PASS'), true);
  assert.equal(bundle.report.scenarios.every(({ result }) => result === 'PASS'), true);
  assert.equal(bundle.report.cleanup.result, 'PASS');
  assert.deepEqual(bundle.report.gaps, []);

  results.set('P1_PACKAGE_BUILD_VERIFIED', { pass: false });
  const failed = buildEvidenceBundle({
    ...simulation,
    execution: {
      errorCode: 'DOSAI_P1_EXECUTION_FAILED_0001',
      packageDigest: digest,
      results,
    },
  });
  requireValid(validator, 'urn:dosai:schema:evidence-report:3', failed.report);
  assert.equal(failed.result, 'FAIL');
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.report.assertions[0].result, 'FAIL');
  assert.equal(failed.report.scenarios[0].result, 'FAIL');
  assert.deepEqual(failed.report.gaps, ['DOSAI_P1_EXECUTION_FAILED_0001']);
});

test('runner rejects unknown arguments and unimplemented accepted v2 suites', async () => {
  assert.throws(
    () => parseCliArguments(['run', '--catalog', paths.catalogV3]),
    /CLI_ARGUMENTS_REJECTED/,
  );
  const unknownCatalog = await runCli([
    'run', '--catalog', '../../outside.json', '--suite', 'P1-AT-001',
    '--report-dir-env', 'DOSAI_EVIDENCE_DIR',
  ]);
  assert.deepEqual(unknownCatalog, {
    code: 'DOSAI_ACCEPTANCE_CONTRACT_REJECTED_0001',
    exitCode: 2,
  });

  const unimplemented = await runCli([
    'run', '--catalog', paths.catalogV2, '--suite', 'P1-AT-001',
    '--report-dir-env', 'DOSAI_EVIDENCE_DIR',
  ]);
  assert.deepEqual(unimplemented, {
    code: 'DOSAI_ACCEPTANCE_SUITE_NOT_IMPLEMENTED_0001',
    exitCode: 2,
  });
});

test('strict JSON rejects duplicate keys, BOM, and negative zero', () => {
  assert.throws(() => parseStrictJson(Buffer.from('{"a":1,"a":2}')));
  assert.throws(() => parseStrictJson(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])));
  assert.throws(() => parseStrictJson(Buffer.from('{"value":-0}')), /INVALID_JSON_NUMBER/);
});

test('evidence store rejects a symbolic-link root before writing outside the repository', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dosai-evidence-store-'));
  const repository = join(base, 'repository');
  const outside = join(base, 'outside');
  await Promise.all([mkdir(repository, { mode: 0o700 }), mkdir(outside, { mode: 0o700 })]);
  await symlink(outside, join(repository, 'evidence'));
  const canonicalRepository = await realpath(repository);

  try {
    await assert.rejects(
      createEvidenceStore(
        canonicalRepository,
        join(canonicalRepository, 'evidence', 'acceptance'),
        'P1-AT-001',
        '758f0bc1-33bc-40bd-92d4-524c9f98f8ac',
      ),
      /EVIDENCE_ROOT_TYPE_REJECTED/,
    );
    assert.deepEqual(await lstat(join(outside, 'acceptance')).catch(() => null), null);
  } finally {
    await rm(base, { force: true, recursive: true });
  }
});

test('artifact preparation is canonical, bounded metadata only', () => {
  const prepared = prepareArtifact(
    'ASSERTIONS',
    'd92c3724-e99e-4243-b7f1-6b3f709a5083',
    { artifact_class: 'ASSERTIONS', result: 'PASS' },
  );
  assert.equal(prepared.descriptor.availability, 'AVAILABLE');
  assert.equal(prepared.descriptor.data_class, 'D2');
  assert.equal(prepared.descriptor.byte_length, Buffer.byteLength(prepared.bytes));
  assert.equal(prepared.bytes, '{"artifact_class":"ASSERTIONS","result":"PASS"}\n');
});
