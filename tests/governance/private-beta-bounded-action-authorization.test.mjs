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

test('bounded action authorization binds the exact three reviewed proposals', async () => {
  assert.equal(record.status, 'AUTHORIZED_NOT_CONSUMED');
  assert.equal(record.authorization_source, 'EXPLICIT_REPOSITORY_OWNER_MESSAGE_IN_CODEX_TASK');
  assert.equal(record.authorized_actions.length, 3);
  for (const action of record.authorized_actions) {
    assert.equal(
      sha256(await readFile(resolve(root, action.bound_record.path))),
      action.bound_record.sha256,
    );
    assert.equal(action.attempt_limit, 1);
    assert.equal(action.retry_allowed, false);
  }
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
