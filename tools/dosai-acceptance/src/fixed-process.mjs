import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);

export async function runFixed(executable, arguments_, options = {}) {
  const result = await executeFile(executable, arguments_, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    maxBuffer: options.maxBuffer ?? 1_048_576,
    timeout: options.timeout ?? 30_000,
    windowsHide: true,
  });
  return { stderr: result.stderr, stdout: result.stdout };
}
