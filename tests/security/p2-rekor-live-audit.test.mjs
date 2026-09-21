import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as liveAudit from '../runtime/p2-rekor-live-audit.mjs';

const sourcePath = new URL('../runtime/p2-rekor-live-audit.mjs', import.meta.url);
const tufManifestPath = new URL('../../audit-tools/rekor-tuf/package.json', import.meta.url);
const tufLockPath = new URL('../../audit-tools/rekor-tuf/package-lock.json', import.meta.url);

test('isolated TUF client has one exact dependency and integrity-locked closure', async () => {
  const manifest = JSON.parse(await readFile(tufManifestPath, 'utf8'));
  const lock = JSON.parse(await readFile(tufLockPath, 'utf8'));
  assert.deepEqual(manifest.dependencies, { '@sigstore/tuf': '5.0.0' });
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages['node_modules/@sigstore/tuf'].version, '5.0.0');
  for (const [path, dependency] of Object.entries(lock.packages)) {
    if (path === '') {
      continue;
    }
    assert.match(dependency.version, /^[0-9]+\.[0-9]+\.[0-9]+$/);
    assert.match(dependency.integrity, /^sha512-[A-Za-z0-9+/]+=*$/);
  }
});

test('live Rekor audit exposes one bounded operation and no hardcoded shard', async () => {
  assert.deepEqual(Object.keys(liveAudit), ['runP2RekorLiveAudit']);
  const source = await readFile(sourcePath, 'utf8');
  assert.equal(source.includes("const mirrorUrl = 'https://tuf-repo-cdn.sigstore.dev'"), true);
  assert.equal(source.includes("join(root, 'audit-tools/rekor-tuf')"), true);
  assert.equal(source.includes("packageManifest.version !== '5.0.0'"), true);
  assert.equal(/https:\/\/log20[0-9-]*\.rekor\.sigstore\.dev/.test(source), false);
  assert.equal(source.includes("client.getTarget('signing_config.v0.2.json')"), true);
  assert.equal(source.includes("client.getTarget('trusted_root.json')"), true);
  assert.equal(source.includes('signing_config_raw_base64'), true);
  assert.equal(source.includes('trusted_root_raw_base64'), true);
  assert.equal(source.includes("method: 'POST'"), true);
  assert.equal(source.includes("redirect: 'error'"), true);
});

test('public write requires the exact explicit authorization at the exported boundary', async () => {
  await assert.rejects(
    liveAudit.runP2RekorLiveAudit(
      '2a5a4f20-997e-4a66-85dc-dc5ce3d9a855',
      'publish',
      'NOT_AUTHORIZED',
    ),
    /PUBLICATION_NOT_AUTHORIZED/,
  );
  await assert.rejects(
    liveAudit.runP2RekorLiveAudit('not-a-uuid', 'trust-only'),
    /RUN_ID_INVALID/,
  );
});

test('runner requires a clean commit before TUF network activity and publication', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const cleanCheck = source.indexOf("throw new Error('SUBJECT_NOT_CLEAN')");
  const tufRefresh = source.indexOf(
    'const verified = await verifiedTufMaterial(cachePath, now, tufClient.initTUF)',
  );
  const publication = source.indexOf('const response = await postEntry(resolved.endpointUrl, request)');
  assert.ok(cleanCheck > 0);
  assert.ok(tufRefresh > cleanCheck);
  assert.ok(publication > tufRefresh);
  assert.equal(source.includes('formal_acceptance_report: false'), true);
  assert.equal(source.includes('publication_performed: false'), true);
});
