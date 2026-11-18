import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { REVIEW_IPC } from '../../src/contracts/ipc.ts';
import { DOSAI_REVIEW_SAMPLE } from '../../src/contracts/review-session.ts';

const electronFixture = new URL('./review-electron-fixture.mjs', import.meta.url).href;
const preloadEntry = new URL('../../src/preload/review-bridge.ts', import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'electron') return { url: electronFixture, shortCircuit: true };
    if (context.parentURL === preloadEntry.href && specifier === '../contracts/ipc') {
      return nextResolve('../contracts/ipc.ts', context);
    }
    return nextResolve(specifier, context);
  },
});
const { registerReviewIpc } = await import('../../src/main/ipc/register-review-ipc.ts');
const { createReviewBridge } = await import(preloadEntry.href);
hooks.deregister();
const { browserWindows, confirmation, handlers, renderer } = await import(electronFixture);

function makeWindow(url = 'dosai://app/') {
  const frame = { url };
  const sender = Object.assign(new EventEmitter(), { id: browserWindows.size + 1, mainFrame: frame });
  const window = Object.assign(new EventEmitter(), {
    webContents: sender,
    focused: true,
    isDestroyed: () => false,
    isVisible: () => true,
    isFocused: () => window.focused,
  });
  browserWindows.set(sender, window);
  return { window, event: { sender, senderFrame: frame } };
}

const invoke = (name, event, ...args) => handlers.get(REVIEW_IPC[name])(event, ...args);
const sessionRef = ({ plan: { sessionId, planSha256 } }) => ({ sessionId, planSha256 });

registerReviewIpc(true);

test('review IPC rejects unknown frames, extra arguments and cross-window plans', async () => {
  assert.deepEqual([...handlers.keys()], [
    'dosai:review:get-session', 'dosai:review:prepare', 'dosai:review:request-approval',
    'dosai:review:record-report', 'dosai:review:stop',
  ]);
  const trusted = makeWindow();
  const another = makeWindow();
  for (const event of [
    makeWindow('https://example.invalid/').event,
    { ...trusted.event, senderFrame: { url: 'dosai://app/' } },
    { ...trusted.event, senderFrame: null },
    { ...trusted.event, sender: { id: 123 } },
  ]) assert.throws(() => invoke('getSession', event), /untrusted/);

  const pending = await invoke('prepare', trusted.event, DOSAI_REVIEW_SAMPLE);
  assert.throws(() => invoke('getSession', trusted.event, 'extra'), /untrusted/);
  assert.throws(() => invoke('requestApproval', trusted.event, sessionRef(pending), true), /untrusted/);
  await assert.rejects(invoke('stop', another.event, sessionRef(pending)), /no longer current/);
});

test('actual IPC approval route requires a focused local window and the affirmative native response', async () => {
  const { event, window } = makeWindow();
  const initial = await invoke('prepare', event, DOSAI_REVIEW_SAMPLE);
  window.focused = false;
  let dialogs = 0;
  confirmation.respond = () => { dialogs += 1; return { response: 0 }; };
  const unavailable = await invoke('requestApproval', event, sessionRef(initial));
  assert.equal(unavailable.status, 'denied');
  assert.equal(dialogs, 0);
  assert.deepEqual(unavailable.handoffs, []);

  window.focused = true;
  const pending = await invoke('prepare', event, DOSAI_REVIEW_SAMPLE);
  await assert.rejects(invoke('requestApproval', event, { ...sessionRef(pending), approved: true }), /Invalid/);
  confirmation.respond = (parent, options) => {
    assert.equal(parent, window);
    assert.deepEqual(options.buttons, ['Deny', 'Approve handoffs']);
    assert.equal(options.defaultId, 0);
    assert.equal(options.cancelId, 0);
    for (const pin of [
      DOSAI_REVIEW_SAMPLE.base, DOSAI_REVIEW_SAMPLE.head, DOSAI_REVIEW_SAMPLE.patchSha256,
      DOSAI_REVIEW_SAMPLE.correctness, DOSAI_REVIEW_SAMPLE.testCoverage,
    ]) assert.ok(options.detail.includes(pin));
    return { response: 1 };
  };
  const active = await invoke('requestApproval', event, sessionRef(pending));
  assert.equal(active.status, 'active');
  assert.equal(active.handoffs.length, 2);
  window.emit('closed');
  assert.equal(await invoke('getSession', event), null);
});

test('renderer loss invalidates a native approval dialog still in flight', async () => {
  const { event } = makeWindow();
  const pending = await invoke('prepare', event, DOSAI_REVIEW_SAMPLE);
  const response = Promise.withResolvers();
  confirmation.respond = () => response.promise;
  const approval = invoke('requestApproval', event, sessionRef(pending));
  event.sender.emit('render-process-gone');
  response.resolve({ response: 1 });
  await assert.rejects(approval, /no longer current/);
  assert.equal(await invoke('getSession', event), null);
});


test('the desktop bridge completes a denied-then-approved review with two lane-bound reports', async t => {
  const { event, window } = makeWindow();
  const originalConfirmation = confirmation.respond;
  renderer.event = event;
  t.after(() => {
    confirmation.respond = originalConfirmation;
    renderer.event = null;
    browserWindows.delete(event.sender);
  });
  const review = createReviewBridge();

  confirmation.respond = () => ({ response: 0 });
  const first = await review.prepare(DOSAI_REVIEW_SAMPLE);
  const denied = await review.requestApproval(sessionRef(first));
  assert.equal(denied.status, 'denied');
  assert.deepEqual(denied.handoffs, []);
  assert.deepEqual(denied.receipt.body.events.map(({ type }) => type), ['prepared', 'denied']);

  const pending = await review.prepare(DOSAI_REVIEW_SAMPLE);
  assert.equal(pending.status, 'awaiting-approval');
  assert.deepEqual(pending.handoffs, []);
  assert.notEqual(pending.plan.planSha256, denied.plan.planSha256);
  await assert.rejects(review.requestApproval(sessionRef(denied)), /no longer current/);

  confirmation.respond = parent => {
    assert.equal(parent, window);
    return { response: 1 };
  };
  const active = await review.requestApproval(sessionRef(pending));
  assert.equal(active.status, 'active');
  assert.deepEqual(active.plan.config, DOSAI_REVIEW_SAMPLE);
  assert.deepEqual(active.handoffs.map(({ lane, agent }) => [lane, agent]), [
    ['correctness', 'Codex'],
    ['test-coverage', 'Claude'],
  ]);
  const [correctness, coverage] = active.handoffs;
  assert.notEqual(correctness.handoffId, coverage.handoffId);

  const codexReport = {
    ...sessionRef(active), lane: correctness.lane, handoffId: correctness.handoffId,
    verdict: 'No findings', findings: 0,
  };
  const claudeReport = {
    ...sessionRef(active), lane: coverage.lane, handoffId: coverage.handoffId,
    verdict: 'Incomplete', findings: 5,
  };
  await assert.rejects(review.recordReport({ ...claudeReport, handoffId: correctness.handoffId }), /outstanding/);
  assert.deepEqual((await review.getSession()).reports, []);
  assert.equal((await review.recordReport(codexReport)).status, 'active');
  await assert.rejects(review.recordReport(codexReport), /outstanding/);
  const complete = await review.recordReport(claudeReport);
  assert.equal(complete.status, 'complete');
  assert.deepEqual(complete.handoffs, []);
  assert.deepEqual(await review.getSession(), complete);

  const { body, sha256 } = complete.receipt;
  assert.deepEqual(body.plan, active.plan);
  assert.equal(body.status, 'complete');
  assert.equal(body.assurance, 'VOLATILE_UNSIGNED');
  assert.equal(body.effects, 'MANUAL_REVIEW_COORDINATION_ONLY');
  assert.deepEqual(body.events.map(({ type, lane }) => [type, lane]), [
    ['prepared', undefined],
    ['locally-approved', undefined],
    ['report-recorded', 'correctness'],
    ['report-recorded', 'test-coverage'],
    ['completed', undefined],
  ]);
  assert.deepEqual(body.reports.map(({ lane, verdict, findings, provenance }) => [lane, verdict, findings, provenance]), [
    ['correctness', 'No findings', 0, 'OPERATOR_RECORDED_UNVERIFIED'],
    ['test-coverage', 'Incomplete', 5, 'OPERATOR_RECORDED_UNVERIFIED'],
  ]);
  assert.equal(createHash('sha256').update(JSON.stringify(body)).digest('hex'), sha256);

  window.emit('closed');
  assert.equal(await review.getSession(), null);
});
