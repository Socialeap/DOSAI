import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { assessNativeProfileSourceIntegrity } from '../../scripts/report-native-profile-source-integrity.mjs';

const root = resolve(import.meta.dirname, '../..');
const manifestPath = 'docs/architecture/p3-native-profile-source-integrity-manifest-v1.json';
const read = path => readFile(resolve(root, path));
const manifest = JSON.parse(await read(manifestPath));
const rejection = { message: 'NATIVE_PROFILE_SOURCE_INTEGRITY_REJECTED' };

function noAuthority(report) {
  assert.equal(report.scope, 'OFFLINE_SOURCE_BYTES_ONLY');
  assert.equal(report.source_integrity, 'PASS');
  assert.equal(report.runtime_status, 'NO_GO');
  assert.equal(report.ready_for_functional_app_testing, false);
  assert.equal(report.tests_executed_by_report, 0);
  assert.equal(report.runtime_readiness_assessed, false);
  assert.equal(report.builder_receipts, 0);
  assert.deepEqual(Object.keys(report.authorities).sort(), Object.keys(manifest.authorities).sort());
  assert.ok(Object.values(report.authorities).every(value => value === false));
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.authorities));
}

test('one command verifies all pinned source files without executing tests or granting runtime authority', async () => {
  const requested = [];
  const report = await assessNativeProfileSourceIntegrity(async path => { requested.push(path); return read(path); });
  noAuthority(report);
  assert.equal(report.verified_files, 35);
  assert.deepEqual(requested, [manifestPath, ...Object.keys(manifest.inputs)]);
  assert.deepEqual(await assessNativeProfileSourceIntegrity(), report);
});

test('each changed or missing bound source file rejects without exposing input content', async () => {
  for (const target of Object.keys(manifest.inputs)) for (const missing of [false, true]) {
    await assert.rejects(() => assessNativeProfileSourceIntegrity(async path => {
      if (path === target) {
        if (missing) throw new Error('PRIVATE_TEST_MARKER');
        return Buffer.from('PRIVATE_TEST_MARKER');
      }
      return read(path);
    }), rejection);
  }
});

test('untrusted manifest changes are rejected before following any of their paths', async () => {
  const variants = [Buffer.from('{'), Buffer.alloc(1_048_577), 'not a buffer',
    Buffer.from('{"record_version":1,"record_version":1}'),
    ...[
      value => { value.inputs = {}; },
      value => { value.inputs['../../outside'] = 'a'.repeat(64); },
      value => { value.inputs['/absolute'] = 'a'.repeat(64); },
      value => { value.authorities.executor = true; },
      value => { delete value.authorities.executor; },
      value => { value.runtime_status = 'GO'; },
      value => { value.inputs[Object.keys(value.inputs)[0]] = 'b'.repeat(64); }
    ].map(change => { const value = structuredClone(manifest); change(value); return Buffer.from(JSON.stringify(value)); })];
  for (const bytes of variants) {
    const requests = [];
    await assert.rejects(() => assessNativeProfileSourceIntegrity(async path => {
      requests.push(path); return bytes;
    }), rejection);
    assert.deepEqual(requests, [manifestPath]);
  }
});

test('loader failures wrong types and oversized source bytes fail closed with fixed diagnostics', async () => {
  for (const value of [null, undefined, '', new Uint8Array([1]), Buffer.alloc(1_048_577)]) {
    await assert.rejects(() => assessNativeProfileSourceIntegrity(async path => path === manifestPath ? read(path) : value), rejection);
  }
  await assert.rejects(() => assessNativeProfileSourceIntegrity(async () => { throw new Error('PRIVATE_TEST_MARKER'); }), rejection);
});

test('reporter is read-only and unreachable from application imports', async () => {
  const source = (await read('scripts/report-native-profile-source-integrity.mjs')).toString();
  assert.doesNotMatch(source, /child_process|execSync|spawn\(|fetch\(|node:https?|writeFile|appendFile|mkdir|unlink|generateKeyPair|createPrivateKey/);
  const { collectFiles, importedModules } = await import('../architecture/source-graph.mjs');
  for (const path of await collectFiles(resolve(root, 'src'))) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    for (const name of importedModules((await readFile(path)).toString(), path)) assert.doesNotMatch(name, /report-native-profile-source-integrity/);
  }
});
