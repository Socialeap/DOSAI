import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  admitLifecycleProofOutput,
  isSuccessfulLifecycleProof,
} from './service-management-lifecycle-proof.mjs';

export const stableLifecycleProofApplication =
  '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app';
export const stableLifecycleProofExecutable = join(
  stableLifecycleProofApplication,
  'Contents/MacOS/DOSAI',
);

const resultPrefix = 'DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:';
const execFileAsync = promisify(execFile);

function admitRunnerArguments(arguments_) {
  if (arguments_.length !== 0) {
    throw new Error('DOSAI_STAGED_LIFECYCLE_PROOF_ARGUMENTS_0001');
  }
}

export async function runStagedServiceManagementLifecycleProof() {
  const { stdout, stderr } = await execFileAsync(stableLifecycleProofExecutable, [], {
    encoding: 'utf8',
    env: {
      LANG: 'C',
      LC_ALL: 'C',
      PATH: '/usr/bin:/bin',
    },
    killSignal: 'SIGKILL',
    maxBuffer: 4096,
    timeout: 15_000,
    windowsHide: true,
  });
  return admitLifecycleProofOutput(stdout, stderr);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  admitRunnerArguments(process.argv.slice(2));
  const receipt = await runStagedServiceManagementLifecycleProof();
  process.stdout.write(`${resultPrefix}${JSON.stringify(receipt)}\n`);
  if (!isSuccessfulLifecycleProof(receipt)) process.exitCode = 1;
}
