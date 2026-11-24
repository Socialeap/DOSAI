import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { openProject } from '../../tools/coordination-prototype/project-store.mjs';
import { createAntigravityFixtureReview } from '../../tools/local-coordination-pilot/managed-review.mjs';
import { reviewStudy } from '../../tools/local-coordination-pilot/broker.mjs';

const reply = value => Buffer.from(JSON.stringify({ status: 'completed', reply: value }));
const finding = 'missing_validation';
const exhausted = Buffer.from(JSON.stringify({
  status: 'failed',
  code: 'subscription_sharing_usage_limit_exceeded',
}));

function setup(t, { confirm, exchange, sdkFixture } = {}) {
  const project = openProject(':memory:', { mode: 'antigravity-review' });
  t.after(() => project.close());
  const evidence = {
    mode: 'offline-fixture',
    app: 'dosai-private-beta',
    registrationDigest: 'a'.repeat(64),
    scope: 'chatgpt.tokens.use.direct',
    personalPlan: true,
    appLimitPercent: 25,
    includedUsageAvailable: true,
    observedAtMs: Date.now(),
    executableSha256: 'b6d4ae3a01f5a044d80deba107b27e995944d012a8132cee8a4f3e05c2fd2448',
    signatureRequirementVerified: true,
  };
  const approvals = [];
  const calls = [];
  const review = createAntigravityFixtureReview(project, () => {}, {
    async confirm(plan, digest) {
      approvals.push({ plan, digest });
      return confirm ? confirm() : true;
    },
    sdkFixture() {
      calls.push('hydrogen');
      return sdkFixture ? sdkFixture() : Buffer.from(JSON.stringify({ finding }));
    },
    codexFixture: {
      observe: () => Buffer.from(JSON.stringify(evidence)),
      exchange(request, options) {
        const [field] = request.params.outputSchema.required;
        calls.push(field);
        if (exchange) return exchange(request, options);
        return field === 'assignment' ? reply({ assignment: reviewStudy }) : reply({ received: finding });
      },
    },
  });
  return { review, approvals, calls, evidence };
}

test('an approved plan binds an exact executable, app cap, and included-only transport', async t => {
  const { review, approvals, calls, evidence } = setup(t, {
    exchange(request, { signal, appServer }) {
      assert.equal(signal.aborted, false);
      assert.equal(approvals.length, 1);
      assert.equal(request.mode, 'offline-fixture');
      assert.equal(request.method, 'turn/start');
      assert.equal(request.params.model, 'gpt-6.2-sol');
      assert.equal(request.params.serviceTierForTurn, 'default');
      assert.equal(appServer, approvals[0].plan.leadPreflight.appServer);
      const [field] = request.params.outputSchema.required;
      return field === 'assignment' ? reply({ assignment: reviewStudy }) : reply({ received: finding });
    },
  });
  const saved = await review.run();
  assert.equal(saved.phase, 'complete');
  assert.deepEqual(calls, ['assignment', 'hydrogen', 'received']);
  assert.deepEqual(saved.events.map(event => event.type), ['assignment', 'progress', 'result']);
  const [{ plan, digest }] = approvals;
  assert.equal(plan.externalCostLimitCents, 0);
  assert.match(plan.attemptId, /^[0-9a-f-]{36}$/);
  assert.equal(plan.leadPreflight.registrationDigest, evidence.registrationDigest);
  assert.equal(plan.leadPreflight.appLimitPercent, 25);
  assert.equal(plan.leadPreflight.appServer.pin.version, '0.172.0');
  assert.equal(plan.leadPreflight.appServer.pin.executableSha256, evidence.executableSha256);
  assert.equal(digest, createHash('sha256').update(JSON.stringify(plan)).digest('hex'));
  assert.deepEqual(plan.leadPreflight.appServer.argv.slice(0, 2), ['--listen', 'stdio://']);
  assert.ok(plan.leadPreflight.appServer.argv.includes('model_providers.openai_chatgpt_plan.base_url="https://api.openai.com/v1"'));
  assert.ok(plan.leadPreflight.appServer.argv.includes('model_providers.openai_chatgpt_plan.request_max_retries=0'));
  assert.ok(plan.leadPreflight.appServer.argv.includes('model_providers.openai_chatgpt_plan.stream_max_retries=0'));
  await review.run();
  assert.deepEqual(calls, ['assignment', 'hydrogen', 'received']);
});

test('missing, stale, mismatched, or credit-capable evidence blocks before approval', async t => {
  for (const change of [
    { appLimitPercent: undefined }, { appLimitPercent: 0 }, { appLimitPercent: 100 },
    { appLimitPercent: '25' }, { includedUsageAvailable: false }, { personalPlan: false },
    { app: 'other-app' }, { scope: 'identity-only' }, { mode: 'live' },
    { observedAtMs: Date.now() - 61_000 }, { observedAtMs: Date.now() + 60_000 },
    { executableSha256: 'b'.repeat(64) }, { signatureRequirementVerified: false },
    { registrationDigest: 'invalid' }, { extraField: true },
  ]) {
    const { review, calls, approvals, evidence } = setup(t);
    Object.assign(evidence, change);
    const saved = await review.run();
    assert.equal(saved.notice, 'Review blocked', JSON.stringify(change));
    assert.equal(saved.phase, 'idle');
    assert.deepEqual(approvals, []);
    assert.deepEqual(calls, []);
  }
});

test('declined local approval never reaches the fixture transport', async t => {
  const { review, calls } = setup(t, { confirm: () => false });
  assert.equal((await review.run()).notice, 'Approval declined');
  assert.deepEqual(calls, []);
});

test('a different registration after approval leaves the checklist idle', async t => {
  const { review, evidence, calls } = setup(t, {
    confirm() {
      evidence.registrationDigest = 'b'.repeat(64);
      return true;
    },
  });
  const saved = await review.run();
  assert.equal(saved.phase, 'idle');
  assert.equal(saved.notice, 'Review blocked');
  assert.deepEqual(calls, []);
});

test('exhausted allowance at assignment stops without retry or reviewer dispatch', async t => {
  const { review, calls } = setup(t, { exchange: () => exhausted });
  const saved = await review.run();
  assert.equal(saved.phase, 'stopped');
  assert.equal(saved.notice, 'Review blocked');
  assert.deepEqual(saved.events, []);
  assert.deepEqual(calls, ['assignment']);
});

test('exhaustion at acknowledgement never records a result or retries', async t => {
  const { review, calls } = setup(t, {
    exchange(request) {
      return request.params.outputSchema.required[0] === 'assignment' ?
        reply({ assignment: reviewStudy }) : exhausted;
    },
  });
  const saved = await review.run();
  assert.equal(saved.phase, 'stopped');
  assert.deepEqual(saved.events.map(event => event.type), ['assignment', 'progress']);
  assert.deepEqual(calls, ['assignment', 'hydrogen', 'received']);
});

test('a changed cap before acknowledgement prevents a second Codex call', async t => {
  const { review, evidence, calls } = setup(t, {
    sdkFixture() {
      evidence.appLimitPercent = 50;
      return Buffer.from(JSON.stringify({ finding }));
    },
  });
  const saved = await review.run();
  assert.equal(saved.phase, 'stopped');
  assert.deepEqual(saved.events.map(event => event.type), ['assignment', 'progress']);
  assert.deepEqual(calls, ['assignment', 'hydrogen']);
});

test('a cap change during the reply discards a valid result before any checklist write', async t => {
  const { review, calls, evidence } = setup(t, {
    exchange() {
      evidence.appLimitPercent = 99;
      return reply({ assignment: reviewStudy });
    },
  });
  const saved = await review.run();
  assert.equal(saved.phase, 'stopped');
  assert.deepEqual(saved.events, []);
  assert.deepEqual(calls, ['assignment']);
});

test('repeated declined prompts get different approval digests for the same evidence', async t => {
  const { review, approvals, calls } = setup(t, { confirm: () => false });
  await review.run();
  await review.run();
  assert.equal(approvals.length, 2);
  assert.notEqual(approvals[0].digest, approvals[1].digest);
  assert.deepEqual(calls, []);
});

test('a failed, malformed, or effect-bearing reply cannot create an assignment', async t => {
  for (const bytes of [
    Buffer.from('{"status":"failed","code":"subscription_sharing_usage_unavailable"}'),
    Buffer.from('{"status":"completed","status":"failed","reply":{}}'),
    Buffer.alloc(16 * 1024 + 1),
    reply({ assignment: reviewStudy, command: 'git status' }),
  ]) {
    const { review, calls } = setup(t, { exchange: () => bytes });
    const saved = await review.run();
    assert.equal(saved.phase, 'stopped');
    assert.deepEqual(saved.events, []);
    assert.deepEqual(calls, ['assignment']);
  }
});

test('Stop during Codex dispatch aborts the port and drops a valid late assignment', { timeout: 5000 }, async t => {
  const started = Promise.withResolvers();
  const late = Promise.withResolvers();
  const { review, calls } = setup(t, {
    exchange(_request, { signal }) {
      started.resolve(signal);
      return late.promise;
    },
  });
  const running = review.run();
  const signal = await started.promise;
  assert.equal(review.stop().phase, 'stopped');
  assert.equal(signal.aborted, true);
  assert.equal((await running).phase, 'stopped');
  late.resolve(reply({ assignment: reviewStudy }));
  await setImmediate();
  assert.deepEqual(review.view().events, []);
  assert.deepEqual(calls, ['assignment']);
});
