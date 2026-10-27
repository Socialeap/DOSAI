import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { p3EvidenceNegativeVectors } from '../fixtures/p3/acceptance-evidence-negative-vectors-v1.mjs';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(resolve(root, path));
const checklistBytes = await read('docs/testing/p3-acceptance-evidence-checklist-v1.json');
const rows = JSON.parse(checklistBytes).rows;
const faults = ['MISSING_ASSERTION', 'DUPLICATE_OCCURRENCE', 'CONTRADICTORY_OUTCOMES',
  'WRONG_SCENARIO', 'MISSING_ARTIFACT_CLASS', 'MALFORMED_ARTIFACT_REFERENCE'];
const key = value => JSON.stringify(value);

test('each declared occurrence has six explicitly synthetic negative vectors and cleanup reuse stays scoped', () => {
  const vectors = p3EvidenceNegativeVectors(rows);
  assert.equal(vectors.length, 165);
  for (const row of rows) {
    const own = vectors.filter(v => key(v.expected_occurrence) === key(row.occurrence));
    assert.deepEqual(own.filter(v => v.fault !== 'CROSS_SCENARIO_CLEANUP_REUSE').map(v => v.fault), faults);
  }
  for (const vector of vectors) {
    assert.equal(vector.fixture_only, true);
    assert.equal(vector.data_class, 'D5');
    assert.equal(vector.expected_disposition, 'REJECT_FIXTURE_ONLY');
    assert.equal(vector.acceptance_authorized, false);
    assert.deepEqual(vector.required_artifact_classes,
      rows.find(row => key(row.occurrence) === key(vector.expected_occurrence)).artifact_classes);
  }
  const reuse = vectors.filter(v => v.fault === 'CROSS_SCENARIO_CLEANUP_REUSE');
  assert.equal(reuse.length, 3);
  for (const vector of reuse) {
    const observed = vector.fragments[0];
    assert.equal(observed.occurrence[3], vector.expected_occurrence[3]);
    assert.notEqual(observed.occurrence[1], vector.expected_occurrence[1]);
    assert.ok(rows.some(row => key(row.occurrence) === key(observed.occurrence)));
    assert.ok(observed.artifacts.some(artifact => artifact.artifact_class === 'CLEANUP'));
  }
});

test('generated negatives contain the declared fault instead of a mislabeled valid fragment', () => {
  for (const vector of p3EvidenceNegativeVectors(rows)) {
    const [first, second] = vector.fragments;
    switch (vector.fault) {
      case 'MISSING_ASSERTION': assert.deepEqual(vector.fragments, []); break;
      case 'DUPLICATE_OCCURRENCE': assert.deepEqual(first, second); break;
      case 'CONTRADICTORY_OUTCOMES':
        assert.deepEqual(first.occurrence, second.occurrence);
        assert.equal(first.outcome, 'SYNTHETIC_SUCCESS');
        assert.equal(second.outcome, 'SYNTHETIC_FAILURE'); break;
      case 'WRONG_SCENARIO': case 'CROSS_SCENARIO_CLEANUP_REUSE':
        assert.notEqual(first.occurrence[1], vector.expected_occurrence[1]); break;
      case 'MISSING_ARTIFACT_CLASS':
        assert.equal(first.artifacts.length, vector.required_artifact_classes.length - 1);
        assert.ok(vector.required_artifact_classes.some(name => !first.artifacts.some(a => a.artifact_class === name))); break;
      case 'MALFORMED_ARTIFACT_REFERENCE': assert.equal(typeof first.artifacts[0].reference, 'number'); break;
      default: assert.fail('Unknown fault');
    }
  }
});

test('vector construction is deterministic independent and cannot mutate the merged source checklist', async () => {
  const before = key(rows), first = p3EvidenceNegativeVectors(rows), second = p3EvidenceNegativeVectors(rows);
  assert.deepEqual(first, second);
  first[0].expected_occurrence[0] = 'CHANGED';
  first[1].fragments[0].artifacts[0].reference = 'CHANGED';
  assert.equal(key(rows), before);
  assert.deepEqual(p3EvidenceNegativeVectors(rows), second);
  assert.deepEqual(await read('docs/testing/p3-acceptance-evidence-checklist-v1.json'), checklistBytes);
});

test('negative corpus remains test-only and preserves all pinned source boundaries', async () => {
  const record = JSON.parse(await read('docs/architecture/p3-acceptance-negative-vectors-source-record-v1.json'));
  assert.equal(record.runtime_status, 'NO_GO');
  assert.equal(record.acceptance_handler_implemented, false);
  assert.equal(record.receipt_rejection_behavior_tested, false);
  assert.equal(record.vector_count, 165);
  assert.equal(record.assertion_occurrences, 27);
  assert.deepEqual(record.authorities, JSON.parse(await read('docs/architecture/p3-acceptance-handler-implementation-proposal.json')).authorities);
  assert.ok(Object.values(record.authorities).every(value => value === false));
  for (const [path, digest] of Object.entries(record.inputs)) {
    assert.equal(createHash('sha256').update(await read(path)).digest('hex'), digest, path);
  }
  const source = (await read('tests/fixtures/p3/acceptance-evidence-negative-vectors-v1.mjs')).toString();
  assert.doesNotMatch(source, /\bimport\b|node:|fetch\(|process\.|writeFile|spawn\(|eval\(/);
  const { collectFiles, importedModules } = await import('../architecture/source-graph.mjs');
  for (const directory of ['src', 'tools/dosai-acceptance/src']) for (const path of await collectFiles(resolve(root, directory))) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    for (const name of importedModules((await readFile(path)).toString(), path)) assert.doesNotMatch(name, /acceptance-evidence-negative-vectors/);
  }
});
