import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';

import '../../tools/coordination-prototype/session.js';

const { createSession, sample, sampleAgents } = globalThis.dosaiCoordinationPrototype;
const repositoryFiles = new URL('../../tools/coordination-prototype/', import.meta.url);
const read = name => readFileSync(new URL(name, repositoryFiles), 'utf8');
const noDelay = async () => {};

test('lead and specialist exchange three role-bound messages automatically', async () => {
  const updates = [];
  const delivered = [];
  const agents = sampleAgents(noDelay);
  const session = createSession({
    lead: {
      start: agents.lead.start,
      async receive(event) {
        delivered.push(event);
        await agents.lead.receive(event);
      },
    },
    specialist: {
      async receive(event, send) {
        delivered.push(event);
        await agents.specialist.receive(event, send);
      },
    },
    onUpdate: value => updates.push(value.phase),
  });

  const final = await session.start();
  assert.equal(final.phase, 'complete');
  assert.deepEqual(updates, ['ready', 'assigned', 'reviewing', 'delivered', 'complete']);
  assert.deepEqual(final.events, delivered);
  assert.deepEqual(final.events.map(({ sequence, type, from, to }) => [sequence, type, from, to]), [
    [1, 'assignment', 'lead', 'specialist'],
    [2, 'progress', 'specialist', 'lead'],
    [3, 'result', 'specialist', 'lead'],
  ]);
  assert.ok(final.events.every(event => event.taskId === sample.id && Object.isFrozen(event)));
  assert.equal(final.events.at(-1).text, 'Missing test: empty input.');
  assert.deepEqual(await session.start(), final);
});

test('invalid messages stop the session before any further delivery', async t => {
  const rejected = [
    ['an execution request', 'execute', sample.id],
    ['the wrong sender', 'progress', sample.id],
    ['the wrong task', 'assignment', 'unknown-task'],
  ];
  for (const [name, type, id] of rejected) {
    await t.test(name, async () => {
      let deliveries = 0;
      const session = createSession({
        lead: {
          async start(send) {
            assert.equal(await send(type, id, 'Unadmitted message'), false);
            assert.equal(await send('assignment', sample.id, 'Late retry'), false);
          },
        },
        specialist: { receive: () => deliveries++ },
        onUpdate() {},
      });
      assert.deepEqual(await session.start(), { phase: 'blocked', events: [] });
      assert.equal(deliveries, 0);
    });
  }
});

test('completion requires the lead to receive the result successfully', async () => {
  const agents = sampleAgents(noDelay);
  agents.lead.receive = event => {
    if (event.type === 'result') throw new Error('Injected recipient failure');
  };
  const session = createSession({ ...agents, onUpdate() {} });
  assert.equal((await session.start()).phase, 'blocked');
});

test('stop rejects messages held by an asynchronous adapter', async () => {
  const { promise, resolve } = Promise.withResolvers();
  const reachedSpecialist = Promise.withResolvers();
  const agents = sampleAgents(noDelay);
  const session = createSession({
    ...agents,
    specialist: {
      async receive(event, send) {
        reachedSpecialist.resolve();
        await promise;
        assert.equal(await send('progress', event.taskId, 'Delayed progress'), false);
      },
    },
    onUpdate() {},
  });
  const completion = session.start();
  await reachedSpecialist.promise;
  const stopped = session.stop();
  resolve();
  assert.equal(stopped.phase, 'stopped');
  assert.deepEqual(stopped.events.map(event => event.type), ['assignment']);
  assert.deepEqual(await completion, stopped);
});

class Element {
  dataset = {};
  children = [];
  textContent = '';
  disabled = false;
  handlers = {};

  addEventListener(type, handler) {
    this.handlers[type] = handler;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  click() {
    if (!this.disabled) this.handlers.click();
  }
}

test('the file-based dashboard follows broker events and keeps details on demand', async () => {
  const html = read('index.html');
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const timers = [];
  const context = createContext({
    document: { getElementById: id => nodes.get(id), createElement: () => new Element() },
    setTimeout: advance => timers.push(advance),
  });
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /<details>\s*<summary>Session activity<\/summary>/);
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(([, src]) => src);
  assert.deepEqual(scripts, ['session.js', 'dashboard.js']);
  for (const script of scripts) runInContext(read(script), context, { filename: script });

  nodes.get('run').click();
  assert.equal(nodes.get('run').disabled, true);
  assert.equal(nodes.get('stop').disabled, false);
  for (const [phase, sender, messages] of [
    ['assigned', 'lead', 1],
    ['reviewing', 'specialist', 2],
    ['delivered', 'specialist', 3],
    ['complete', 'specialist', 3],
  ]) {
    assert.equal(timers.length, 1);
    timers.shift()();
    await setImmediate();
    assert.equal(nodes.get('graph').dataset.phase, phase);
    assert.equal(nodes.get('link').dataset.direction, sender);
    assert.equal(nodes.get('activity').children.length, messages);
  }
  assert.equal(nodes.get('link-label').textContent, 'Result received');
  assert.equal(nodes.get('activity').children[2].children[1], 'Missing test: empty input.');
  assert.equal(nodes.get('stop').disabled, true);
  assert.equal(nodes.get('run').disabled, false);

  nodes.get('run').click();
  nodes.get('stop').click();
  assert.equal(timers.length, 1);
  timers.shift()();
  await setImmediate();
  assert.equal(nodes.get('link-label').textContent, 'Session stopped');
  assert.equal(nodes.get('activity').children.length, 0);
});
