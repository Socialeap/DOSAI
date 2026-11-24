import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { openProject } from '../../tools/coordination-prototype/project-store.mjs';
import { reviewStudy } from '../../tools/local-coordination-pilot/broker.mjs';
import { createCodexAppServerFixtureExchange } from '../../tools/local-coordination-pilot/codex-app-server-stdio.mjs';
import { createAntigravityFixtureReview } from '../../tools/local-coordination-pilot/managed-review.mjs';
import { managedTurn } from '../../tools/local-coordination-pilot/managed-turn.mjs';

const provider = 'openai_chatgpt_plan';
const appServer = { app: 'dosai-private-beta', model: 'gpt-6.2-sol' };
const finding = 'missing_validation';
const request = {
  mode: 'offline-fixture', method: 'turn/start',
  params: {
    model: appServer.model, serviceTierForTurn: 'default',
    input: [{ type: 'text', text: managedTurn('assign', undefined, 'carbon').prompt }],
    outputSchema: managedTurn('assign', undefined, 'carbon').schema,
  },
};
const threadId = 'thread-fixture';
const turnId = 'turn-fixture';
const scope = { threadId, turnId };
const running = { id: turnId, status: 'inProgress', items: [], error: null };
const started = { method: 'turn/started', params: { threadId, turn: running } };
const completed = {
  method: 'turn/completed', params: { threadId, turn: { ...running, status: 'completed' } },
};
const message = reply => ({
  method: 'item/completed',
  params: {
    ...scope,
    item: { type: 'agentMessage', id: 'message-fixture', phase: 'final_answer', text: JSON.stringify(reply) },
  },
});
const threadResult = {
  thread: { id: threadId, ephemeral: true, modelProvider: provider },
  model: appServer.model, modelProvider: provider, approvalPolicy: 'never',
  sandbox: { type: 'readOnly', networkAccess: false },
  instructionSources: [],
};

function channel({ thread = threadResult, onTurn, initFrame } = {}) {
  const input = new PassThrough();
  const commands = [];
  const send = (...frames) => {
    const bytes = Buffer.from(frames.map(value => JSON.stringify(value) + '\n').join(''));
    input.write(bytes.subarray(0, 13));
    input.write(bytes.subarray(13));
  };
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const rpc = JSON.parse(chunk.toString());
      commands.push(rpc);
      if (rpc.method === 'initialize') {
        if (initFrame) input.write(initFrame);
        else send({ id: rpc.id, result: { userAgent: 'codex-app-server/0.172.0' } });
      } else if (rpc.method === 'thread/start') {
        send({ id: rpc.id, result: thread });
      } else if (rpc.method === 'turn/start') {
        if (onTurn) onTurn(send, rpc, input);
        else {
          const [field] = rpc.params.outputSchema.required;
          send({ id: rpc.id, result: { turn: running } }, started,
            message(field === 'assignment' ? { assignment: reviewStudy } : { received: finding }), completed);
        }
      }
      callback();
    },
  });
  return { input, output, commands };
}

function run(fixture, signal = new AbortController().signal) {
  return createCodexAppServerFixtureExchange(() => fixture)(request, { appServer, signal });
}

test('two owned stdio exchanges drive one approved Codex and Hydrogen fixture review', async t => {
  const project = openProject(':memory:', { mode: 'antigravity-review' });
  t.after(() => project.close());
  const channels = [];
  const observe = Buffer.from(JSON.stringify({
    mode: 'offline-fixture', app: appServer.app, registrationDigest: 'a'.repeat(64),
    scope: 'chatgpt.tokens.use.direct', personalPlan: true, appLimitPercent: 25,
    includedUsageAvailable: true, observedAtMs: Date.now(), signatureRequirementVerified: true,
    executableSha256: 'b6d4ae3a01f5a044d80deba107b27e995944d012a8132cee8a4f3e05c2fd2448',
  }));
  let approved = false;
  const review = createAntigravityFixtureReview(project, () => {}, {
    async confirm() { approved = true; return true; },
    sdkFixture: () => Buffer.from(JSON.stringify({ finding })),
    codexFixture: {
      observe: () => observe,
      exchange: createCodexAppServerFixtureExchange(() => {
        assert.equal(approved, true);
        const fixture = channel();
        channels.push(fixture);
        return fixture;
      }),
    },
  });

  const result = await review.run();
  assert.equal(result.phase, 'complete');
  assert.deepEqual(result.events.map(event => event.type), ['assignment', 'progress', 'result']);
  assert.equal(channels.length, 2);
  for (const { commands, input, output } of channels) {
    assert.deepEqual(commands.map(command => command.method), ['initialize', 'initialized', 'thread/start', 'turn/start']);
    assert.equal(commands[0].params.clientInfo.name, appServer.app);
    assert.deepEqual(commands[2].params, {
      model: appServer.model, modelProvider: provider, ephemeral: true,
      approvalPolicy: 'never', sandbox: 'read-only', environments: [],
    });
    assert.equal(commands[3].params.threadId, threadId);
    assert.equal(commands[3].params.serviceTierForTurn, 'default');
    assert.ok(input.destroyed && output.destroyed);
  }
});

test('a changed provider, persistence mode, sandbox, or instructions denies before inference', async () => {
  for (const patch of [
    { modelProvider: 'openai' }, { model: 'different-model' },
    { thread: { ...threadResult.thread, ephemeral: false } }, { approvalPolicy: 'on-request' },
    { sandbox: { type: 'readOnly', networkAccess: true } }, { instructionSources: ['/fixture/AGENTS.md'] },
  ]) {
    const fixture = channel({ thread: { ...threadResult, ...patch } });
    await assert.rejects(run(fixture), /fixture rejected/);
    assert.deepEqual(fixture.commands.map(command => command.method), ['initialize', 'initialized', 'thread/start']);
  }
});

test('an arbitrary prompt or extra turn parameter is rejected before channel creation', async () => {
  let opens = 0;
  const exchange = createCodexAppServerFixtureExchange(() => { opens++; return channel(); });
  const options = { appServer, signal: new AbortController().signal };
  await assert.rejects(exchange({ ...request, params: {
    ...request.params, input: [{ type: 'text', text: 'unexpected' }],
  } }, options), /fixture request rejected/);
  await assert.rejects(exchange({ ...request, params: {
    ...request.params, cwd: '/unexpected',
  } }, options), /fixture request rejected/);
  assert.equal(opens, 0);
});

test('allowance exhaustion on admission or in a running turn is projected without retry', async () => {
  for (const messages of [
    [{ id: 3, error: { code: -32603, data: { code: 'subscription_sharing_usage_limit_exceeded' } } }],
    [{ id: 3, result: { turn: running } }, started, {
      method: 'error', params: { ...scope, willRetry: false, error: { codexErrorInfo: 'usageLimitExceeded' } },
    }],
    [{ id: 3, result: { turn: running } }, started, {
      method: 'turn/completed', params: { threadId, turn: {
        ...running, status: 'failed', error: { codexErrorInfo: 'usageLimitExceeded' },
      } },
    }],
  ]) {
    const fixture = channel({ onTurn: send => send(...messages) });
    assert.deepEqual(JSON.parse(await run(fixture)), {
      status: 'failed', code: 'subscription_sharing_usage_limit_exceeded',
    });
    assert.equal(fixture.commands.filter(command => command.method === 'turn/start').length, 1);
    assert.ok(fixture.input.destroyed && fixture.output.destroyed);
  }
});

test('server requests, tool events, retries, and mismatched turn IDs close without a response', async () => {
  for (const event of [
    { id: 4, method: 'item/tool/requestUserInput', params: scope },
    { method: 'item/started', params: { ...scope, item: { type: 'commandExecution', id: 'tool-fixture' } } },
    { method: 'error', params: { ...scope, willRetry: true, error: { codexErrorInfo: 'usageLimitExceeded' } } },
    { method: 'model/rerouted', params: scope },
    { ...completed, params: { ...completed.params, turn: { ...completed.params.turn, id: 'other-turn' } } },
    { ...completed, params: { ...completed.params, turn: {
      ...completed.params.turn, items: [{ type: 'commandExecution' }],
    } } },
  ]) {
    const fixture = channel({ onTurn: send => send({ id: 3, result: { turn: running } }, started, event) });
    await assert.rejects(run(fixture), /fixture rejected/);
    assert.equal(fixture.commands.length, 4);
    assert.ok(fixture.input.destroyed && fixture.output.destroyed);
  }
});

test('ambiguous JSON, replays, oversized frames, and premature EOF cannot produce a receipt', async () => {
  for (const initFrame of [
    '{"id":1,"id":1,"result":{"userAgent":"fixture"}}\n',
    '{"id":2,"result":{"userAgent":"fixture"}}\n',
    ' '.repeat(32 * 1024 + 1),
  ]) {
    const fixture = channel({ initFrame });
    await assert.rejects(run(fixture), /fixture rejected/);
    assert.equal(fixture.commands.length, 1);
  }

  const first = message({ assignment: reviewStudy });
  for (const events of [[first, first, completed], [first], [completed]]) {
    const fixture = channel({ onTurn(send, _rpc, input) {
      send({ id: 3, result: { turn: running } }, started, ...events);
      input.end();
    } });
    await assert.rejects(run(fixture), /fixture rejected/);
  }
});

test('Stop closes both owned streams and ignores a late valid terminal reply', { timeout: 5000 }, async () => {
  const controller = new AbortController();
  const reached = Promise.withResolvers();
  const fixture = channel({
    onTurn(send) {
      send({ id: 3, result: { turn: running } }, started);
      reached.resolve(() => send(message({ assignment: reviewStudy }), completed));
    },
  });
  const pending = run(fixture, controller.signal);
  const late = await reached.promise;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  late();
  await setImmediate();
  assert.ok(fixture.input.destroyed && fixture.output.destroyed);
  assert.equal(fixture.commands.length, 4);
});
