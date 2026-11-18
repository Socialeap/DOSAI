import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
import test from 'node:test';

import { REVIEW_IPC } from '../../src/contracts/ipc.ts';
import { DOSAI_REVIEW_SAMPLE } from '../../src/contracts/review-session.ts';

const electronFixture = new URL('./review-electron-fixture.mjs', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'electron'
      ? { url: electronFixture, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});
const { registerReviewIpc } = await import('../../src/main/ipc/register-review-ipc.ts');
hooks.deregister();
const { browserWindows, confirmation, handlers } = await import(electronFixture);

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
