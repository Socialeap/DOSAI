import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  preservedV49Application,
  stagedV50Application,
  v50SubjectCommit,
} from '../../scripts/verify-p3-v50-physical-proof-preflight.mjs';

const root = resolve(import.meta.dirname, '../..');
const source = await readFile(resolve(
  root,
  'scripts/verify-p3-v50-physical-proof-preflight.mjs',
), 'utf8');

test('v50 preflight fixes the exact subject and local proof paths', () => {
  assert.equal(v50SubjectCommit, 'bcb69f9c7662b9b507ab1ce01c2956bf8a47d2bc');
  assert.equal(
    preservedV49Application,
    '/private/tmp/dosai-v49-proof/out/DOSAI-darwin-arm64/DOSAI.app',
  );
  assert.equal(
    stagedV50Application,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app',
  );
});

test('v50 preflight is read-only, fixed-command, and fail-closed', () => {
  assert.match(source, /runFixed\('\/usr\/bin\/git', \['cat-file', '-e'/);
  assert.match(source, /DOSAI_V50_PHYSICAL_PREFLIGHT_FAILED/);
  assert.match(source, /PREFLIGHT_STAGING_TARGET_PRESENT/);
  assert.match(source, /electron-v43\.2\.0-darwin-arm64\.zip/);
  assert.doesNotMatch(
    source,
    /writeFile|appendFile|mkdir|rm\s*\(|cp\s*\(|rename|codesign|ditto|SMAppService|registerAndReturnError|unregisterAndReturnError|execFile|spawn\s*\(|shell:\s*true|https?:\/\//,
  );
});
