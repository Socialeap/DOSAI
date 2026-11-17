import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { createFixtureHandoff, readFixtureHandoff } from '../../tools/supervised-execution/handoff.mjs';

const root = resolve(import.meta.dirname, '../..');
const prefix = 'dosai-fixture-handoff-v1:';

test('both fixture requests round-trip as closed versioned tokens', () => {
  for (const action of ['SUMMARIZE_FIXTURE', 'LIST_FIXTURE_FAILURES']) {
    const token = createFixtureHandoff(action);
    assert.equal(token, prefix + action);
    const request = readFixtureHandoff(token);
    assert.deepEqual({ ...request }, { version: 1, action, fixture: 'beta-core-v1', generation: '1' });
    assert.ok(Object.isFrozen(request));
  }
});

test('unknown versions, actions, and appended authority or data fail closed', () => {
  const valid = createFixtureHandoff('SUMMARIZE_FIXTURE');
  for (const value of [
    null, {}, Buffer.from(valid), valid + '\n', ' ' + valid, valid + ':APPROVE',
    valid + ':https://example.invalid', valid.replace('-v1:', '-v2:'), prefix + 'RUN_SHELL',
    'x'.repeat(8192),
  ]) {
    assert.throws(() => readFixtureHandoff(value), { message: 'ACTION_NOT_ALLOWED' });
  }
  assert.throws(() => createFixtureHandoff('RUN_SHELL'), { message: 'ACTION_NOT_ALLOWED' });
});

function invoke(script, args, input = '') {
  return spawnSync(process.execPath, ['tools/supervised-execution/' + script, ...args], {
    cwd: root, input, encoding: 'utf8', timeout: 5000,
  });
}

test('sender prints only the token and rejects extra arguments', () => {
  const action = 'LIST_FIXTURE_FAILURES';
  const valid = invoke('handoff.mjs', [action]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout, createFixtureHandoff(action) + '\n');
  const invalid = invoke('handoff.mjs', [action, 'APPROVE']);
  assert.equal(invalid.status, 2, invalid.stderr);
  assert.equal(invalid.stdout, '');
});

test('receiver rejects piped approval even for a valid handoff', () => {
  const token = createFixtureHandoff('SUMMARIZE_FIXTURE');
  const valid = invoke('run.mjs', ['--handoff', token], 'APPROVE anything\n');
  assert.equal(valid.status, 2, valid.stderr);
  assert.equal(valid.stdout, '');
  assert.match(valid.stderr, /INTERACTIVE_OPERATOR_REQUIRED/);
  for (const args of [['--handoff'], ['--handoff', token + ':DO_NOT_ECHO'], ['--handoff', token, 'extra']]) {
    const invalid = invoke('run.mjs', args);
    assert.equal(invalid.status, 2, invalid.stderr);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Usage:/);
    assert.doesNotMatch(invalid.stderr, /DO_NOT_ECHO/);
  }
});
