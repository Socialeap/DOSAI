import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { maxTurnBytes } from './managed-turn.mjs';

const fixture = fileURLToPath(new URL('./managed-fixture-child.mjs', import.meta.url));
const maxTurnMs = 3000;

// The only executable route is the repository-owned fixture. The turn cannot select a binary or environment.
export async function runManagedFixtureTurn(turn, { signal, onStart }) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fixture], {
      shell: false, stdio: ['pipe', 'pipe', 'ignore'],
      env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    });
    const chunks = [];
    let length = 0;
    let failed = false;
    function cancel() {
      if (failed) return;
      failed = true;
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    const deadline = setTimeout(cancel, maxTurnMs);
    signal.addEventListener('abort', cancel, { once: true });
    child.once('error', cancel);
    child.stdin.on('error', cancel);
    child.stdout.on('error', cancel);
    child.stdout.on('data', chunk => {
      if (failed) return;
      length += chunk.length;
      if (length > maxTurnBytes) cancel();
      else chunks.push(chunk);
    });
    child.once('spawn', () => {
      if (failed) return;
      try {
        onStart?.();
        if (!failed) child.stdin.end(JSON.stringify(turn));
      } catch {
        cancel();
      }
    });
    child.once('close', (code, exitSignal) => {
      clearTimeout(deadline);
      signal.removeEventListener('abort', cancel);
      if (failed || signal.aborted || code !== 0 || exitSignal !== null) {
        reject(new Error('Managed fixture worker closed without a result.'));
      } else {
        resolve(Buffer.concat(chunks, length));
      }
    });
    if (signal.aborted) cancel();
  });
}
