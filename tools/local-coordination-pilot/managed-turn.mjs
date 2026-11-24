import { Buffer } from 'node:buffer';
import { parseStrictJsonBytes } from '../../src/contracts/strict-json.ts';
import { pilotRoles, reviewFindings, reviewFixture, reviewStudy } from './broker.mjs';

export const maxTurnBytes = 16 * 1024;

export function managedTurn(step, finding, reviewer = 'claude') {
  const roles = pilotRoles(reviewer);
  const reviewerName = reviewer === 'carbon' ? 'Antigravity Hydrogen' : 'Claude Code';
  const fixture = JSON.stringify(reviewFixture);
  const turns = {
    assign: {
      actor: 'codex', field: 'assignment', choices: [reviewStudy],
      instruction: `As lead engineer, assign ${reviewerName} one read-only review of the synthetic input fixture.`,
    },
    review: {
      actor: roles.review, field: 'finding', choices: reviewFindings,
      instruction: 'As review specialist, compare the observed and expected behavior. Choose one finding.',
    },
    acknowledge: {
      actor: 'codex', field: 'received', choices: [finding],
      instruction: 'As lead engineer, acknowledge receipt of this review finding ID.',
    },
  };
  if (!Object.hasOwn(turns, step) || (step === 'acknowledge' ? !reviewFindings.includes(finding) : finding !== undefined)) {
    throw new Error('Managed review turn rejected.');
  }
  const { actor, field, choices, instruction } = turns[step];
  const data = step === 'acknowledge' ? JSON.stringify({ finding }) : fixture;
  const rule = Object.freeze({ type: 'string', enum: Object.freeze([...choices]) });
  return Object.freeze({
    actor, step,
    prompt: `${instruction}\nSynthetic data: ${data}`,
    schema: Object.freeze({
      type: 'object',
      properties: Object.freeze({ [field]: rule }),
      required: Object.freeze([field]),
      additionalProperties: false,
    }),
  });
}

function codexOutput(bytes) {
  const lines = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).split('\n');
  if (lines.pop() !== '' || lines.length < 4 || lines.length > 32) {
    throw new Error('Invalid Codex event stream.');
  }
  const events = lines.map(line => parseStrictJsonBytes(Buffer.from(line)));
  if (events[0]?.type !== 'thread.started' || events[1]?.type !== 'turn.started' ||
      events.at(-1)?.type !== 'turn.completed') {
    throw new Error('Codex turn did not complete.');
  }
  let reply;
  for (const event of events.slice(2, -1)) {
    const item = event?.item;
    if (event?.type === 'item.completed' && item?.type === 'agent_message' &&
        typeof item.text === 'string' && reply === undefined) {
      reply = parseStrictJsonBytes(Buffer.from(item.text));
    } else if (!['item.started', 'item.updated', 'item.completed'].includes(event?.type) || item?.type !== 'reasoning') {
      throw new Error('Unexpected Codex event.');
    }
  }
  return reply;
}

export function readManagedOutput(turn, bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxTurnBytes) {
    throw new Error('Managed worker output size rejected.');
  }
  let reply;
  if (turn.actor === 'codex') {
    reply = codexOutput(bytes);
  } else if (turn.actor === 'claude') {
    const result = parseStrictJsonBytes(bytes);
    if (result?.type !== 'result' || result.subtype !== 'success' || result.is_error !== false) {
      throw new Error('Claude Code review did not complete.');
    }
    reply = result.structured_output;
  } else if (turn.actor === 'carbon' && turn.step === 'review') {
    reply = parseStrictJsonBytes(bytes);
  }
  const [field] = turn.schema.required;
  if (reply === null || typeof reply !== 'object' || Array.isArray(reply) ||
      Object.keys(reply).length !== 1 || !Object.hasOwn(reply, field) ||
      !turn.schema.properties[field].enum.includes(reply[field])) {
    throw new Error('Managed worker reply rejected.');
  }
  return reply[field];
}
