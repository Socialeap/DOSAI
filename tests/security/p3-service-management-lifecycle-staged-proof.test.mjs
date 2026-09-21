import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  stableLifecycleProofApplication,
  stableLifecycleProofExecutable,
} from '../../scripts/service-management-lifecycle-staged-proof.mjs';

const root = resolve(import.meta.dirname, '../..');
const source = await readFile(resolve(
  root,
  'scripts/service-management-lifecycle-staged-proof.mjs',
), 'utf8');

test('staged lifecycle proof fixes the exact stable application and executable', () => {
  assert.equal(
    stableLifecycleProofApplication,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app',
  );
  assert.equal(
    stableLifecycleProofExecutable,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app/Contents/MacOS/DOSAI',
  );
  assert.match(source, /execFileAsync\(stableLifecycleProofExecutable, \[\], \{/);
});

test('staged lifecycle proof preserves the single bounded no-retry launch contract', () => {
  assert.equal((source.match(/execFileAsync\(/g) ?? []).length, 1);
  assert.match(source, /timeout: 15_000/);
  assert.match(source, /killSignal: 'SIGKILL'/);
  assert.match(source, /maxBuffer: 4096/);
  assert.match(source, /DOSAI_STAGED_LIFECYCLE_PROOF_ARGUMENTS_0001/);
  assert.match(source, /admitLifecycleProofOutput\(stdout, stderr\)/);
  assert.match(source, /isSuccessfulLifecycleProof\(receipt\)/);
  assert.match(source, /LANG: 'C'/);
  assert.match(source, /LC_ALL: 'C'/);
  assert.match(source, /PATH: '\/usr\/bin:\/bin'/);
  assert.doesNotMatch(
    source,
    /process\.env|shell:\s*true|spawn\s*\(|fork\s*\(|setInterval|setTimeout|while\s*\(|retry|launchctl|SMAppService|\.register\s*\(|\.unregister\s*\(/i,
  );
});

test('staged lifecycle proof cannot accept a caller-selected path or argument', () => {
  assert.doesNotMatch(source, /process\.argv\[[2-9]\]|DOSAI_[A-Z_]*PATH|--app|--executable/);
  assert.match(source, /process\.argv\.slice\(2\)/);
  assert.match(source, /arguments_\.length !== 0/);
});
