import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), 'utf8'));
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(join(root, path)))
    .digest('hex');
}

const paths = {
  catalogV1: 'docs/testing/acceptance-test-catalog-v1.json',
  catalogV2: 'docs/testing/acceptance-test-catalog-v2.json',
  catalogSchemaV1: 'docs/architecture/schemas/v1/acceptance-test-catalog.schema.json',
  catalogSchemaV2: 'docs/architecture/schemas/v2/acceptance-test-catalog.schema.json',
  evidenceSchemaV1: 'docs/architecture/schemas/v1/evidence-report.schema.json',
  evidenceSchemaV2: 'docs/architecture/schemas/v2/evidence-report.schema.json',
  registryV2: 'docs/architecture/schema-registry-v2.json',
  registryV3: 'docs/architecture/schema-registry-v3.json',
  relocation: 'docs/testing/acceptance-catalog-v1-to-v2-relocation.json',
};

const [catalogV1, catalogV2, catalogSchemaV2, evidenceSchemaV2, registryV3, relocation] =
  await Promise.all([
    readJson(paths.catalogV1),
    readJson(paths.catalogV2),
    readJson(paths.catalogSchemaV2),
    readJson(paths.evidenceSchemaV2),
    readJson(paths.registryV3),
    readJson(paths.relocation),
  ]);

function scenarioMap(catalog) {
  return new Map(
    catalog.suites.flatMap((suite) =>
      suite.scenarios.map((scenario) => [scenario.id, { ...scenario, phase: suite.phase }]),
    ),
  );
}

test('accepted catalog v1 lineage artifacts remain byte-identical', async () => {
  const expected = new Map([
    [paths.catalogV1, 'b633d4dfc92e4a83729ff53ecaa22617f87628b306843b45a68c2669acdf6b49'],
    [paths.catalogSchemaV1, 'ba04c632b9975cae6df77e2e8a3906136ab01026d33c7c22230d6a81ad8b3f91'],
    [paths.evidenceSchemaV1, 'a332c89891ce79e47e70b90fd986d5aadfddee913095a46d2c84613cc62bfb1e'],
    [paths.registryV2, '55baa29f867663748b3b252434f716f652fd9c2c28d99bb7e8e5dd6e417d0688'],
  ]);

  for (const [path, digest] of expected) {
    assert.equal(await sha256(path), digest, path);
  }
});

test('catalog v2 preserves suite identity and unrelated suite content', () => {
  assert.equal(catalogV2.schema_id, 'urn:dosai:schema:acceptance-test-catalog:2');
  assert.equal(catalogV2.schema_version, 2);
  assert.equal(catalogV2.catalog_version, 2);
  assert.equal(catalogV2.status, 'ACCEPTED');
  assert.equal(catalogV2.catalog_id, catalogV1.catalog_id);
  assert.equal(catalogV2.predecessor_catalog.path, paths.catalogV1);
  assert.equal(catalogV2.predecessor_catalog.sha256, relocation.predecessor.sha256);
  assert.equal(catalogV2.suites.length, 36);
  assert.deepEqual(
    catalogV2.suites.map(({ id }) => id),
    catalogV1.suites.map(({ id }) => id),
  );

  const allowedChanges = new Set([
    'P1-AT-001',
    'P1-AT-003',
    'P3-AT-003',
    'P7-AT-001',
    'P9-AT-002',
  ]);
  const v1Suites = new Map(catalogV1.suites.map((suite) => [suite.id, suite]));
  for (const suite of catalogV2.suites) {
    assert.equal(suite.implementation_state, 'NOT_IMPLEMENTED', suite.id);
    if (!allowedChanges.has(suite.id)) {
      assert.deepEqual(suite, v1Suites.get(suite.id), suite.id);
    }
  }
});

test('changed suites preserve gate scope and only add owner-phase coverage', () => {
  const v1Suites = new Map(catalogV1.suites.map((suite) => [suite.id, suite]));
  const stableFields = [
    'id',
    'phase',
    'title',
    'controls',
    'capabilities',
    'requirement_ids',
    'fixture_manifest',
    'required_artifacts',
    'timeout_seconds',
    'required_for_gate',
    'implementation_state',
  ];

  for (const id of ['P1-AT-001', 'P1-AT-003', 'P3-AT-003', 'P7-AT-001', 'P9-AT-002']) {
    const before = v1Suites.get(id);
    const after = catalogV2.suites.find((suite) => suite.id === id);
    for (const field of stableFields) {
      assert.deepEqual(after[field], before[field], `${id}.${field}`);
    }
    assert.ok(after.scenarios.length >= before.scenarios.length, id);
  }

  const p9Before = v1Suites.get('P9-AT-002').test_types;
  const p9After = catalogV2.suites.find(({ id }) => id === 'P9-AT-002').test_types;
  assert.deepEqual(p9After, [...p9Before.slice(0, 3), 'LOAD', ...p9Before.slice(3)]);
});

test('P1 tests present shell behavior and future authority absence only', () => {
  const requirements = catalogV2.suites
    .filter(({ phase }) => phase === 'P1')
    .flatMap(({ scenarios }) => scenarios.map(({ requirement }) => requirement))
    .join(' ');

  assert.doesNotMatch(requirements, /minimum and current|parser|stream|image|database worker/i);
  assert.match(requirements, /current registered MACOS_ARM64_V1 development host/);
  assert.match(requirements, /worker and execution authority remain absent/);
  assert.match(requirements, /typed bridge/);
  assert.match(requirements, /trusted-stop authority remain absent/);
});

test('every relocation has exact source and owner-phase target scenarios', async () => {
  const sourceScenarios = scenarioMap(catalogV1);
  const targetScenarios = scenarioMap(catalogV2);
  const coverageIds = relocation.relocations.map(({ coverage_id }) => coverage_id);

  assert.equal(new Set(coverageIds).size, coverageIds.length);
  assert.equal(relocation.predecessor.sha256, await sha256(paths.catalogV1));
  assert.equal(relocation.successor.sha256, await sha256(paths.catalogV2));
  assert.deepEqual(relocation.invariants, [
    'NO_REQUIREMENT_REMOVED',
    'NO_AUTHORITY_INTRODUCED_EARLY',
    'OWNER_PHASE_PROOF_REQUIRED',
    'RELEASE_MATRIX_PRESERVED',
    'VERSIONED_EVIDENCE_ISOLATION',
  ]);

  for (const item of relocation.relocations) {
    for (const id of item.from_scenarios) {
      assert.ok(sourceScenarios.has(id), `${item.coverage_id} source ${id}`);
    }
    for (const id of item.to_scenarios) {
      const target = targetScenarios.get(id);
      assert.ok(target, `${item.coverage_id} target ${id}`);
      assert.ok(item.owner_phases.includes(target.phase), `${item.coverage_id} owner ${target.phase}`);
    }
  }
});

test('relocated obligations remain explicit in their owning suites', () => {
  const scenarios = scenarioMap(catalogV2);

  assert.match(scenarios.get('P3-AT-003-S01').requirement, /independent watchdog still stops/);
  assert.match(scenarios.get('P3-AT-003-S02').requirement, /crashed workers/);
  assert.match(scenarios.get('P7-AT-001-S03').requirement, /database-worker fixtures/);
  assert.match(scenarios.get('P9-AT-002-S03').requirement, /parser, stream, and image-worker fixtures/);
  assert.match(scenarios.get('P11-AT-001-S01').requirement, /minimum and current physical Apple Silicon/);
});

test('v2 schemas and registry isolate v2 evidence from accepted v1 evidence', () => {
  assert.equal(catalogSchemaV2.$id, 'urn:dosai:schema:acceptance-test-catalog:2');
  assert.equal(catalogSchemaV2.properties.schema_version.const, 2);
  assert.equal(evidenceSchemaV2.$id, 'urn:dosai:schema:evidence-report:2');
  assert.equal(registryV3.registry_id, 'urn:dosai:schema-registry:3');
  assert.equal(registryV3.supersedes, 'urn:dosai:schema-registry:2');
  assert.equal(registryV3.status, 'ACCEPTED');
  const registrySchemas = new Map(registryV3.schemas.map((schema) => [schema.name, schema]));
  assert.equal(registrySchemas.get('acceptance-test-catalog').schema_id, catalogSchemaV2.$id);
  assert.equal(registrySchemas.get('evidence-report').schema_id, evidenceSchemaV2.$id);
  assert.equal(
    registrySchemas.get('acceptance-catalog-relocation').schema_id,
    relocation.schema_id,
  );
  assert.equal(evidenceSchemaV2.properties.catalog_version.const, 2);
  assert.equal(
    evidenceSchemaV2.$defs.subject.properties.schema_registry.const,
    'urn:dosai:schema-registry:3',
  );
  const commandArgs = evidenceSchemaV2.$defs.command.properties.args.prefixItems;
  assert.equal(commandArgs[4].const, paths.catalogV2);
  assert.equal(catalogV2.runner_contract.report_schema_id, evidenceSchemaV2.$id);
  assert.equal(catalogV2.runner_contract.fixed_args[4], paths.catalogV2);
});
