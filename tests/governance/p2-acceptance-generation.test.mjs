import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildEvidenceBundle,
  runCli,
} from '../../tools/dosai-acceptance/src/runner.mjs';
import { executeP2Suite } from '../../tools/dosai-acceptance/src/p2-suite.mjs';
import { createSchemaValidator, requireValid } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const catalogV4Path = 'docs/testing/acceptance-test-catalog-v4.json';
const catalogV5Path = 'docs/testing/acceptance-test-catalog-v5.json';
const implementationPath = 'docs/testing/acceptance-catalog-v4-to-v5-implementation.json';
const fixturePaths = [
  'tests/acceptance/manifests/p1-at-001-v3.json',
  'tests/acceptance/manifests/p1-at-002-v3.json',
  'tests/acceptance/manifests/p1-at-003-v3.json',
  'tests/acceptance/manifests/p2-at-001-v3.json',
  'tests/acceptance/manifests/p2-at-002-v3.json',
  'tests/acceptance/manifests/p2-at-003-v3.json',
];
const schemaPaths = {
  catalog: 'docs/architecture/schemas/v5/acceptance-test-catalog.schema.json',
  common: 'docs/architecture/schemas/v1/common.schema.json',
  evidence: 'docs/architecture/schemas/v5/evidence-report.schema.json',
  fixture: 'docs/architecture/schemas/v3/acceptance-fixture-manifest.schema.json',
  implementation: 'docs/architecture/schemas/v2/acceptance-catalog-implementation.schema.json',
};
const runnerSourcePaths = [
  'tools/dosai-acceptance/bin/dosai-acceptance.mjs',
  'tools/dosai-acceptance/package.json',
  'tools/dosai-acceptance/src/canonical-json.mjs',
  'tools/dosai-acceptance/src/evidence-store.mjs',
  'tools/dosai-acceptance/src/fixed-process.mjs',
  'tools/dosai-acceptance/src/p1-suite.mjs',
  'tools/dosai-acceptance/src/p2-suite.mjs',
  'tools/dosai-acceptance/src/runner.mjs',
  'tools/dosai-acceptance/src/schema-validator.mjs',
  'tools/dosai-acceptance/src/strict-json.mjs',
];

async function bytes(path) {
  return readFile(resolve(root, path));
}

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

async function sha256(path) {
  return createHash('sha256').update(await bytes(path)).digest('hex');
}

async function executableDigest() {
  const hash = createHash('sha256');
  for (const path of runnerSourcePaths) {
    hash.update(path);
    hash.update('\0');
    hash.update(await bytes(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function contractWithoutIdentity(fixture) {
  const {
    schema_id: _schemaId,
    schema_version: _schemaVersion,
    manifest_id: _manifestId,
    created_at: _createdAt,
    catalog_version: _catalogVersion,
    fixture_version: _fixtureVersion,
    status: _status,
    runner: _runner,
    ...contract
  } = fixture;
  return contract;
}

function simulatedEnvironment(runtime = {}) {
  return {
    architecture: 'arm64',
    components: {
      app: '0.1.0',
      git: '2.50.1',
      node: '24.18.0',
      ...runtime,
    },
    hardware_model: 'Mac15,7',
    macos_build: '24G90',
    macos_version: '15.6',
    platform_profile: 'MACOS_ARM64_V1',
  };
}

test('catalog v5 changes only fixture identity and P2 implementation state', async () => {
  const [catalogV4, catalogV5, implementation] = await Promise.all([
    json(catalogV4Path),
    json(catalogV5Path),
    json(implementationPath),
  ]);

  assert.equal(catalogV5.status, 'ACCEPTED');
  assert.equal(catalogV5.catalog_id, catalogV4.catalog_id);
  assert.equal(catalogV5.catalog_version, 5);
  assert.equal(catalogV5.predecessor_catalog.path, catalogV4Path);
  assert.equal(catalogV5.predecessor_catalog.sha256, await sha256(catalogV4Path));
  assert.equal(implementation.status, 'ACCEPTED');
  assert.equal(implementation.successor.sha256, await sha256(catalogV5Path));

  for (const [index, successor] of catalogV5.suites.entries()) {
    const predecessor = catalogV4.suites[index];
    if (/^P1-AT-00[1-3]$/.test(successor.id)) {
      assert.deepEqual(
        { ...successor, fixture_manifest: predecessor.fixture_manifest },
        predecessor,
        successor.id,
      );
    } else if (/^P2-AT-00[1-3]$/.test(successor.id)) {
      assert.deepEqual(
        {
          ...successor,
          fixture_manifest: predecessor.fixture_manifest,
          implementation_state: predecessor.implementation_state,
        },
        predecessor,
        successor.id,
      );
      assert.equal(successor.implementation_state, 'IMPLEMENTED');
    } else {
      assert.deepEqual(successor, predecessor, successor.id);
    }
  }
});

test('accepted schemas, fixtures, digests, and registry v10 are internally exact', async () => {
  const validator = await createSchemaValidator(root, [
    schemaPaths.common,
    schemaPaths.catalog,
    schemaPaths.evidence,
    schemaPaths.fixture,
    schemaPaths.implementation,
  ]);
  const [catalog, implementation, registry] = await Promise.all([
    json(catalogV5Path),
    json(implementationPath),
    json('docs/architecture/schema-registry-v10.json'),
  ]);
  requireValid(validator, 'urn:dosai:schema:acceptance-test-catalog:5', catalog);
  requireValid(validator, 'urn:dosai:schema:acceptance-catalog-implementation:2', implementation);

  assert.equal(implementation.runner.package_digest.value, await sha256('tools/dosai-acceptance/package.json'));
  assert.equal(implementation.runner.executable_digest.value, await executableDigest());
  assert.equal(implementation.runner.dependency_lock_digest.value, await sha256('pnpm-lock.yaml'));
  assert.equal(implementation.runner.workspace_config_digest.value, await sha256('pnpm-workspace.yaml'));
  for (const schema of implementation.schemas) {
    assert.equal(schema.sha256, await sha256(schema.path), schema.path);
  }

  for (const item of implementation.fixtures) {
    const fixture = await json(item.path);
    requireValid(validator, 'urn:dosai:schema:acceptance-fixture-manifest:3', fixture);
    assert.equal(fixture.status, 'ACCEPTED');
    assert.equal(item.status, fixture.status);
    assert.equal(item.sha256, await sha256(item.path));
    assert.deepEqual(fixture.runner, { id: 'dosai-acceptance', version: '0.2.0' });
    const suite = catalog.suites.find(({ id }) => id === item.suite_id);
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

  for (const suiteId of ['P1-AT-001', 'P1-AT-002', 'P1-AT-003']) {
    const oldFixture = await json(`tests/acceptance/manifests/${suiteId.toLowerCase()}-v2.json`);
    const newFixture = await json(`tests/acceptance/manifests/${suiteId.toLowerCase()}-v3.json`);
    assert.deepEqual(contractWithoutIdentity(newFixture), contractWithoutIdentity(oldFixture), suiteId);
  }

  assert.equal(registry.registry_id, 'urn:dosai:schema-registry:10');
  assert.equal(registry.supersedes, 'urn:dosai:schema-registry:9');
  assert.equal(registry.status, 'ACCEPTED');
  const registered = new Map(registry.schemas.map((schema) => [schema.name, schema.schema_id]));
  assert.equal(registered.get('acceptance-test-catalog'), 'urn:dosai:schema:acceptance-test-catalog:5');
  assert.equal(registered.get('evidence-report'), 'urn:dosai:schema:evidence-report:5');
  assert.equal(registered.get('acceptance-fixture-manifest'), 'urn:dosai:schema:acceptance-fixture-manifest:3');
  assert.equal(registered.get('acceptance-catalog-implementation'), 'urn:dosai:schema:acceptance-catalog-implementation:2');
});

test('P2 handlers execute adversarial corpora and assemble complete schema-valid evidence', async () => {
  const validator = await createSchemaValidator(root, [schemaPaths.common, schemaPaths.evidence]);
  const catalog = await json(catalogV5Path);
  const catalogBytes = await bytes(catalogV5Path);
  const executable = { algorithm: 'SHA-256', value: await executableDigest() };

  for (const suiteId of ['P2-AT-001', 'P2-AT-002', 'P2-AT-003']) {
    const suite = catalog.suites.find(({ id }) => id === suiteId);
    const fixturePath = `tests/acceptance/manifests/${suiteId.toLowerCase()}-v3.json`;
    const fixture = await json(fixturePath);
    const fixtureBytes = await bytes(fixturePath);
    const execution = await executeP2Suite(root, suiteId);
    assert.equal(execution.errorCode, undefined, suiteId);
    assert.equal(execution.journal.assurance, 'LOCAL_DURABLE');
    assert.equal(execution.journal.limitations.includes('UNANCHORED'), true);
    assert.equal(execution.verifier.assurance_ranges.hardware_key, 'DEFERRED_EXTERNAL');
    assert.equal(execution.verifier.assurance_ranges.external_anchor, 'DEFERRED_EXTERNAL');
    assert.equal(execution.corpusManifest.length > 0, true);
    assert.equal(execution.operationTimeoutMs, 120000);
    assert.equal(new Set(execution.corpusManifest.map(({ path }) => path)).size, execution.corpusManifest.length);
    for (const entry of execution.corpusManifest) {
      assert.equal(entry.digest.value, await sha256(entry.path));
    }
    execution.results.set('P2_WORKTREE_REMAINS_CLEAN', Object.freeze({ pass: true }));

    const bundle = buildEvidenceBundle({
      catalog,
      catalogBytes,
      catalogPath: catalogV5Path,
      dependencyLockBytes: Buffer.from('simulated-lock\n'),
      environment: simulatedEnvironment(execution.runtime),
      executableDigest: executable,
      execution,
      finished: 1_754_014_500_100,
      fixture,
      fixtureBytes,
      headCommit: 'b'.repeat(40),
      policy: {
        evidenceSchemaId: 'urn:dosai:schema:evidence-report:5',
        registryId: 'urn:dosai:schema-registry:10',
      },
      started: 1_754_014_500_000,
      suite,
      suiteId,
      worktreeClean: true,
    });
    requireValid(validator, 'urn:dosai:schema:evidence-report:5', bundle.report);
    assert.equal(bundle.result, 'PASS', suiteId);
    assert.equal(bundle.secretScanPassed, true, suiteId);
    assert.equal(bundle.report.cleanup.result, 'PASS', suiteId);
    assert.equal(bundle.report.external_effects.observed, 'NONE', suiteId);
    assert.equal(bundle.report.environment.components.node, process.versions.node, suiteId);
    assert.equal(bundle.report.environment.components.v8, process.versions.v8, suiteId);
    assert.equal(bundle.report.environment.components.sqlite, process.versions.sqlite, suiteId);
    assert.deepEqual(
      bundle.report.artifacts.map(({ artifact_class: artifactClass }) => artifactClass),
      suite.required_artifacts.filter((artifactClass) => artifactClass !== 'REPORT'),
    );
    const journalArtifact = bundle.preparedArtifacts.find(
      ({ descriptor }) => descriptor.artifact_class === 'JOURNAL',
    );
    assert.equal(JSON.parse(journalArtifact.bytes).journal.assurance, 'LOCAL_DURABLE');
    const manifestArtifact = bundle.preparedArtifacts.find(
      ({ descriptor }) => descriptor.artifact_class === 'MANIFEST',
    );
    assert.deepEqual(JSON.parse(manifestArtifact.bytes).corpus, execution.corpusManifest);
    const commandArtifact = bundle.preparedArtifacts.find(
      ({ descriptor }) => descriptor.artifact_class === 'COMMAND',
    );
    assert.equal(JSON.parse(commandArtifact.bytes).operation_timeout_ms, 120000);
    if (suiteId === 'P2-AT-003') {
      const verifierArtifact = bundle.preparedArtifacts.find(
        ({ descriptor }) => descriptor.artifact_class === 'VERIFIER',
      );
      assert.equal(
        JSON.parse(verifierArtifact.bytes).verifier.result,
        'PASS_WITH_EXTERNAL_LIMITATIONS',
      );
    }
  }
});

test('P2 evidence fails closed on a missing assertion or leaked secret canary', async () => {
  const catalog = await json(catalogV5Path);
  const suite = catalog.suites.find(({ id }) => id === 'P2-AT-001');
  const fixturePath = 'tests/acceptance/manifests/p2-at-001-v3.json';
  const fixture = await json(fixturePath);
  const fixtureBytes = await bytes(fixturePath);
  const execution = await executeP2Suite(root, suite.id);
  execution.results.delete('P2_POLICY_TIER_MATRIX_VERIFIED');
  execution.results.set('P2_WORKTREE_REMAINS_CLEAN', Object.freeze({ pass: true }));
  const common = {
    catalog,
    catalogBytes: await bytes(catalogV5Path),
    catalogPath: catalogV5Path,
    dependencyLockBytes: Buffer.from('simulated-lock\n'),
    environment: simulatedEnvironment(),
    executableDigest: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
    finished: 1_754_014_500_100,
    fixture,
    fixtureBytes,
    headCommit: 'b'.repeat(40),
    policy: {
      evidenceSchemaId: 'urn:dosai:schema:evidence-report:5',
      registryId: 'urn:dosai:schema-registry:10',
    },
    started: 1_754_014_500_000,
    suite,
    suiteId: suite.id,
    worktreeClean: true,
  };
  const missing = buildEvidenceBundle({ ...common, execution });
  assert.equal(missing.result, 'FAIL');
  assert.equal(
    missing.report.assertions.find(({ id }) => id === 'P2_POLICY_TIER_MATRIX_VERIFIED').result,
    'FAIL',
  );

  const canary = execution.secretCanaries[0];
  const leaked = buildEvidenceBundle({
    ...common,
    execution: {
      ...execution,
      journal: { ...execution.journal, leaked_value: canary },
    },
  });
  assert.equal(leaked.secretScanPassed, false);
});

test('accepted v5 is runnable while obsolete v4 remains rejected', async () => {
  const obsolete = await runCli([
    'run', '--catalog', catalogV4Path, '--suite', 'P2-AT-001',
    '--report-dir-env', 'DOSAI_EVIDENCE_DIR',
  ]);
  assert.deepEqual(obsolete, {
    code: 'DOSAI_ACCEPTANCE_CONTRACT_NOT_ACCEPTED_0001',
    exitCode: 2,
  });
  const unimplemented = await runCli([
    'run', '--catalog', catalogV5Path, '--suite', 'P3-AT-001',
    '--report-dir-env', 'DOSAI_EVIDENCE_DIR',
  ]);
  assert.deepEqual(unimplemented, {
    code: 'DOSAI_ACCEPTANCE_SUITE_NOT_IMPLEMENTED_0001',
    exitCode: 2,
  });
  await assert.rejects(executeP2Suite(root, 'P2-AT-999'), /P2_SUITE_REJECTED/);
});

test('fixture path set is exact and no ungoverned P2 manifest exists', async () => {
  const implementation = await json(implementationPath);
  assert.deepEqual(implementation.fixtures.map(({ path }) => path), fixturePaths);
  assert.deepEqual(
    implementation.implementations.map(({ suite_id: id }) => id),
    ['P2-AT-001', 'P2-AT-002', 'P2-AT-003'],
  );
});
