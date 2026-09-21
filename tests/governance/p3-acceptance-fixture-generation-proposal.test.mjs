import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { runCli } from '../../tools/dosai-acceptance/src/runner.mjs';
import { createSchemaValidator, requireValid } from '../../tools/dosai-acceptance/src/schema-validator.mjs';
import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const proposal = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-acceptance-fixture-generation-proposal.json',
)));
const catalog = parseStrictJson(await readFile(resolve(
  root,
  'docs/testing/acceptance-test-catalog-v5.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function readJson(path) {
  return parseStrictJson(await readFile(resolve(root, path)));
}

test('P3 fixture proposal binds current immutable inputs and exact proposed bytes', async () => {
  assert.equal(proposal.status, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.equal(proposal.scope, 'P3_FIXTURE_SCHEMA_AND_MANIFEST_DECLARATION_ONLY');
  for (const binding of proposal.preconditions) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256);
  }
  assert.equal(
    sha256(await readFile(resolve(root, proposal.proposed_artifacts.schema.path))),
    proposal.proposed_artifacts.schema.sha256,
  );
  for (const manifest of proposal.proposed_artifacts.manifests) {
    assert.equal(sha256(await readFile(resolve(root, manifest.path))), manifest.sha256);
  }
  assert.ok(Object.values(proposal.authorities).every(value => value === false));
});

test('proposed v4 schema validates exactly the three P3 manifests and catalog topology', async () => {
  const validator = await createSchemaValidator(root, [
    'docs/architecture/schemas/v1/common.schema.json',
    proposal.proposed_artifacts.schema.path,
  ]);
  let assertionCount = 0;
  for (const item of proposal.proposed_artifacts.manifests) {
    const manifest = await readJson(item.path);
    requireValid(validator, proposal.proposed_artifacts.schema.schema_id, manifest);
    assert.equal(manifest.status, 'PROPOSED');
    assert.deepEqual(manifest.runner, { id: 'dosai-acceptance', version: '0.3.0' });
    assert.deepEqual(manifest.platform_profiles, ['MACOS_ARM64_V1', 'LINUX_AMD64_V1']);
    const suite = catalog.suites.find(({ id }) => id === manifest.suite_id);
    assert.equal(suite.implementation_state, 'NOT_IMPLEMENTED');
    assert.equal(suite.fixture_manifest, item.path);
    assert.deepEqual(manifest.required_artifacts, suite.required_artifacts);
    assert.deepEqual(
      manifest.cases.map(({ mode, scenario_id: id }) => ({ id, mode })),
      suite.scenarios.map(({ id, mode }) => ({ id, mode })),
    );
    const assertionIds = new Set();
    for (const fixtureCase of manifest.cases) {
      assert.equal(
        fixtureCase.input_digest.value,
        createHash('sha256').update(`${fixtureCase.input_profile}\n`).digest('hex'),
      );
      for (const assertion of fixtureCase.assertions) {
        assert.equal(assertionIds.has(assertion.id), false, assertion.id);
        assertionIds.add(assertion.id);
        assertionCount += 1;
        assert.ok(assertion.artifact_classes.every(value => manifest.required_artifacts.includes(value)));
      }
    }
  }
  assert.equal(assertionCount, 27);
});

test('accepted v3 schema and current runner remain fail-closed for P3', async () => {
  const validator = await createSchemaValidator(root, [
    'docs/architecture/schemas/v1/common.schema.json',
    'docs/architecture/schemas/v3/acceptance-fixture-manifest.schema.json',
  ]);
  const proposed = await readJson('tests/acceptance/manifests/p3-at-001.json');
  assert.equal(
    validator.getSchema('urn:dosai:schema:acceptance-fixture-manifest:3')(proposed),
    false,
  );
  const result = await runCli([
    'run', '--catalog', 'docs/testing/acceptance-test-catalog-v5.json',
    '--suite', 'P3-AT-001', '--report-dir-env', 'DOSAI_EVIDENCE_DIR',
  ]);
  assert.deepEqual(result, {
    code: 'DOSAI_ACCEPTANCE_SUITE_NOT_IMPLEMENTED_0001',
    exitCode: 2,
  });
  assert.deepEqual(proposal.preserved_boundaries, {
    catalog_v5_changed: false,
    schema_registry_changed: false,
    runner_0_2_changed: false,
    suite_implementation_state_changed: false,
    accepted_fixture_changed: false,
    physical_prerequisite_bypassed: false,
    p3_execution_handler_present: false,
  });
});
