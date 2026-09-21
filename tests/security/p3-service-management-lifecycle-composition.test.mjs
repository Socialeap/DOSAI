import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

import {
  admitLifecycleProofOutput,
  isSuccessfulLifecycleProof,
} from '../../scripts/service-management-lifecycle-proof.mjs';

const root = nodePath.resolve(import.meta.dirname, '../..');
const builderPath = nodePath.resolve(
  root,
  'scripts/service-management-lifecycle-addon.mjs',
);
const buildPath = nodePath.resolve(root, 'scripts/build.mjs');
const packagePath = nodePath.resolve(root, 'scripts/package.mjs');
const runnerPath = nodePath.resolve(
  root,
  'scripts/service-management-lifecycle-proof.mjs',
);
const viteUrl = new URL('../../vite.main.config.ts', import.meta.url);
const [builderSource, buildSource, packageSource, runnerSource, viteSource] =
  await Promise.all([
    readFile(builderPath, 'utf8'),
    readFile(buildPath, 'utf8'),
    readFile(packagePath, 'utf8'),
    readFile(runnerPath, 'utf8'),
    readFile(viteUrl, 'utf8'),
  ]);
const resultPrefix = 'DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:';

function validReceipt(overrides = {}) {
  return {
    result: 'REGISTERED_AND_CLEANED',
    before: 'NOT_REGISTERED',
    after_register: 'ENABLED',
    after_unregister: 'NOT_REGISTERED',
    observe_attempts: 3,
    register_attempts: 1,
    unregister_attempts: 1,
    observe_completions: 3,
    register_completions: 1,
    unregister_completions: 1,
    consumed: true,
    ...overrides,
  };
}

function proofOutput(receipt) {
  return `${resultPrefix}${JSON.stringify(receipt)}\n`;
}

test('lifecycle addon builder fixes source, toolchain, identity, output, and signing order', () => {
  assert.match(
    builderSource,
    /src\/main\/execution\/service-management-lifecycle-adapter\.mm/,
  );
  assert.match(builderSource, /process\.version !== 'v24\.18\.0'/);
  assert.equal((builderSource.match(/name: '(?:node|js_native_api)[^']*\.h'/g) ?? []).length, 4);
  assert.equal((builderSource.match(/sha256: '[0-9a-f]{64}'/g) ?? []).length, 4);
  assert.match(builderSource, /'arm64-apple-macos15\.0'/);
  assert.match(builderSource, /'-std=c\+\+20'/);
  assert.match(builderSource, /'-Wl,-no_adhoc_codesign'/);
  assert.match(builderSource, /'UMXN25Z493'/);
  assert.match(
    builderSource,
    /com\.socialeap\.dosai\.service-management-lifecycle-addon/,
  );
  assert.match(builderSource, /dosai-service-management-lifecycle\.node/);
  assert.deepEqual(
    [...builderSource.matchAll(/execFileAsync\(\s*'([^']+)'/g)].map(match => match[1]),
    ['/usr/bin/xcrun', '/usr/bin/codesign'],
  );
  assert.ok(
    builderSource.indexOf("'/usr/bin/xcrun'")
      < builderSource.indexOf("'/usr/bin/codesign'"),
  );
  assert.doesNotMatch(
    builderSource,
    /process\.dlopen|\brequire\s*\(|from ['"]electron['"]|launchctl|registerAndReturnError|unregisterAndReturnError/,
  );
});

test('dedicated build and package selectors are exact and leave production selection unchanged', () => {
  assert.match(buildSource, /'service-management-lifecycle-proof'/);
  assert.match(buildSource, /DOSAI_BUILD_MODE_0001/);
  assert.match(viteSource, /mode === 'service-management-lifecycle-proof'/);
  assert.match(
    viteSource,
    /src\/main\/execution\/service-management-lifecycle-proof-entry\.ts/,
  );
  assert.match(viteSource, /src\/main\/index\.ts/);
  assert.match(packageSource, /--signed-app-service-management-lifecycle-proof-fixture/);
  assert.match(
    packageSource,
    /staticNamedServiceLaunchAgentFixture: true,[\s\S]*staticNamedServiceFixture: true,[\s\S]*staticStatusAddonFixture: false,[\s\S]*staticWatchdogFixture: true,[\s\S]*signedAppStatusProofFixture: false,[\s\S]*staticLifecycleAddonFixture: true,[\s\S]*signedAppLifecycleProofFixture: true/,
  );
  assert.match(
    packageSource,
    /packageMode\.signedAppLifecycleProofFixture[\s\S]*\? 'service-management-lifecycle-proof'[\s\S]*: packageMode\.signedAppStatusProofFixture[\s\S]*\? 'service-management-status-proof'[\s\S]*: 'production'/,
  );
  assert.match(
    packageSource,
    /Contents\/Resources\/\$\{serviceManagementLifecycleAddonName\}/,
  );
  assert.match(
    packageSource,
    /buildServiceManagementLifecycleAddon\(packagedLifecycleAddon\)/,
  );
  assert.doesNotMatch(
    packageSource,
    /process\.dlopen|launchctl|registerAndReturnError|unregisterAndReturnError|\.register\s*\(|\.unregister\s*\(/,
  );
});

test('dedicated lifecycle proof selector builds only the lifecycle CommonJS entry', async () => {
  const directory = await mkdtemp(nodePath.join(tmpdir(), 'dosai-lifecycle-composition-'));
  try {
    await build({
      build: { emptyOutDir: true, outDir: directory },
      configLoader: 'runner',
      configFile: fileURLToPath(viteUrl),
      logLevel: 'silent',
      mode: 'service-management-lifecycle-proof',
    });
    const bundle = await readFile(nodePath.join(directory, 'index.cjs'), 'utf8');
    assert.match(bundle, /DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:/);
    assert.match(bundle, /dosai-service-management-lifecycle\.node/);
    assert.match(bundle, /createRequire\)\(__filename\)/);
    assert.doesNotMatch(bundle, /DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:/);
    assert.doesNotMatch(bundle, /BrowserWindow|ipcMain|ipcRenderer|contextBridge/);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('runner strictly admits one bounded lifecycle receipt and classifies success', () => {
  const receipt = admitLifecycleProofOutput(proofOutput(validReceipt()), '');
  assert.deepEqual(receipt, validReceipt());
  assert.ok(Object.isFrozen(receipt));
  assert.equal(isSuccessfulLifecycleProof(receipt), true);

  const firstSeenSuccess = admitLifecycleProofOutput(proofOutput(validReceipt({
    before: 'NOT_FOUND',
    after_register: 'REQUIRES_APPROVAL',
  })), '');
  assert.equal(isSuccessfulLifecycleProof(firstSeenSuccess), true);

  const cleanRejection = admitLifecycleProofOutput(proofOutput(validReceipt({
    result: 'REGISTRATION_REJECTED_CLEAN',
    after_register: 'NOT_REGISTERED',
    observe_attempts: 2,
    unregister_attempts: 0,
    observe_completions: 2,
    unregister_completions: 0,
  })), '');
  assert.equal(isSuccessfulLifecycleProof(cleanRejection), false);

  const incompleteSuccess = admitLifecycleProofOutput(proofOutput(validReceipt({
    after_register: 'NOT_REGISTERED',
    observe_attempts: 2,
    observe_completions: 2,
  })), '');
  assert.equal(isSuccessfulLifecycleProof(incompleteSuccess), false);

  const loadFailure = admitLifecycleProofOutput(proofOutput(validReceipt({
    result: 'NATIVE_ADDON_LOAD_FAILED',
    before: 'NOT_FOUND',
    after_register: 'NOT_FOUND',
    after_unregister: 'NOT_FOUND',
    observe_attempts: 0,
    register_attempts: 0,
    unregister_attempts: 0,
    observe_completions: 0,
    register_completions: 0,
    unregister_completions: 0,
    consumed: false,
  })), '');
  assert.equal(isSuccessfulLifecycleProof(loadFailure), false);
});

test('runner rejects malformed, expanded, duplicated, or contradictory receipts', () => {
  const cases = [
    [proofOutput(validReceipt()), 'unexpected stderr'],
    [`${proofOutput(validReceipt())}\n`, ''],
    [`${resultPrefix}{"result":"REGISTERED_AND_CLEANED","result":"PRECONDITION_FAILED"}\n`, ''],
    [proofOutput(validReceipt({ unexpected: true })), ''],
    [proofOutput(validReceipt({ result: 'ALREADY_CONSUMED' })), ''],
    [proofOutput(validReceipt({ register_attempts: 2 })), ''],
    [proofOutput(validReceipt({ register_completions: 2 })), ''],
    [proofOutput(validReceipt({ register_attempts: 0, register_completions: 1 })), ''],
    [proofOutput(validReceipt({ consumed: 'true' })), ''],
    [proofOutput(validReceipt({
      result: 'ELECTRON_READINESS_FAILED',
      consumed: false,
    })), ''],
    [proofOutput(validReceipt({
      result: 'NATIVE_ADDON_LOAD_FAILED',
      observe_attempts: 0,
      register_attempts: 0,
      unregister_attempts: 0,
      observe_completions: 0,
      register_completions: 0,
      unregister_completions: 0,
      consumed: false,
    })), ''],
  ];
  for (const [stdout, stderr] of cases) {
    assert.throws(
      () => admitLifecycleProofOutput(stdout, stderr),
      /DOSAI_LIFECYCLE_PROOF_(?:STDERR|OUTPUT)_0001/,
    );
  }
});

test('runner has one exact child, fixed environment, hard timeout, and no retry path', () => {
  assert.match(
    runnerSource,
    /out\/DOSAI-darwin-arm64\/DOSAI\.app\/Contents\/MacOS\/DOSAI/,
  );
  assert.match(runnerSource, /execFileAsync\(proofExecutable, \[\], \{/);
  assert.match(runnerSource, /timeout: 15_000/);
  assert.match(runnerSource, /killSignal: 'SIGKILL'/);
  assert.match(runnerSource, /maxBuffer: 4096/);
  assert.match(runnerSource, /DOSAI_LIFECYCLE_PROOF_ARGUMENTS_0001/);
  assert.match(runnerSource, /DOSAI_LIFECYCLE_PROOF_STDERR_0001/);
  assert.match(runnerSource, /DOSAI_LIFECYCLE_PROOF_OUTPUT_0001/);
  assert.match(runnerSource, /LANG: 'C'/);
  assert.match(runnerSource, /LC_ALL: 'C'/);
  assert.match(runnerSource, /PATH: '\/usr\/bin:\/bin'/);
  assert.doesNotMatch(
    runnerSource,
    /process\.env|shell:\s*true|spawn\s*\(|fork\s*\(|setInterval|setTimeout|while\s*\(|retry|launchctl|SMAppService|\.register\s*\(|\.unregister\s*\(/,
  );
});
