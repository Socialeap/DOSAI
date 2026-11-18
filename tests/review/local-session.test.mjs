import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { DOSAI_REVIEW_SAMPLE } from '../../src/contracts/review-session.ts';
import { ReviewSessionEngine } from '../../src/main/review/session-engine.ts';

const sample = DOSAI_REVIEW_SAMPLE;
const ref = ({ plan: { sessionId, planSha256 } }) => ({ sessionId, planSha256 });
const reportFor = (session, handoff, verdict = 'No findings', findings = 0) => ({
  ...ref(session), lane: handoff.lane, handoffId: handoff.handoffId,
  candidateSha: session.plan.config.head, verdict, findings,
});

test('DOSAI sample two-reviewer flow binds approval to one plan and receipts to both reports', async () => {
  const engine = new ReviewSessionEngine();
  assert.equal(await engine.getSession(), null);
  const pending = await engine.prepare(sample);
  assert.equal(pending.status, 'awaiting-approval');
  assert.deepEqual(pending.handoffs, []);
  await assert.rejects(engine.prepare({ ...sample, repository: 'other/target' }), /Stop/);

  const active = await engine.requestApproval(ref(pending), async (plan) => {
    assert.equal(plan, pending.plan);
    return true;
  });
  assert.equal(active.status, 'active');
  assert.deepEqual(active.handoffs.map(({ lane, agent }) => [lane, agent]), [
    ['correctness', 'Codex'], ['test-coverage', 'Claude'],
  ]);
  assert.notEqual(active.handoffs[0].handoffId, active.handoffs[1].handoffId);
  for (const handoff of active.handoffs) {
    for (const value of [sample.repository, sample.base, sample.head, sample.patchSha256, handoff.handoffId]) {
      assert.ok(handoff.prompt.includes(value));
    }
  }

  assert.equal((await engine.recordReport(reportFor(active, active.handoffs[1], 'Findings', 1))).status, 'active');
  const complete = await engine.recordReport(reportFor(active, active.handoffs[0]));
  assert.equal(complete.status, 'complete');
  assert.deepEqual(complete.handoffs, []);
  assert.deepEqual(complete.reports.map(({ findings, provenance }) => [findings, provenance]), [
    [1, 'OPERATOR_RECORDED_UNVERIFIED'], [0, 'OPERATOR_RECORDED_UNVERIFIED'],
  ]);
  assert.deepEqual(complete.receipt.body.events.map(({ type }) => type), [
    'prepared', 'locally-approved', 'report-recorded', 'report-recorded', 'completed',
  ]);
  assert.equal(complete.receipt.body.assurance, 'VOLATILE_UNSIGNED');
  assert.equal(complete.receipt.sha256, createHash('sha256').update(JSON.stringify(complete.receipt.body)).digest('hex'));
  assert.throws(() => complete.receipt.body.events.push({ type: 'prepared' }), TypeError);
  assert.equal((await engine.stop(ref(complete))).status, 'complete');
  assert.equal(pending.receipt.body.events.length, 1);
});

test('malformed pins, repository strings, assignments and approval fields fail closed', async () => {
  const engine = new ReviewSessionEngine();
  for (const invalid of [
    { ...sample, repository: 'https://github.com/Socialeap/DOSAI' },
    { ...sample, repository: 'owner/repo\n' },
    { ...sample, repository: '../DOSAI' },
    { ...sample, head: 'HEAD' },
    { ...sample, head: sample.base },
    { ...sample, base: '0'.repeat(40) },
    { ...sample, patchSha256: 'f'.repeat(65) },
    { ...sample, patchSha256: '0'.repeat(64) },
    { ...sample, testCoverage: 'Codex' },
    { ...sample, testCoverage: 'any-provider' },
    { ...sample, cmd: 'extra' },
    Object.create(sample),
  ]) await assert.rejects(engine.prepare(invalid), /Invalid|Use a repository/);
  assert.equal(await engine.getSession(), null);

  const pending = await engine.prepare(sample);
  const unexpected = () => assert.fail('Invalid input reached native confirmation');
  for (const invalid of [
    { ...ref(pending), planSha256: 'a'.repeat(64) },
    { ...ref(pending), sessionId: 'previous' },
    { ...ref(pending), approved: true },
  ]) await assert.rejects(engine.requestApproval(invalid, unexpected));
  assert.equal((await engine.getSession()).status, 'awaiting-approval');
});

test('denial, unavailable confirmation, and a non-boolean value expose no handoffs', async () => {
  const engine = new ReviewSessionEngine();
  for (const confirm of [
    async () => false,
    async () => 1,
    async () => { throw new Error('dialog unavailable'); },
  ]) {
    const pending = await engine.prepare(sample);
    const denied = await engine.requestApproval(ref(pending), confirm);
    assert.equal(denied.status, 'denied');
    assert.deepEqual(denied.handoffs, []);
    await assert.rejects(engine.requestApproval(ref(pending), confirm), /cannot request/);
  }
  assert.equal((await engine.getSession()).receipt.body.events.at(-1).type, 'confirmation-unavailable');
});

test('a stopped session, replaced session, or cleared window cannot accept a delayed approval', async () => {
  for (const action of ['stop', 'replace', 'clear']) {
    const engine = new ReviewSessionEngine();
    const pending = await engine.prepare(sample);
    const deferred = Promise.withResolvers();
    const approval = engine.requestApproval(ref(pending), () => deferred.promise);
    await assert.rejects(engine.requestApproval(ref(pending), async () => true), /cannot request/);
    if (action === 'clear') engine.clear();
    else await engine.stop(ref(pending));
    if (action === 'replace') await engine.prepare(sample);
    deferred.resolve(true);
    if (action === 'stop') assert.equal((await approval).status, 'stopped');
    else await assert.rejects(approval, /no longer current/);
    assert.equal((await engine.getSession())?.handoffs.length ?? 0, 0);
  }
});

test('approval expiry uses monotonic time and takes priority over a late confirmation', async () => {
  let elapsed = 0;
  const engine = new ReviewSessionEngine(() => '2026-11-18T00:00:00.000Z', () => elapsed);
  const pending = await engine.prepare(sample);
  assert.equal(pending.plan.approvalExpiresAt, '2026-11-18T00:05:00.000Z');
  const expired = await engine.requestApproval(ref(pending), async () => {
    elapsed = 300_000;
    return true;
  });
  assert.equal(expired.status, 'expired');
  assert.deepEqual(expired.handoffs, []);
});

test('a report must include the exact candidate SHA without changing the receipt on rejection', async () => {
  const engine = new ReviewSessionEngine();
  const pending = await engine.prepare(sample);
  const active = await engine.requestApproval(ref(pending), async () => true);
  const { candidateSha, ...withoutCandidate } = reportFor(active, active.handoffs[0]);

  await assert.rejects(engine.recordReport(withoutCandidate), /Invalid review input/);
  for (const invalid of [sample.base, candidateSha.slice(0, 7), candidateSha.toUpperCase(), candidateSha + ' ', null]) {
    await assert.rejects(
      engine.recordReport({ ...withoutCandidate, candidateSha: invalid }),
      /does not match the pinned candidate commit/,
    );
  }
  assert.deepEqual(await engine.getSession(), active);

  const recorded = await engine.recordReport({ ...withoutCandidate, candidateSha });
  assert.equal(recorded.reports[0].provenance, 'OPERATOR_RECORDED_UNVERIFIED');
  assert.equal(recorded.receipt.body.plan.config.head, candidateSha);
});

test('wrong lane, cross-plan, duplicate and inconsistent reports do not advance the session', async () => {
  const engine = new ReviewSessionEngine();
  const first = await engine.prepare(sample);
  const active = await engine.requestApproval(ref(first), async () => true);
  const report = reportFor(active, active.handoffs[0]);

  for (const invalid of [
    { ...report, lane: 'test-coverage' },
    { ...report, handoffId: active.handoffs[1].handoffId },
    { ...report, findings: 1 },
    { ...report, verdict: 'Findings' },
    { ...report, verdict: 'Incomplete', findings: 100 },
    { ...report, notes: 'unexpected data' },
  ]) await assert.rejects(engine.recordReport(invalid));
  assert.equal((await engine.getSession()).reports.length, 0);

  await engine.recordReport(report);
  await assert.rejects(engine.recordReport(report), /outstanding/);
  const stopped = await engine.stop(ref(active));
  assert.deepEqual(stopped.handoffs, []);
  await assert.rejects(engine.recordReport(reportFor(active, active.handoffs[1])), /outstanding/);

  const next = await engine.prepare(sample);
  await assert.rejects(engine.recordReport(report), /no longer current/);
  const again = await engine.requestApproval(ref(next), async () => true);
  await assert.rejects(engine.recordReport({ ...report, ...ref(again) }), /outstanding/);
});


test('closing during plan hashing prevents the pending plan from returning', async () => {
  const engine = new ReviewSessionEngine();
  const preparing = engine.prepare(sample);
  const duplicate = assert.rejects(engine.prepare(sample), /Stop/);
  const cancelled = assert.rejects(preparing, /no longer current/);
  engine.clear();
  await Promise.all([duplicate, cancelled]);
  assert.equal(await engine.getSession(), null);
});

test('stop withholds a snapshot that was hashing an active handoff', async () => {
  const engine = new ReviewSessionEngine();
  const pending = await engine.prepare(sample);
  const active = await engine.requestApproval(ref(pending), async () => true);

  const stale = assert.rejects(engine.getSession(), /changed before its receipt/);
  const stopped = await engine.stop(ref(active));
  await stale;
  assert.equal(stopped.status, 'stopped');
  assert.deepEqual(stopped.handoffs, []);
});
