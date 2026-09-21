import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const proofExecutable = resolve(root, 'out/DOSAI-darwin-arm64/DOSAI.app/Contents/MacOS/DOSAI');
const resultPrefix = 'DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:';
const allowedObservations = new Set([
  'NOT_REGISTERED',
  'ENABLED',
  'REQUIRES_APPROVAL',
  'NOT_FOUND',
  'NATIVE_ADDON_LOAD_FAILED',
  'NATIVE_STATUS_CALL_FAILED',
  'ELECTRON_READINESS_FAILED',
]);
const execFileAsync = promisify(execFile);

function admitRunnerArguments(arguments_) {
  if (arguments_.length !== 0) {
    throw new Error('DOSAI_STATUS_PROOF_ARGUMENTS_0001');
  }
}

function admitProofOutput(stdout, stderr) {
  if (stderr !== '') {
    throw new Error('DOSAI_STATUS_PROOF_STDERR_0001');
  }
  const match = new RegExp(`^${resultPrefix}([A-Z_]+)\\n$`).exec(stdout);
  if (match === null || !allowedObservations.has(match[1])) {
    throw new Error('DOSAI_STATUS_PROOF_OUTPUT_0001');
  }
  return match[1];
}

export async function runServiceManagementStatusProof() {
  const { stdout, stderr } = await execFileAsync(proofExecutable, [], {
    encoding: 'utf8',
    env: {
      LANG: 'C',
      LC_ALL: 'C',
      PATH: '/usr/bin:/bin',
    },
    killSignal: 'SIGKILL',
    maxBuffer: 1024,
    timeout: 15_000,
    windowsHide: true,
  });
  return admitProofOutput(stdout, stderr);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  admitRunnerArguments(process.argv.slice(2));
  const observation = await runServiceManagementStatusProof();
  process.stdout.write(`${resultPrefix}${observation}\n`);
}
