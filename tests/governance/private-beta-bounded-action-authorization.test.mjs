import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/private-beta-bounded-action-authorization.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('bounded action authorization binds every reviewed proposal and replacement action', async () => {
  assert.equal(
    record.status,
    'AUTHORIZED_ACTIONS_CONSUMED_WITH_ONE_PASS_ONE_FAIL_ONE_PREPARED',
  );
  assert.equal(record.authorization_source, 'EXPLICIT_REPOSITORY_OWNER_MESSAGE_IN_CODEX_TASK');
  assert.equal(record.authorized_actions.length, 6);
  for (const action of record.authorized_actions) {
    assert.equal(
      sha256(await readFile(resolve(root, action.bound_record.path))),
      action.bound_record.sha256,
    );
    assert.equal(action.attempt_limit, 1);
    assert.equal(action.retry_allowed, false);
  }
  assert.deepEqual(
    record.authorized_actions.map(({ attempts_consumed }) => attempts_consumed),
    [1, 1, 0, 1, 1, 1],
  );
});

test('authorization preserves the zero-cost and no-production boundary', () => {
  assert.deepEqual(record.operational_constraints, {
    credit_ceiling: 120,
    maximum_charge_usd: 0,
    merge_authorized: false,
    production_use_authorized: false,
    real_execution_authorized: false,
    retry_authorized: false,
  });
  assert.deepEqual(record.stop_conditions, [
    'STOP_ON_FIRST_FAILURE_WITHOUT_RETRY',
    'STOP_ON_MISSING_OR_MALFORMED_RECEIPT',
    'STOP_BEFORE_ANY_PAID_ACTIVITY',
    'STOP_BEFORE_ANY_SCOPE_EXPANSION',
  ]);
});
