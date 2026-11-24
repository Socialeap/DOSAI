import { isDeepStrictEqual } from 'node:util';
import { parseStrictJsonBytes } from '../../src/contracts/strict-json.ts';
import { managedTurn, maxTurnBytes, readManagedReply } from './managed-turn.mjs';

const pin = Object.freeze({
  version: '0.172.0',
  target: 'aarch64-apple-darwin',
  teamId: '2DC432GLL2',
  identifier: 'codex-app-server',
  archiveSha256: 'b18587f0c0fe957b729aa722adc287c7eaee3aa2bb469c68921ebff1632b07d9',
  executableSha256: 'b6d4ae3a01f5a044d80deba107b27e995944d012a8132cee8a4f3e05c2fd2448',
});
const app = 'dosai-private-beta';
const model = 'gpt-6.2-sol';
const scope = 'chatgpt.tokens.use.direct';
const maxObservationAgeMs = 60_000;
const maxReplyMs = 3_000;
const provider = 'openai_chatgpt_plan';
const appServer = Object.freeze({
  pin, app, model, scope,
  argv: Object.freeze([
    '--listen', 'stdio://',
    '-c', 'approval_policy="never"',
    '-c', 'sandbox_mode="read-only"',
    '-c', 'web_search="disabled"',
    '-c', `model_provider="${provider}"`,
    '-c', `model_providers.${provider}.name="ChatGPT plan"`,
    '-c', `model_providers.${provider}.base_url="https://api.openai.com/v1"`,
    '-c', `model_providers.${provider}.env_key="ACCESS_TOKEN"`,
    '-c', `model_providers.${provider}.wire_api="responses"`,
    '-c', `model_providers.${provider}.requires_openai_auth=false`,
    '-c', `model_providers.${provider}.supports_websockets=false`,
    '-c', `model_providers.${provider}.request_max_retries=0`,
    '-c', `model_providers.${provider}.stream_max_retries=0`,
  ]),
});

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function readPreflight(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 4096) {
    throw new Error('Codex fixture preflight is missing.');
  }
  const observation = parseStrictJsonBytes(bytes);
  if (!exactKeys(observation, [
    'mode', 'app', 'registrationDigest', 'scope', 'personalPlan', 'appLimitPercent',
    'includedUsageAvailable', 'observedAtMs', 'executableSha256', 'signatureRequirementVerified',
  ])) throw new Error('Codex fixture preflight shape rejected.');

  if (observation.mode !== 'offline-fixture' || observation.app !== app || observation.scope !== scope ||
      typeof observation.registrationDigest !== 'string' || !/^[a-f0-9]{64}$/.test(observation.registrationDigest) ||
      observation.personalPlan !== true || observation.includedUsageAvailable !== true ||
      !Number.isInteger(observation.appLimitPercent) ||
      observation.appLimitPercent < 1 || observation.appLimitPercent >= 100) {
    throw new Error('Codex included-only evidence rejected.');
  }
  if (observation.executableSha256 !== pin.executableSha256 || observation.signatureRequirementVerified !== true) {
    throw new Error('Codex executable identity rejected.');
  }
  const now = Date.now();
  if (!Number.isSafeInteger(observation.observedAtMs) || observation.observedAtMs > now ||
      observation.observedAtMs <= now - maxObservationAgeMs) {
    throw new Error('Codex included-only evidence expired.');
  }
  return Object.freeze({
    appServer,
    registrationDigest: observation.registrationDigest,
    appLimitPercent: observation.appLimitPercent,
    observedAtMs: observation.observedAtMs,
  });
}

// The port models the trusted supervisor's terminal projection of an App Server
// turn. It never receives credentials, raw environment, or a process handle.
export function createIncludedCodexFixture({ observe, exchange }) {
  if (typeof observe !== 'function' || typeof exchange !== 'function') {
    throw new Error('Codex launcher requires offline fixture ports.');
  }
  const preflight = () => readPreflight(observe());
  function revalidate(approved) {
    if (!isDeepStrictEqual(preflight(), approved)) throw new Error('Codex approved evidence changed.');
  }
  return Object.freeze({
    preflight, revalidate,
    async execute(step, finding, approved, { signal }) {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(maxReplyMs)]);
      bounded.throwIfAborted();
      if (step !== 'assign' && step !== 'acknowledge') throw new Error('Codex fixture turn rejected.');
      const turn = managedTurn(step, finding, 'carbon');

      const request = Object.freeze({
        mode: 'offline-fixture',
        method: 'turn/start',
        params: Object.freeze({
          model, serviceTierForTurn: 'default',
          input: Object.freeze([Object.freeze({ type: 'text', text: turn.prompt })]),
          outputSchema: turn.schema,
        }),
      });
      let cancel;
      const stopped = new Promise((_, reject) => {
        cancel = () => reject(bounded.reason);
        bounded.addEventListener('abort', cancel, { once: true });
      });
      try {
        const pending = Promise.resolve().then(() => {
          bounded.throwIfAborted();
          revalidate(approved);
          bounded.throwIfAborted();
          return exchange(request, { signal: bounded, appServer });
        });
        const bytes = await Promise.race([pending, stopped]);
        bounded.throwIfAborted();
        revalidate(approved);
        bounded.throwIfAborted();
        if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxTurnBytes) {
          throw new Error('Codex terminal fixture output rejected.');
        }
        const output = parseStrictJsonBytes(bytes);
        if (exactKeys(output, ['status', 'code']) && output.status === 'failed' &&
            output.code === 'subscription_sharing_usage_limit_exceeded') {
          throw new Error('Codex included allowance exhausted.');
        }
        if (!exactKeys(output, ['status', 'reply']) || output.status !== 'completed') {
          throw new Error('Codex fixture did not complete.');
        }
        return readManagedReply(turn, output.reply);
      } finally {
        bounded.removeEventListener('abort', cancel);
      }
    },
  });
}
