import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const root = resolve(import.meta.dirname, '../..');
const execFileAsync = promisify(execFile);

test('kernel and writer diagnostic passes offline fixtures without launching live queries', async () => {
  await execFileAsync('/usr/bin/python3', [
    '-B', resolve(root, 'tests/governance/p3-kernel-writer-diagnostic.test.py'), '-v',
  ], {
    cwd: root, env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
    timeout: 10_000, maxBuffer: 64 * 1024,
  });
});
