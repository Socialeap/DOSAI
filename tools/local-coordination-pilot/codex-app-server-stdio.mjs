import { addAbortListener } from 'node:events';
import { isDeepStrictEqual } from 'node:util';
import { parseStrictJsonBytes } from '../../src/contracts/strict-json.ts';
import { managedTurn, maxTurnBytes } from './managed-turn.mjs';

const provider = 'openai_chatgpt_plan';
const maxFrameBytes = 32 * 1024;
const maxTranscriptBytes = 128 * 1024;
const maxFrames = 128;
const maxSessionMs = 3000;
const exhausted = 'subscription_sharing_usage_limit_exceeded';
const benignItems = new Set(['userMessage', 'reasoning', 'agentMessage']);
const optOutNotificationMethods = [
  'thread/started', 'thread/status/changed', 'thread/tokenUsage/updated',
  'item/agentMessage/delta', 'item/reasoning/summaryTextDelta',
  'item/reasoning/summaryPartAdded', 'item/reasoning/textDelta',
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function assertFixtureRequest(request, appServer) {
  const schema = request?.params?.outputSchema;
  const field = schema?.required?.[0];
  if (request?.mode !== 'offline-fixture' || request.method !== 'turn/start' ||
      appServer?.app !== 'dosai-private-beta' || typeof appServer.model !== 'string' ||
      !['assignment', 'received'].includes(field)) {
    throw new Error('Codex stdio fixture request rejected.');
  }
  const turn = field === 'assignment' ? managedTurn('assign', undefined, 'carbon') :
    managedTurn('acknowledge', schema?.properties?.received?.enum?.[0], 'carbon');
  if (!isDeepStrictEqual(request.params, {
    model: appServer.model, serviceTierForTurn: 'default',
    input: [{ type: 'text', text: turn.prompt }], outputSchema: turn.schema,
  })) throw new Error('Codex stdio fixture request rejected.');
}

function hasUnexpectedItems(turn) {
  return turn.items !== undefined &&
    (!Array.isArray(turn.items) || turn.items.some(item => !benignItems.has(item?.type)));
}

async function* readFrames(input) {
  let pending = Buffer.alloc(0);
  let bytesRead = 0;
  let framesRead = 0;
  for await (const chunk of input) {
    if (!Buffer.isBuffer(chunk)) throw new Error('Expected binary Codex stdio.');
    bytesRead += chunk.length;
    if (bytesRead > maxTranscriptBytes) throw new Error('Codex transcript exceeded its bound.');
    pending = Buffer.concat([pending, chunk]);
    let newline;
    while ((newline = pending.indexOf(10)) !== -1) {
      if (!newline || newline > maxFrameBytes || ++framesRead > maxFrames) {
        throw new Error('Invalid Codex stdio frame.');
      }
      const frame = parseStrictJsonBytes(pending.subarray(0, newline));
      if (!isRecord(frame) || (Object.hasOwn(frame, 'jsonrpc') && frame.jsonrpc !== '2.0')) {
        throw new Error('Invalid Codex RPC message.');
      }
      pending = pending.subarray(newline + 1);
      yield frame;
    }
    if (pending.length > maxFrameBytes) throw new Error('Codex stdio frame exceeded its bound.');
  }
}

function allowanceExhausted(error) {
  return error?.codexErrorInfo === 'usageLimitExceeded' ||
    error?.code === exhausted || error?.data?.code === exhausted;
}

function exhaustedReceipt() {
  return Buffer.from(JSON.stringify({ status: 'failed', code: exhausted }));
}

async function runTurn(frames, write, request, appServer) {
  async function call(id, method, params) {
    await write({ id, method, params });
    const { value: message } = await frames.next();
    if (!message || message.id !== id || Object.hasOwn(message, 'method') ||
        Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error')) {
      throw new Error('Unexpected Codex RPC response.');
    }
    return message;
  }

  const initialized = await call(1, 'initialize', {
    clientInfo: { name: appServer.app, title: 'DOSAI Private Beta', version: '0.1.0' },
    capabilities: { experimentalApi: true, optOutNotificationMethods },
  });
  if (typeof initialized.result?.userAgent !== 'string' || !initialized.result.userAgent) {
    throw new Error('Codex initialization rejected.');
  }
  await write({ method: 'initialized' });
  const started = await call(2, 'thread/start', {
    model: appServer.model, modelProvider: provider, ephemeral: true,
    approvalPolicy: 'never', sandbox: 'read-only', environments: [],
  });
  const thread = started.result?.thread;
  if (!validId(thread?.id) || thread.ephemeral !== true || thread.modelProvider !== provider ||
      started.result.modelProvider !== provider || started.result.model !== appServer.model ||
      started.result.approvalPolicy !== 'never' || started.result.sandbox?.type !== 'readOnly' ||
      started.result.sandbox.networkAccess !== false ||
      !Array.isArray(started.result.instructionSources) || started.result.instructionSources.length !== 0) {
    throw new Error('Codex thread scope rejected.');
  }
  const { input, outputSchema } = request.params;
  const accepted = await call(3, 'turn/start', {
    threadId: thread.id, model: appServer.model, serviceTierForTurn: 'default', input, outputSchema,
  });
  if (allowanceExhausted(accepted.error)) return exhaustedReceipt();
  const turn = accepted.result?.turn;
  if (!validId(turn?.id) || turn.status !== 'inProgress' || hasUnexpectedItems(turn)) {
    throw new Error('Codex turn rejected.');
  }

  let seenStart = false;
  let reply;
  for await (const message of frames) {
    if (Object.hasOwn(message, 'id') || Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error')) {
      throw new Error('Unexpected Codex server request or response.');
    }
    const { method, params } = message;
    if (!isRecord(params) || params.threadId !== thread.id) throw new Error('Codex thread mismatch.');
    if (method === 'turn/started') {
      if (seenStart || params.turn?.id !== turn.id || params.turn.status !== 'inProgress' ||
          hasUnexpectedItems(params.turn)) {
        throw new Error('Unexpected Codex turn start.');
      }
      seenStart = true;
    } else if (method === 'turn/completed') {
      if (params.turn?.id !== turn.id || hasUnexpectedItems(params.turn)) throw new Error('Codex turn mismatch.');
      if (params.turn.status === 'failed' && allowanceExhausted(params.turn.error)) return exhaustedReceipt();
      if (!seenStart || params.turn.status !== 'completed' || params.turn.error !== null || reply === undefined) {
        throw new Error('Codex turn did not complete.');
      }
      return Buffer.from(JSON.stringify({ status: 'completed', reply }));
    } else {
      if (params.turnId !== turn.id) throw new Error('Codex turn mismatch.');
      if (method === 'error' && params.willRetry === false && allowanceExhausted(params.error)) {
        return exhaustedReceipt();
      }
      if (!seenStart || !['item/started', 'item/completed'].includes(method) ||
          !benignItems.has(params.item?.type) || !validId(params.item.id)) {
        throw new Error('Unexpected Codex event.');
      }
      if (method === 'item/completed' && params.item.type === 'agentMessage') {
        if (reply !== undefined || ![undefined, null, 'final_answer'].includes(params.item.phase) ||
            typeof params.item.text !== 'string' || Buffer.byteLength(params.item.text) > maxTurnBytes) {
          throw new Error('Invalid Codex reply.');
        }
        reply = parseStrictJsonBytes(Buffer.from(params.item.text));
      }
    }
  }
  throw new Error('Codex stdio closed before completion.');
}

// Each fixture supplies a fresh pair of owned streams. The adapter sends no
// credentials and owns no process, provider connection, or retry path.
export function createCodexAppServerFixtureExchange(openChannel) {
  if (typeof openChannel !== 'function') throw new Error('Codex fixture channel is required.');
  return async (request, { signal, appServer }) => {
    assertFixtureRequest(request, appServer);
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(maxSessionMs)]);
    bounded.throwIfAborted();
    const { input, output } = openChannel();
    const frames = readFrames(input);
    const write = message => new Promise((resolve, reject) => {
      bounded.throwIfAborted();
      output.write(`${JSON.stringify(message)}\n`, error => error ? reject(error) : resolve());
    });

    let fail;
    const stopped = new Promise((_, reject) => { fail = reject; });
    const onError = () => fail(new Error('Codex stdio I/O failed.'));
    input.on('error', onError);
    output.on('error', onError);
    const abort = addAbortListener(bounded, () => fail(bounded.reason));
    try {
      const reply = await Promise.race([runTurn(frames, write, request, appServer), stopped]);
      bounded.throwIfAborted();
      return reply;
    } catch {
      bounded.throwIfAborted();
      throw new Error('Codex App Server fixture rejected.');
    } finally {
      abort[Symbol.dispose]();
      input.destroy();
      output.destroy();
    }
  };
}
