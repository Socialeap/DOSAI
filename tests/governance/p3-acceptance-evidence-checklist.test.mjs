import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(resolve(root, path));
const json = async path => parseStrictJson(await read(path));
const checklist = await json('docs/testing/p3-acceptance-evidence-checklist-v1.json');
const catalog = await json('docs/testing/acceptance-test-catalog-v5.json');
const plan = await json('docs/architecture/p3-acceptance-handler-implementation-proposal.json');
const expected = [];
for (const suite of catalog.suites.filter(suite => suite.phase === 'P3')) {
  const manifest = await json(suite.fixture_manifest);
  for (const fixtureCase of manifest.cases) {
    const scenario = plan.scenario_plans.find(value => value.scenario_id === fixtureCase.scenario_id);
    for (const assertion of fixtureCase.assertions) expected.push({
      occurrence: [suite.id, fixtureCase.scenario_id, fixtureCase.id, assertion.id],
      handler_id: fixtureCase.handler_id, artifact_classes: assertion.artifact_classes,
      missing_scenario_evidence: scenario.missing_evidence,
      artifact_state: 'NOT_COLLECTED', acceptance_state: 'UNPROVEN'
    });
  }
}

// Test-local document consistency check only. Never consumes receipts or validates acceptance.
function check(value) {
  assert.equal(value.status, 'PREPARED_SOURCE_ONLY_NOT_ACCEPTANCE_EVIDENCE');
  assert.equal(value.scope, 'DECLARED_ASSERTION_OCCURRENCE_AND_ARTIFACT_TRACEABILITY_ONLY');
  assert.equal(value.runtime_status, 'NO_GO');
  assert.equal(value.suite_count, 3);
  assert.equal(value.scenario_count, 6);
  assert.equal(value.assertion_occurrences, 27);
  assert.equal(value.acceptance_proven_occurrences, 0);
  assert.deepEqual(value.authorities, plan.authorities);
  assert.ok(Object.values(value.authorities).every(flag => flag === false));
  assert.deepEqual(value.rows, expected);
}

test('checklist binds exact unchanged proposal manifest catalog schema and runner bytes', async () => {
  assert.equal(checklist.record_type, 'P3_ACCEPTANCE_EVIDENCE_CHECKLIST');
  assert.equal(checklist.record_version, 1);
  check(checklist);
  const proposal = await json('docs/architecture/p3-acceptance-fixture-generation-proposal.json');
  assert.deepEqual(Object.keys(checklist.inputs).sort(), [
    'docs/testing/acceptance-test-catalog-v5.json',
    'docs/architecture/p3-acceptance-handler-implementation-proposal.json',
    'docs/architecture/p3-acceptance-fixture-generation-proposal.json',
    proposal.proposed_artifacts.schema.path, 'tools/dosai-acceptance/src/runner.mjs',
    ...proposal.proposed_artifacts.manifests.map(value => value.path)
  ].sort());
  for (const [path, digest] of Object.entries(checklist.inputs)) {
    assert.equal(createHash('sha256').update(await read(path)).digest('hex'), digest, path);
  }
});

test('all 27 occurrences retain exact artifact classes and scenario evidence gaps', () => {
  assert.equal(checklist.rows.length, 27);
  assert.equal(new Set(checklist.rows.map(row => JSON.stringify(row.occurrence))).size, 27);
  const repeated = checklist.rows.filter(row => row.occurrence[3] === 'P3_WORKTREE_REMAINS_CLEAN');
  assert.equal(repeated.length, 3);
  assert.equal(new Set(repeated.map(row => row.occurrence[1])).size, 3);
  assert.ok(repeated.every(row => row.artifact_classes.includes('CLEANUP')));
});

test('each occurrence rejects omissions duplicates scope shifts lost artifacts and invented acceptance', () => {
  for (let index = 0; index < expected.length; index++) {
    for (const alter of [
      value => { value.rows.splice(index, 1); },
      value => { value.rows.push(structuredClone(value.rows[index])); },
      value => { value.rows[index].occurrence[1] = 'P3-AT-999-S01'; },
      value => { value.rows[index].artifact_classes.pop(); },
      value => { value.rows[index].acceptance_state = 'PASS'; },
      value => { value.rows[index].artifact_state = 'VERIFIED'; }
    ]) {
      const value = structuredClone(checklist); alter(value);
      assert.throws(() => check(value), assert.AssertionError);
    }
  }
});

test('checklist cannot grant handler runner registration execution or acceptance authority', () => {
  for (const key of Object.keys(checklist.authorities)) {
    const value = structuredClone(checklist); value.authorities[key] = true;
    assert.throws(() => check(value), assert.AssertionError);
  }
  for (const alter of [value => { value.acceptance_proven_occurrences = 27; },
    value => { value.runtime_status = 'GO'; }, value => { value.status = 'ACCEPTED'; }]) {
    const value = structuredClone(checklist); alter(value);
    assert.throws(() => check(value), assert.AssertionError);
  }
  assert.ok(catalog.suites.filter(suite => suite.phase === 'P3').every(suite => suite.implementation_state === 'NOT_IMPLEMENTED'));
  assert.equal(plan.next_gate, 'PHYSICAL_PREREQUISITES_THEN_EXACT_OWNER_ACCEPTANCE_BEFORE_HANDLER_IMPLEMENTATION');
});
