import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  expectedV50PackageManifestEntries,
  expectedV50PackageManifestSha256,
  preservedV50Package,
  stagedV50Package,
} from '../../scripts/p3-v50-package-verification.mjs';

const root = resolve(import.meta.dirname, '../..');
const coreSource = await readFile(resolve(
  root,
  'scripts/p3-v50-package-verification.mjs',
), 'utf8');
const preservedWrapper = await readFile(resolve(
  root,
  'scripts/verify-p3-v50-preserved-package.mjs',
), 'utf8');
const stagedWrapper = await readFile(resolve(
  root,
  'scripts/verify-p3-v50-staged-package.mjs',
), 'utf8');

test('v50 package verification fixes both package paths and exact preserved manifest', () => {
  assert.equal(
    preservedV50Package,
    '/private/tmp/dosai-v50-proof/out/DOSAI-darwin-arm64/DOSAI.app',
  );
  assert.equal(
    stagedV50Package,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app',
  );
  assert.equal(expectedV50PackageManifestEntries, 606);
  assert.equal(
    expectedV50PackageManifestSha256,
    '9a842b75f49aaf26c1f58e8fe83f654d1940310afbfe5606b7247a781bdc31e7',
  );
});

test('v50 package verification is read-only, identity-strict, and zero-argument', () => {
  assert.match(coreSource, /runFixed\('\/usr\/bin\/codesign'/);
  assert.match(coreSource, /com\.socialeap\.dosai\.execution-service-fixture/);
  assert.match(coreSource, /com\.socialeap\.dosai\.service-management-lifecycle-addon/);
  assert.match(coreSource, /TeamIdentifier=\$\{expectedTeamIdentifier\}/);
  assert.match(preservedWrapper, /process\.argv\.length !== 2/);
  assert.match(stagedWrapper, /process\.argv\.length !== 2/);
  assert.doesNotMatch(
    `${coreSource}\n${preservedWrapper}\n${stagedWrapper}`,
    /writeFile|appendFile|mkdir|rm\s*\(|copyFile|rename|--sign|ditto|SMAppService|registerAndReturnError|unregisterAndReturnError|https?:\/\//,
  );
});
