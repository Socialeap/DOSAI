import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const entrypoints = ['v1', 'v2'];

function assertRejected(command, code) {
  const result = spawnSync(process.execPath, command, { encoding: 'utf8', timeout: 5_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes(`Error: ${code}`), result.stderr);
}

for (const version of entrypoints) {
  const entry = fileURLToPath(new URL(`../source-only/private-beta-functional-regression-${version}.mjs`, import.meta.url));

  test(`source-only functionality regression ${version} rejects forwarded paths before loading the corpus`, () => {
    assertRejected([entry, 'unexpected-test.mjs'], 'PRIVATE_BETA_SOURCE_REGRESSION_ARGUMENTS_REJECTED');
  });

  test(`source-only functionality regression ${version} rejects the wrong Node version before loading the corpus`, () => {
    const override = "Object.defineProperty(process.versions, 'node', { value: '24.17.0' });";
    assertRejected(
      ['--import', 'data:text/javascript,' + encodeURIComponent(override), entry],
      'PRIVATE_BETA_SOURCE_REGRESSION_NODE_VERSION_REJECTED',
    );
  });
}
