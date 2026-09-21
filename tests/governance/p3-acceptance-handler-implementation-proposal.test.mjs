import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const proposal = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-acceptance-handler-implementation-proposal.json',
)));
const catalog = parseStrictJson(await readFile(resolve(
  root,
  'docs/testing/acceptance-test-catalog-v5.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('P3 handler plan binds every exact current input and grants no authority', async () => {
  assert.equal(proposal.status, 'PROPOSED_SOURCE_PLAN_NOT_AUTHORIZED');
  assert.equal(proposal.scope, 'P3_ACCEPTANCE_RUNNER_0_3_HANDLER_AND_PREREQUISITE_PLAN_ONLY');
  for (const binding of proposal.inputs) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256);
  }
  assert.ok(Object.values(proposal.authorities).every(value => value === false));
  assert.deepEqual(proposal.current_assurance, {
    declared_suite_count: 3,
    declared_scenario_count: 6,
    declared_assertion_count: 27,
    acceptance_proven_assertion_count: 0,
    source_corpus_is_acceptance_evidence: false,
    physical_prerequisites_complete: false,
    runner_0_3_present: false,
    p3_handler_present: false,
  });
});

test('all 27 proposed P3 assertions are mapped once and remain unproven', async () => {
  const expected = [];
  for (const suite of catalog.suites.filter(({ phase }) => phase === 'P3')) {
    const manifest = parseStrictJson(await readFile(resolve(root, suite.fixture_manifest)));
    for (const fixtureCase of manifest.cases) {
      for (const assertion of fixtureCase.assertions) {
        expected.push(`${fixtureCase.scenario_id}:${assertion.id}`);
      }
    }
  }
  const planned = proposal.scenario_plans.flatMap(({ assertions, scenario_id: scenarioId }) =>
    assertions.map(assertion => `${scenarioId}:${assertion}`));
  assert.equal(planned.length, 27);
  assert.equal(new Set(planned).size, 27);
  assert.deepEqual([...planned].sort(), [...expected].sort());
  assert.ok(proposal.scenario_plans.every(({ acceptance_state }) => acceptance_state === 'UNPROVEN'));
  assert.ok(proposal.scenario_plans.every(({ source_coverage }) => source_coverage === 'PARTIAL'));
  assert.ok(proposal.scenario_plans.every(({ missing_evidence }) => missing_evidence.length > 0));
});

test('every source corpus path exists while future activation stays exact and additive', async () => {
  for (const scenario of proposal.scenario_plans) {
    for (const path of scenario.source_corpus) {
      assert.ok((await readFile(resolve(root, path))).length > 0, path);
    }
  }
  assert.deepEqual(proposal.future_change_set.modified_files, [
    'tools/dosai-acceptance/src/runner.mjs',
  ]);
  assert.equal(proposal.future_change_set.catalog_successor_marks_only_p3_suites_implemented, true);
  assert.equal(proposal.future_change_set.accepted_p1_p2_fixture_bytes_unchanged, true);
  assert.equal(proposal.future_change_set.proposal_manifest_bytes_unchanged, true);
  assert.equal(proposal.future_change_set.generic_command_or_shell_authority_allowed, false);
  assert.equal(
    proposal.next_gate,
    'PHYSICAL_PREREQUISITES_THEN_EXACT_OWNER_ACCEPTANCE_BEFORE_HANDLER_IMPLEMENTATION',
  );
});
