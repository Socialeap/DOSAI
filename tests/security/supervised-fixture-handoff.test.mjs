import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createFixtureHandoff, FIXTURE_HANDOFF_V1_ACTIONS, readFixtureHandoff, readOperatorRequest,
} from '../../tools/supervised-execution/handoff.mjs';

assert.equal(process.version, 'v24.18.0', 'Run the fixture handoff tests with repository-pinned Node 24.18.0.');

const root = resolve(import.meta.dirname, '../..');
const prefix = 'dosai-fixture-handoff-v1:';
const senderUsage = 'Usage: node tools/supervised-execution/handoff.mjs SUMMARIZE_FIXTURE|LIST_FIXTURE_FAILURES\n';
const receiverUsage =
  'Usage: node tools/supervised-execution/run.mjs [SUMMARIZE_FIXTURE|LIST_FIXTURE_FAILURES|--handoff TOKEN]\n';

test('v1 pins exactly two fixture actions that round-trip as immutable requests', () => {
  const expected = ['SUMMARIZE_FIXTURE', 'LIST_FIXTURE_FAILURES'];
  assert.deepEqual(FIXTURE_HANDOFF_V1_ACTIONS, expected);
  assert.ok(Object.isFrozen(FIXTURE_HANDOFF_V1_ACTIONS));
  for (const action of expected) {
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

function invoke(script, args, { input = '', nodeArgs = [] } = {}) {
  const result = spawnSync(process.execPath, [...nodeArgs, 'tools/supervised-execution/' + script, ...args], {
    cwd: root, input, encoding: 'utf8', timeout: 5000,
  });
  assert.ifError(result.error);
  return result;
}

function assertRejected(result, stderr) {
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, stderr);
}

test('sender prints only a valid token and rejects invalid invocations with fixed usage text', () => {
  const action = 'LIST_FIXTURE_FAILURES';
  const valid = invoke('handoff.mjs', [action]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout, createFixtureHandoff(action) + '\n');
  assert.equal(valid.stderr, '');
  for (const args of [[], ['UNKNOWN_ACTION_DO_NOT_ECHO'], [action, 'EXTRA_DO_NOT_ECHO']]) {
    assertRejected(invoke('handoff.mjs', args), senderUsage);
  }
});

test('receiver positional arguments default to the summary and admit an explicit fixture action', () => {
  assert.equal(readOperatorRequest([]).action, 'SUMMARIZE_FIXTURE');
  assert.equal(readOperatorRequest(['LIST_FIXTURE_FAILURES']).action, 'LIST_FIXTURE_FAILURES');
  for (const args of [[], ['LIST_FIXTURE_FAILURES']]) {
    const result = invoke('run.mjs', args);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^INTERACTIVE_OPERATOR_REQUIRED:/);
  }
  for (const args of [['UNKNOWN_ACTION_DO_NOT_ECHO'], ['SUMMARIZE_FIXTURE', 'EXTRA_DO_NOT_ECHO']]) {
    assertRejected(invoke('run.mjs', args), receiverUsage);
  }
});

test('receiver rejects piped approval even for a valid handoff', () => {
  const token = createFixtureHandoff('SUMMARIZE_FIXTURE');
  const valid = invoke('run.mjs', ['--handoff', token], { input: 'APPROVE anything\n' });
  assert.equal(valid.status, 2, valid.stderr);
  assert.equal(valid.stdout, '');
  assert.match(valid.stderr, /^INTERACTIVE_OPERATOR_REQUIRED:/);
  for (const args of [['--handoff'], ['--handoff', token + ':DO_NOT_ECHO'], ['--handoff', token, 'extra']]) {
    assertRejected(invoke('run.mjs', args), receiverUsage);
  }
});

test('both entry points reject an unsupported Node version before processing arguments', () => {
  // Use the pinned executable with a test-only version override in the child process.
  const override = "Object.defineProperty(process, 'version', { value: 'v24.17.0' });";
  const nodeArgs = ['--import', 'data:text/javascript,' + encodeURIComponent(override)];
  for (const script of ['handoff.mjs', 'run.mjs']) {
    assertRejected(
      invoke(script, ['UNKNOWN_ACTION_DO_NOT_ECHO'], { nodeArgs }),
      'PINNED_RUNTIME_REQUIRED: use Node v24.18.0.\n',
    );
  }
});
