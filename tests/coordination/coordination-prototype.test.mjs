import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';

import '../../tools/coordination-prototype/session.js';
import { mountDashboard } from '../fixtures/coordination/dashboard-dom.mjs';

const { assignRole, createSession, defaultRoles, names, sampleAgents } = globalThis.dosaiCoordinationPrototype;
const noDelay = async () => {};

test('all role permutations route two assignments and both results to the right identities', async () => {
  const identities = Object.keys(names);
  for (const lead of identities) {
    for (const review of identities.filter(agent => agent !== lead)) {
      const roles = { lead, review, test: identities.find(agent => agent !== lead && agent !== review) };
      const updates = [];
      const session = createSession({
        roles, agents: sampleAgents(roles, noDelay), onUpdate: update => updates.push(update),
      });

      const final = await session.start();
      assert.equal(final.phase, 'complete');
      assert.deepEqual(final.roles, roles);
      assert.deepEqual(final.events.map(event => event.sequence), [1, 2, 3, 4, 5, 6]);
      assert.deepEqual(final.events.slice(0, 2).map(event => event.type), ['assignment', 'assignment']);
      for (const task of ['review', 'test']) {
        const events = final.events.filter(event => event.task === task);
        assert.deepEqual(events.map(event => [event.type, event.from, event.to]), [
          ['assignment', lead, roles[task]],
          ['progress', roles[task], lead],
          ['result', roles[task], lead],
        ]);
      }
      assert.ok(updates.some(({ states }) => states.review === 'assigned' && states.test === 'assigned'));
      assert.ok(final.events.every(Object.isFrozen));
      assert.deepEqual(await session.start(), final);
    }
  }
});

test('role changes swap identities and invalid duplicate roles block before assigning', async () => {
  assert.deepEqual(assignRole(defaultRoles, 'carbon', 'lead'), { lead: 'carbon', review: 'claude', test: 'codex' });
  assert.deepEqual(defaultRoles, { lead: 'codex', review: 'claude', test: 'carbon' });
  const session = createSession({
    roles: { lead: 'codex', review: 'codex', test: 'carbon' }, agents: {}, onUpdate() {},
  });
  const final = await session.start();
  assert.equal(final.phase, 'blocked');
  assert.equal(final.events.length, 0);
});

test('unsupported operations and a specialist crossing lanes are rejected', async t => {
  for (const type of ['execute', 'progress']) {
    await t.test(type, async () => {
      const roles = defaultRoles;
      const agents = sampleAgents(roles, noDelay);
      agents.claude.receive = async (event, send) => {
        const task = type === 'progress' ? 'test' : event.task;
        assert.equal(await send(type, task, 'Unadmitted message'), false);
        assert.equal(await send('progress', event.task, 'Late retry'), false);
      };
      const session = createSession({ roles, agents, onUpdate() {} });
      const final = await session.start();
      assert.equal(final.phase, 'blocked');
      assert.ok(final.events.every(event => event.type === 'assignment'));
    });
  }
});

test('completion requires the lead to consume both results', async () => {
  const roles = defaultRoles;
  const agents = sampleAgents(roles, noDelay);
  agents.codex.receive = event => {
    if (event.type === 'result' && event.task === 'test') throw new Error('Injected recipient failure');
  };
  const session = createSession({ roles, agents, onUpdate() {} });
  assert.equal((await session.start()).phase, 'blocked');
});

test('stop discards pending progress on both assigned lanes', async () => {
  const { promise, resolve } = Promise.withResolvers();
  const reached = Promise.withResolvers();
  const roles = defaultRoles;
  const agents = sampleAgents(roles, noDelay);
  let arrivals = 0;
  for (const agent of [roles.review, roles.test]) {
    agents[agent].receive = async (event, send) => {
      if (++arrivals === 2) reached.resolve();
      await promise;
      assert.equal(await send('progress', event.task, 'Delayed progress'), false);
    };
  }
  const session = createSession({ roles, agents, onUpdate() {} });
  const completion = session.start();
  await reached.promise;
  const stopped = session.stop();
  resolve();
  assert.equal(stopped.phase, 'stopped');
  assert.deepEqual(stopped.events.map(event => event.type), ['assignment', 'assignment']);
  assert.deepEqual(await completion, stopped);
});

test('dashboard role picker and both graph edges track the automatic exchange', async () => {
  const timers = [];
  const { html, nodes, scripts } = mountDashboard({ setTimeout: advance => timers.push(advance) });
  assert.match(html, /connect-src 'none'/);
  assert.deepEqual(scripts, ['session.js', 'dashboard.js']);

  nodes.get('role-carbon').value = 'lead';
  nodes.get('role-carbon').trigger('change');
  assert.equal(nodes.get('agent-carbon').dataset.role, 'lead');
  assert.equal(nodes.get('role-codex').value, 'test');
  nodes.get('run').trigger('click');
  assert.equal(nodes.get('role-carbon').disabled, true);

  for (const [direction, messages] of [['lead', 2], ['specialist', 4], ['specialist', 6], ['specialist', 6]]) {
    assert.notEqual(timers.length, 0);
    for (const advance of timers.splice(0)) advance();
    await setImmediate();
    for (const role of ['review', 'test']) assert.equal(nodes.get('link-' + role).dataset.direction, direction);
    assert.equal(nodes.get('activity').children.length, messages);
  }
  assert.equal(nodes.get('session-status').textContent, 'Both results received');
  assert.equal(nodes.get('activity').children[0].children[0].textContent, 'Antigravity Carbon → Claude Code');
  assert.equal(nodes.get('activity').children[5].children[0].textContent, 'GPT Codex → Antigravity Carbon');
  assert.equal(nodes.get('role-carbon').disabled, false);
});
