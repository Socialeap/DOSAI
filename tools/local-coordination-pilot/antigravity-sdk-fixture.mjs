import { managedTurn } from './managed-turn.mjs';

export const hydrogenModel = 'gemini-4-hydrogen';
const turn = managedTurn('review', undefined, 'carbon');
const request = Object.freeze({
  mode: 'offline-fixture',
  model: hydrogenModel,
  prompt: turn.prompt,
  schema: turn.schema,
});
const maxFixtureMs = 3000;

// The host supplies an in-process fixture port. There is no default provider transport.
export function createAntigravitySdkFixtureTurn(sdkFixture) {
  if (typeof sdkFixture !== 'function') throw new Error('An offline Antigravity SDK fixture is required.');
  return async ({ signal, onStart }) => {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(maxFixtureMs)]);
    bounded.throwIfAborted();
    let cancel;
    const stopped = new Promise((_, reject) => {
      cancel = () => reject(bounded.reason);
      bounded.addEventListener('abort', cancel, { once: true });
    });
    try {
      const pending = Promise.resolve().then(() => {
        bounded.throwIfAborted();
        onStart?.();
        bounded.throwIfAborted();
        return sdkFixture(request, { signal: bounded });
      });
      const result = await Promise.race([pending, stopped]);
      bounded.throwIfAborted();
      return result;
    } finally {
      bounded.removeEventListener('abort', cancel);
    }
  };
}
