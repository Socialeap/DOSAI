import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';

import { openProject } from '../../tools/coordination-prototype/project-store.mjs';
import { runManagedFixtureTurn } from '../../tools/local-coordination-pilot/managed-fixture-runner.mjs';
import { createManagedReview } from '../../tools/local-coordination-pilot/managed-review.mjs';
import { managedTurn, maxTurnBytes, readManagedOutput } from '../../tools/local-coordination-pilot/managed-turn.mjs';
import { mountDashboard } from '../fixtures/coordination/dashboard-dom.mjs';

const scope = { mode: 'managed-review' };
const approved = async () => true;
const claudeReply = structured_output => Buffer.from(JSON.stringify({
  type: 'result', subtype: 'success', is_error: false, structured_output,
}));
const steps = [['codex', 'assign'], ['claude', 'review'], ['codex', 'acknowledge']];

function newProject(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dosai-managed-test-'));
  const path = join(directory, 'review.sqlite');
  const project = openProject(path, scope);
  t.after(() => {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { project, path };
}

test('approved workers drive the real dashboard renderer and preserve exactly one completed review', { timeout: 8000 }, async t => {
  const { project, path } = newProject(t);
  const approvals = [];
  const dispatched = [];
  const observations = [];
  let observer;
  let finished;
  const managed = createManagedReview(project, record => {
    observer(record);
    observations.push({
      site: nodes.get('link-review').dataset.direction,
      phase: nodes.get('graph').dataset.phase,
      reviewer: nodes.get('state-claude').textContent,
      note: nodes.get('note-review').textContent,
    });
  }, {
    async confirm(plan, digest) {
      approvals.push(digest);
      assert.equal(plan.externalCostLimitCents, 0);
      assert.equal(plan.mode, 'offline-fixture');
      assert.equal(plan.turns, 3);
      assert.deepEqual([plan.lead, plan.reviewer], ['codex', 'claude']);
      assert.match(digest, /^[a-f0-9]{64}$/);
      return true;
    },
    execute(request, options) {
      dispatched.push([request.actor, request.step]);
      assert.ok(Buffer.byteLength(JSON.stringify(request)) < 1024);
      return runManagedFixtureTurn(request, options);
    },
  });
  const { body, nodes } = mountDashboard({
    dosaiProject: {
      async view() { return managed.view(); },
      subscribe(receive) { observer = receive; },
      run(...args) {
        assert.equal(args.length, 0);
        finished = managed.run();
        return finished;
      },
      async stop() { return managed.stop(); },
    },
  });
  await setImmediate();
  assert.equal(body.dataset.reviewMode, 'managed');
  assert.equal(nodes.get('mode').textContent, 'Offline managed review');
  assert.equal(nodes.get('role-codex').disabled, true);
  nodes.get('run').trigger('click');
  assert.equal((await finished).phase, 'complete');
  assert.equal(approvals.length, 1);
  assert.deepEqual(dispatched, steps);
  assert.ok(observations.some(({ site, reviewer }) => site === 'lead' && reviewer === 'Assigned'));
  assert.ok(observations.some(({ site, reviewer }) => site === 'specialist' && reviewer === 'Working'));
  assert.deepEqual(observations.at(-1), {
    site: 'specialist', phase: 'complete', reviewer: 'Done', note: 'The fixture needs an empty-input check.',
  });
  assert.equal(nodes.get('done-review').checked, true);
  assert.equal(nodes.get('session-status').textContent, 'Review received and saved');
  assert.equal(nodes.get('run').disabled, true);

  assert.throws(() => openProject(path), /Unexpected coordination database/);
  const reopened = openProject(path, scope);
  try {
    const saved = reopened.snapshot();
    assert.deepEqual(saved.events.map(({ type, from, to }) => [type, from, to]), [
      ['assignment', 'codex', 'claude'], ['progress', 'claude', 'codex'], ['result', 'claude', 'codex'],
    ]);
    const restored = createManagedReview(reopened, () => {}, {
      confirm() { assert.fail('A restored review prompted for another run.'); },
    });
    assert.equal((await restored.run()).phase, 'complete');
  } finally {
    reopened.close();
  }
});

test('decline or Stop during approval leaves the project idle with no worker launch', async t => {
  const { project } = newProject(t);
  let promptCount = 0;
  const second = Promise.withResolvers();
  const managed = createManagedReview(project, () => {}, {
    confirm: () => ++promptCount === 1 ? false : second.promise,
    execute() { assert.fail('A worker launched without approval.'); },
  });
  assert.equal((await managed.run()).notice, 'Approval declined');
  const pending = managed.run();
  await setImmediate();
  assert.equal((await managed.run()).notice, 'Awaiting local approval');
  assert.equal(promptCount, 2);
  managed.stop();
  second.resolve(true);
  assert.equal((await pending).notice, 'Approval cancelled');
  assert.equal(project.snapshot().phase, 'idle');
  assert.deepEqual(project.snapshot().events, []);
});

test('Stop revokes the revision before a late specialist result can dispatch another Codex turn', { timeout: 6000 }, async t => {
  const { project, path } = newProject(t);
  const reached = Promise.withResolvers();
  const late = Promise.withResolvers();
  const dispatched = [];
  const managed = createManagedReview(project, () => {}, {
    confirm: approved,
    execute(turn, options) {
      dispatched.push(turn.step);
      if (turn.step !== 'review') return runManagedFixtureTurn(turn, options);
      options.onStart();
      reached.resolve(options.signal);
      return late.promise;
    },
  });
  const running = managed.run();
  const signal = await reached.promise;
  const stopped = managed.stop();
  assert.equal(signal.aborted, true);
  assert.equal(stopped.phase, 'stopped');
  late.resolve(claudeReply({ finding: 'missing_validation' }));
  assert.deepEqual(await running, stopped);
  assert.deepEqual(dispatched, ['assign', 'review']);
  assert.deepEqual(stopped.events.map(event => event.type), ['assignment', 'progress']);

  const reopened = openProject(path, scope);
  try {
    assert.equal(reopened.snapshot().phase, 'stopped');
    assert.throws(() => reopened.forActor('claude').update({
      task: 'review', type: 'result', expectedRevision: stopped.tasks.review.revision, note: 'Late result',
    }), /Task update rejected/);
    assert.deepEqual(reopened.snapshot().events, stopped.events);
  } finally {
    reopened.close();
  }
});

test('a conflicting receipt leaves the finding uncommitted and closes the review', { timeout: 6000 }, async t => {
  const { project } = newProject(t);
  const managed = createManagedReview(project, () => {}, {
    confirm: approved,
    execute(turn, options) {
      if (turn.step !== 'acknowledge') return runManagedFixtureTurn(turn, options);
      return runManagedFixtureTurn(managedTurn('acknowledge', 'no_issue'), options);
    },
  });
  const result = await managed.run();
  assert.equal(result.phase, 'stopped');
  assert.equal(result.notice, 'Review blocked');
  assert.equal(result.tasks.review.status, 'reviewing');
  assert.deepEqual(result.events.map(event => event.type), ['assignment', 'progress']);
});

test('a persisted unfinished review requires Stop and cannot redispatch after restart', async t => {
  const { project } = newProject(t);
  project.start({ lead: 'codex', review: 'claude', test: 'carbon' });
  assert.throws(() => project.forActor('codex').update({
    task: 'test', type: 'assignment', expectedRevision: 0, note: 'Extra assignment',
  }), /Invalid task update/);
  let prompted = false;
  const restored = createManagedReview(project, () => {}, { confirm() { prompted = true; } });
  assert.equal((await restored.run()).phase, 'running');
  assert.equal(prompted, false);
  assert.equal(restored.stop().phase, 'stopped');
});

test('the owned fixture process closes when cancelled at launch', { timeout: 5000 }, async () => {
  const controller = new AbortController();
  await assert.rejects(runManagedFixtureTurn(managedTurn('review'), {
    signal: controller.signal, onStart: () => controller.abort(),
  }), /closed without a result/);
});

test('CLI output accepts the closed schema and rejects oversized, ambiguous, or effect-bearing replies', () => {
  const review = managedTurn('review');
  assert.equal(readManagedOutput(review, claudeReply({ finding: 'missing_validation' })), 'missing_validation');
  assert.throws(() => readManagedOutput(review, claudeReply({ finding: 'missing_validation', role: 'codex' })),
    /reply rejected/);
  assert.throws(() => readManagedOutput(review, claudeReply({ finding: 'Arbitrary text' })), /reply rejected/);
  assert.throws(() => readManagedOutput(review, Buffer.alloc(maxTurnBytes + 1)), /size rejected/);
  assert.throws(() => readManagedOutput(review, Buffer.from('{"type":"result","type":"result"}')), /DUPLICATE_KEY/);
  const command = Buffer.from([
    '{"type":"thread.started"}', '{"type":"turn.started"}',
    '{"type":"item.started","item":{"type":"command_execution"}}', '{"type":"turn.completed"}', '',
  ].join('\n'));
  assert.throws(() => readManagedOutput(managedTurn('assign'), command), /Unexpected Codex event/);
});
