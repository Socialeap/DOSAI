// A manually transferred selector for the closed synthetic fixture corpus.
import { admitRequest, ROUTES } from './contracts.ts';

const prefix = 'dosai-fixture-handoff-v1:';
const actions = Object.keys(ROUTES);

export function createFixtureHandoff(action) {
  return prefix + admitRequest({ version: 1, action, fixture: 'beta-core-v1', generation: '1' }).action;
}

export function readFixtureHandoff(token) {
  // Compare against the entire finite set before admitting a fresh local request.
  const action = actions.find(candidate => token === prefix + candidate);
  return admitRequest({ version: 1, action, fixture: 'beta-core-v1', generation: '1' });
}

if (import.meta.main) {
  if (process.version !== 'v24.18.0') {
    console.error('PINNED_RUNTIME_REQUIRED: use Node v24.18.0.');
    process.exitCode = 2;
  } else {
    try {
      if (process.argv.length !== 3) throw new Error('ARGUMENT_COUNT');
      console.log(createFixtureHandoff(process.argv[2]));
    } catch {
      console.error('Usage: node tools/supervised-execution/handoff.mjs SUMMARIZE_FIXTURE|LIST_FIXTURE_FAILURES');
      process.exitCode = 2;
    }
  }
}
