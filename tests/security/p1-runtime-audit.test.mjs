import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const auditSource = await readFile(
  resolve(root, 'tests/runtime/p1-packaged-runtime-audit.mjs'),
  'utf8',
);

test('packaged runtime audit has fixed local inputs and bounded probes', () => {
  assert.doesNotMatch(auditSource, /process\.argv/);
  assert.match(auditSource, /remote-debugging-address=127\.0\.0\.1/);
  assert.match(auditSource, /mkdtemp\(join\(tmpdir\(\), 'dosai-p1-audit-'\)\)/);
  assert.match(auditSource, /shell: false/);
  assert.match(auditSource, /const requestCount = 2000/);
  assert.match(auditSource, /startupTimeoutMs = 20_000/);
  assert.match(auditSource, /session = await waitForHealthyPage\(firstPort, child\)/);
  assert.match(auditSource, /AbortSignal\.timeout\(1_000\)/);
  assert.match(auditSource, /CDP_COMMAND_TIMEOUT/);
  assert.match(auditSource, /timeoutMs = 10_000/);
});

test('packaged runtime audit owns cleanup and does not claim formal acceptance', () => {
  assert.match(auditSource, /formal_acceptance_report: false/);
  assert.match(auditSource, /stopOwnedProcessGroup\(child, 'SIGKILL'\)/);
  assert.match(auditSource, /P1-CLEANUP-PROCESS-GROUP/);
  assert.match(auditSource, /P1-CLEANUP-ISOLATED-PROFILE/);
  assert.match(auditSource, /secret_scan/);
});
