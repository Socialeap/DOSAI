import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { openProject } from '../../tools/coordination-prototype/project-store.mjs';
import { createAntigravityFixtureReview, createManagedReview } from '../../tools/local-coordination-pilot/managed-review.mjs';
import { createPilotBroker } from '../../tools/local-coordination-pilot/broker.mjs';
import { maxTurnBytes } from '../../tools/local-coordination-pilot/managed-turn.mjs';
import { mountDashboard } from '../fixtures/coordination/dashboard-dom.mjs';

const mode = { mode: 'antigravity-review' };
const pythonFixture = fileURLToPath(new URL('../fixtures/coordination/antigravity-sdk-adapter-test.py', import.meta.url));
const approve = async () => true;
const result = Buffer.from('{"finding":"missing_validation"}');

function newProject(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dosai-antigravity-fixture-'));
  const path = join(dir, 'review.sqlite');
  const project = openProject(path, mode);
  t.after(() => {
    project.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { project, path };
}

test('approved Hydrogen fixture crosses the Python SDK adapter and persists in the dashboard', { timeout: 8000 }, async t => {
  const { project, path } = newProject(t);
  let observe;
  const updates = [];
  let approvals = 0;
  let calls = 0;
  const review = createAntigravityFixtureReview(project, record => {
    observe(record);
    updates.push(record.tasks.review.status);
  }, {
    async confirm(plan, digest) {
      approvals++;
      assert.equal(plan.mode, 'offline-fixture');
      assert.equal(plan.reviewerModel, 'gemini-4-hydrogen');
      assert.equal(plan.externalCostLimitCents, 0);
      assert.equal(digest, createHash('sha256').update(JSON.stringify(plan)).digest('hex'));
      return true;
    },
    sdkFixture(request, { signal }) {
      calls++;
      assert.equal(approvals, 1);
      assert.equal(signal.aborted, false);
      return execFileSync('/usr/bin/python3', ['-I', '-B', pythonFixture, '--fixture-stdio'], {
        env: {}, input: JSON.stringify(request), timeout: 1500, maxBuffer: maxTurnBytes,
      });
    },
  });
  const { nodes } = mountDashboard({
    dosaiProject: {
      view: async () => review.view(),
      subscribe(callback) { observe = callback; },
      run: () => review.run(),
      stop: async () => review.stop(),
    },
  });
  await setImmediate();
  assert.equal(nodes.get('owner-review').textContent, 'Antigravity Hydrogen');
  assert.equal((await review.run()).phase, 'complete');
  assert.deepEqual(updates.filter((phase, index) => !index || updates[index - 1] !== phase),
    ['pending', 'assigned', 'reviewing', 'complete']);
  assert.equal(calls, 1);
  assert.equal(nodes.get('name-carbon').textContent, 'Antigravity Hydrogen');
  assert.equal(nodes.get('state-carbon').textContent, 'Done');
  assert.equal(nodes.get('note-review').textContent, 'The fixture needs an empty-input check.');
  assert.throws(() => openProject(path, { mode: 'managed-review' }), /Unexpected coordination database/);
  const reopened = openProject(path, mode);
  try {
    const restored = createAntigravityFixtureReview(reopened, () => {}, {
      confirm() { assert.fail('A completed review asked for approval.'); },
      sdkFixture() { assert.fail('A completed review dispatched again.'); },
    });
    assert.deepEqual((await restored.run()).events.map(({ type, from, to }) => [type, from, to]), [
      ['assignment', 'codex', 'carbon'], ['progress', 'carbon', 'codex'], ['result', 'carbon', 'codex'],
    ]);
  } finally {
    reopened.close();
  }
});

test('the default reviewer and database cannot select the Hydrogen fixture', t => {
  const { project } = newProject(t);
  const legacy = openProject(':memory:', { mode: 'managed-review' });
  t.after(() => legacy.close());
  assert.throws(() => createAntigravityFixtureReview(legacy, () => {}, {}), /dedicated Antigravity/);
  assert.throws(() => createManagedReview(project, () => {}, {}), /own fixture/);
  assert.throws(() => createAntigravityFixtureReview(project, () => {}, { confirm: approve }), /offline Antigravity/);
  assert.throws(() => project.start({ lead: 'codex', review: 'claude', test: 'carbon' }), /Invalid team/);

  legacy.start({ lead: 'codex', review: 'claude', test: 'carbon' });
  const broker = createPilotBroker(legacy);
  assert.throws(() => broker.bind('carbon'), /endpoint rejected/);
  assert.throws(() => createPilotBroker(legacy, { reviewer: 'carbon' }), /dedicated Antigravity/);
});

test('declined local approval leaves the project idle and the SDK uncalled', async t => {
  const { project } = newProject(t);
  const review = createAntigravityFixtureReview(project, () => {}, {
    confirm: async () => false,
    sdkFixture() { assert.fail('Declined review reached the SDK.'); },
  });
  const saved = await review.run();
  assert.equal(saved.notice, 'Approval declined');
  assert.equal(saved.phase, 'idle');
  assert.deepEqual(saved.events, []);
});

test('Stop closes the project without waiting for a late Hydrogen result', { timeout: 6000 }, async t => {
  const { project } = newProject(t);
  const reached = Promise.withResolvers();
  const late = Promise.withResolvers();
  let acknowledgement = false;
  const review = createAntigravityFixtureReview(project, record => {
    acknowledgement ||= record.notice === 'Codex is receiving the review';
  }, {
    confirm: approve,
    sdkFixture(_, { signal }) {
      reached.resolve(signal);
      return late.promise;
    },
  });
  const running = review.run();
  const signal = await reached.promise;
  assert.equal(review.stop().phase, 'stopped');
  assert.equal(signal.aborted, true);
  assert.equal((await running).phase, 'stopped');
  late.resolve(result);
  await setImmediate();
  assert.equal(acknowledgement, false);
  assert.deepEqual(project.snapshot().events.map(event => event.type), ['assignment', 'progress']);
});

test('malformed, ambiguous or effect-bearing SDK output cannot reach the checklist', { timeout: 10000 }, async t => {
  for (const bytes of [
    Buffer.from('{"finding":"no_issue","finding":"missing_validation"}'),
    Buffer.from('{"finding":"missing_validation","command":"git status"}'),
    Buffer.from('{"finding":"unexpected"}'),
    Buffer.alloc(maxTurnBytes + 1),
  ]) {
    const { project } = newProject(t);
    let calls = 0;
    const review = createAntigravityFixtureReview(project, () => {}, {
      confirm: approve,
      sdkFixture() { calls++; return bytes; },
    });
    const saved = await review.run();
    assert.equal(saved.phase, 'stopped');
    assert.equal(saved.notice, 'Review blocked');
    assert.equal(calls, 1);
    assert.deepEqual(saved.events.map(event => event.type), ['assignment', 'progress']);
  }
});
