import { verifyAuditJournal } from '../../native-helpers/audit/journal.ts';
import { assessPrivateBetaReadiness } from '../../scripts/report-private-beta-readiness.mjs';
import { digest } from '../supervised-execution/engine.ts';
import { createLocalFixtureSession } from '../supervised-execution/runtime.mjs';

const fixture = Object.freeze({
  version: 1,
  action: 'SUMMARIZE_FIXTURE',
  fixture: 'beta-core-v1',
  generation: '1',
});
const route = 'fixture.summary.v1';
const authority = 'SYNTHETIC_NO_EFFECT_TEST_ONLY';
const proposalTag = 'P'.charCodeAt(0);
const confirmTag = 'C'.charCodeAt(0);
const denyTag = 'D'.charCodeAt(0);
const spentChannels = new WeakSet();

// Read-only preflight for the inactive device launch. The current source has
// no authority verifier for a live device run, even after P3 is accepted.
export async function inspectDeviceActivation() {
  try {
    const readiness = await assessPrivateBetaReadiness();
    return Object.freeze({
      status: 'NO_GO',
      reason: 'LIVE_ACTIVATION_UNAVAILABLE',
      blockers: Object.freeze(readiness.blockers.map(({ id }) => id)),
    });
  } catch {
    return Object.freeze({
      status: 'NO_GO',
      reason: 'PREREQUISITE_EVIDENCE_UNAVAILABLE',
      blockers: Object.freeze([]),
    });
  }
}

function verifiedOutcome(databasePath, receipt, prepared) {
  const { body, acknowledgement } = receipt;
  if (receipt.audit !== 'LOCAL_DURABLE' || acknowledgement?.assurance !== 'LOCAL_DURABLE' ||
      acknowledgement.request_message_id !== body.receiptId ||
      body.authority !== authority || body.effects !== 'NONE' ||
      body.planDigest !== (prepared?.planDigest ?? null) ||
      body.route !== (prepared?.route ?? null) || receipt.digest !== digest(body) ||
      !['SUCCEEDED', 'DENIED', 'STOPPED'].includes(body.status) ||
      (body.status !== 'SUCCEEDED' && (body.result !== null || body.authorization !== null))) {
    return Object.freeze({ status: 'UNKNOWN', reason: 'OUTCOME_UNVERIFIED' });
  }
  try {
    const result = verifyAuditJournal(databasePath, {
      journalId: acknowledgement.journal_id,
      journalEpochId: acknowledgement.journal_epoch_id,
    }, { sequence: acknowledgement.sequence, eventHash: acknowledgement.event_hash });
    if (result.assurance !== 'LOCAL_DURABLE') throw new Error('AUDIT_UNVERIFIED');
  } catch {
    return Object.freeze({ status: 'UNKNOWN', reason: 'OUTCOME_UNVERIFIED' });
  }
  return Object.freeze({
    status: body.status, reason: body.reason, audit: receipt.audit, effects: body.effects,
    result: body.result,
  });
}

async function awaitLocalEvent(signal, receive) {
  signal.throwIfAborted();
  let abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([interrupted, receive(signal)]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

// This bridge is for the fixed synthetic proof on M4 only. Its channel is a
// private local link owned by the trusted caller, separate from stream bytes.
// The peer cannot supply an operation, path, plan, or approval through it.
export async function runLocalFixtureReview(channel, databasePath, signal) {
  if (channel === null || typeof channel !== 'object' ||
      typeof channel.takeProposal !== 'function' || typeof channel.reviewPlan !== 'function') {
    return Object.freeze({ status: 'REJECTED', reason: 'LOCAL_CHANNEL_REQUIRED' });
  }
  if (spentChannels.has(channel)) return Object.freeze({ status: 'REJECTED', reason: 'CHANNEL_CONSUMED' });
  spentChannels.add(channel);
  let engine;
  try {
    const deadline = AbortSignal.timeout(60_000);
    const reviewSignal = signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
    const proposal = await awaitLocalEvent(reviewSignal, current => channel.takeProposal(current));
    if (reviewSignal.aborted || !Buffer.isBuffer(proposal) || proposal.length !== 1 || proposal[0] !== proposalTag) {
      return Object.freeze({ status: 'REJECTED', reason: 'PROPOSAL_REJECTED' });
    }

    engine = await createLocalFixtureSession(databasePath);
    if (reviewSignal.aborted) return verifiedOutcome(databasePath, engine.stop(), null);
    const prepared = engine.prepare(fixture);
    if (prepared.status !== 'AWAITING_APPROVAL') return verifiedOutcome(databasePath, prepared, null);
    if (prepared.route !== route || prepared.authority !== authority ||
        !/^[0-9a-f]{64}$/.test(prepared.planDigest)) {
      return verifiedOutcome(databasePath, engine.stop(), null);
    }

    const binding = Buffer.from(prepared.planDigest, 'hex');
    const decision = await awaitLocalEvent(reviewSignal, current => channel.reviewPlan(Buffer.from(binding), current));
    if (reviewSignal.aborted || !Buffer.isBuffer(decision) || decision.length !== 33 ||
        !binding.equals(decision.subarray(1)) || ![confirmTag, denyTag].includes(decision[0])) {
      return verifiedOutcome(databasePath, engine.stop(), null);
    }
    const result = engine.run(prepared, decision[0] === confirmTag ? prepared.approvalInstruction : null);
    return verifiedOutcome(databasePath, result, prepared);
  } catch {
    if (engine) {
      try { return verifiedOutcome(databasePath, engine.stop(), null); } catch { /* evidence unavailable */ }
    }
    return Object.freeze({ status: 'UNKNOWN', reason: 'LOCAL_REVIEW_UNAVAILABLE' });
  }
}
