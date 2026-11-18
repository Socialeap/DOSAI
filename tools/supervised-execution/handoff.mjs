// A manually transferred selector for the closed synthetic fixture corpus.
import { admitRequest, SliceFailure } from './contracts.ts';

const prefix = 'dosai-fixture-handoff-v1:';
export const FIXTURE_HANDOFF_V1_ACTIONS = Object.freeze(['SUMMARIZE_FIXTURE', 'LIST_FIXTURE_FAILURES']);

function admitFixtureAction(action) {
  return admitRequest({ version: 1, action, fixture: 'beta-core-v1', generation: '1' });
}

export function createFixtureHandoff(action) {
  if (!FIXTURE_HANDOFF_V1_ACTIONS.includes(action)) throw new SliceFailure('ACTION_NOT_ALLOWED');
  return prefix + admitFixtureAction(action).action;
}

export function readFixtureHandoff(token) {
  // Compare against the entire finite set before admitting a fresh local request.
  const action = FIXTURE_HANDOFF_V1_ACTIONS.find(candidate => token === prefix + candidate);
  return admitFixtureAction(action);
}

export function readOperatorRequest(args) {
  if (args.length === 2 && args[0] === '--handoff') {
    return readFixtureHandoff(args[1]);
  }
  if (args.length > 1) throw new Error('ARGUMENT_COUNT');
  return admitFixtureAction(args[0] ?? 'SUMMARIZE_FIXTURE');
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
