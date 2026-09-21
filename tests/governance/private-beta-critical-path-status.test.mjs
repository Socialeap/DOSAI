import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { assessPrivateBetaReadiness } from '../../scripts/report-private-beta-readiness.mjs';
import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const checkpoint = parseStrictJson(await readFile(resolve(
  root,
  'docs/development/private-beta-critical-path-status.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('private-beta checkpoint binds the exact current critical-path inputs', async () => {
  assert.equal(checkpoint.release_status, 'NO_GO');
  assert.deepEqual(checkpoint.operational_constraints, {
    credit_ceiling: 120,
    paid_activity_authorized: false,
    merge_authorized: false,
    production_use_authorized: false,
  });
  assert.equal(checkpoint.validated_source_baseline.head, 'be65853e4f55e9563cd2e983909f21b1e3c43224');
  assert.equal(checkpoint.validated_source_baseline.source_validation.tests_passed, 555);
  assert.equal(checkpoint.fixture_overlay_validation.head, '0284f74d146f23581ab1833f817ac31883bcb96a');
  assert.equal(checkpoint.fixture_overlay_validation.tests_passed, 578);
  assert.equal(checkpoint.fixture_overlay_validation.integration_authorized, false);
  assert.equal(checkpoint.fixture_overlay_validation.integration_completed, false);
  for (const binding of checkpoint.bound_inputs) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256);
  }
});

test('critical-path report remains fail-closed until every required gate passes', async () => {
  const report = await assessPrivateBetaReadiness();
  assert.equal(report.ready, false);
  assert.equal(report.release_status, 'NO_GO');
  assert.equal(report.operational_credit_ceiling, 120);
  assert.equal(report.paid_activity_authorized, false);
  assert.deepEqual(report.blockers.map(({ id }) => id), [
    'BETA-CP-001',
    'BETA-CP-002',
    'BETA-CP-003',
    'BETA-CP-004',
    'BETA-CP-005',
    'BETA-CP-006',
  ]);
});

test('checkpoint never converts source or compatibility evidence into runtime authority', () => {
  assert.equal(checkpoint.validated_source_baseline.source_validation.tests_failed, 0);
  assert.equal(checkpoint.fixture_overlay_validation.tests_failed, 0);
  assert.equal(checkpoint.fixture_overlay_validation.provider_spend, 0);
  assert.ok(checkpoint.gates.every(({ status }) => status !== 'PASS'));
  assert.equal(checkpoint.gates.at(-1).status, 'NOT_READY');
});
