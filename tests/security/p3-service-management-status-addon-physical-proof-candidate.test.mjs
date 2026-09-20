import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { build } from 'vite';

const entryUrl = new URL(
  '../../src/main/execution/service-management-status-proof-entry.ts',
  import.meta.url,
);
const buildUrl = new URL('../../scripts/build.mjs', import.meta.url);
const packageUrl = new URL('../../scripts/package.mjs', import.meta.url);
const runnerUrl = new URL('../../scripts/service-management-status-proof.mjs', import.meta.url);
const viteUrl = new URL('../../vite.main.config.ts', import.meta.url);

const [entrySource, buildSource, packageSource, runnerSource, viteSource] = await Promise.all([
  readFile(entryUrl, 'utf8'),
  readFile(buildUrl, 'utf8'),
  readFile(packageUrl, 'utf8'),
  readFile(runnerUrl, 'utf8'),
  readFile(viteUrl, 'utf8'),
]);

test('proof entry is a fixed no-window Electron Main bundle with one bounded observation', () => {
  assert.match(entrySource, /^import \{ app \} from 'electron';$/m);
  assert.match(entrySource, /^import \{ createRequire \} from 'node:module';$/m);
  assert.match(entrySource, /^import \{ join \} from 'node:path';$/m);
  assert.match(entrySource, /const resultPrefix = 'DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:';/);
  assert.match(entrySource, /const statusAddonName = 'dosai-service-management-status\.node';/);
  assert.match(entrySource, /createRequire\(__filename\)/);
  assert.doesNotMatch(entrySource, /import\.meta/);
  assert.match(entrySource, /join\(process\.resourcesPath, statusAddonName\)/);
  assert.match(entrySource, /createServiceManagementStatusAdapter\(monitoredBinding\)\.observe\(\)/);
  assert.match(entrySource, /const nativeAddonLoadFailure = 'NATIVE_ADDON_LOAD_FAILED'/);
  assert.match(entrySource, /const nativeStatusCallFailure = 'NATIVE_STATUS_CALL_FAILED'/);
  assert.match(entrySource, /const electronReadinessFailure = 'ELECTRON_READINESS_FAILED'/);
  assert.equal((entrySource.match(/process\.stdout\.write/g) ?? []).length, 1);
  assert.equal((entrySource.match(/app\.exit\(0\)/g) ?? []).length, 1);
  assert.equal((entrySource.match(/app\.exit\(1\)/g) ?? []).length, 1);
  assert.doesNotMatch(
    entrySource,
    /BrowserWindow|webContents|ipcMain|ipcRenderer|contextBridge|preload|renderer|process\.argv|process\.env|child_process|node:fs|node:net|node:http|node:https|launchctl|SMAppService|\.register\s*\(|\.unregister\s*\(/,
  );
});

test('dedicated CommonJS proof bundle starts and performs one fixed inert observation', async () => {
  const temporaryRoot = await mkdtemp(nodePath.join(tmpdir(), 'dosai-status-proof-bundle-'));
  const bundlePath = nodePath.join(temporaryRoot, 'index.cjs');
  try {
    await build({
      build: { emptyOutDir: true, outDir: temporaryRoot },
      configLoader: 'runner',
      configFile: fileURLToPath(viteUrl),
      logLevel: 'silent',
      mode: 'service-management-status-proof',
    });
    const bundleSource = await readFile(bundlePath, 'utf8');
    assert.match(bundleSource, /createRequire\)\(__filename\)/);
    assert.doesNotMatch(bundleSource, /\{\}\.url|import\.meta/);

    const resourcesPath = '/inert/dosai/resources';
    const evaluate = async ({ load, ready = true }) => {
      const writes = [];
      const exits = [];
      const loads = [];
      const app = Object.freeze({
        exit(code) {
          exits.push(code);
        },
        whenReady() {
          return ready ? Promise.resolve() : Promise.reject(new Error('inert readiness failure'));
        },
      });
      const requireStub = identifier => {
        if (identifier === 'electron') return { app };
        if (identifier === 'node:path') return nodePath;
        if (identifier === 'node:module') {
          return {
            createRequire(filename) {
              assert.equal(filename, bundlePath);
              return path => {
                loads.push(path);
                return load();
              };
            },
          };
        }
        throw new Error(`Unexpected bundled require: ${identifier}`);
      };
      const processStub = Object.freeze({
        resourcesPath,
        stdout: Object.freeze({
          write(value) {
            writes.push(value);
            return true;
          },
        }),
      });
      const wrapper = vm.runInNewContext(
        `(function (require, module, exports, __filename, __dirname, process) {${bundleSource}\n})`,
        Object.create(null),
      );
      const moduleStub = { exports: {} };
      wrapper(
        requireStub,
        moduleStub,
        moduleStub.exports,
        bundlePath,
        nodePath.dirname(bundlePath),
        processStub,
      );
      await new Promise(resolve => setImmediate(resolve));
      return { exits, loads, writes };
    };

    const legitimateCalls = [];
    const legitimate = await evaluate({
      load: () => ({
        observe(...arguments_) {
          legitimateCalls.push(arguments_);
          return 'NOT_FOUND';
        },
      }),
    });
    assert.deepEqual(
      legitimate.loads,
      [nodePath.join(resourcesPath, 'dosai-service-management-status.node')],
    );
    assert.deepEqual(legitimateCalls, [[]]);
    assert.deepEqual(legitimate.writes, ['DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:NOT_FOUND\n']);
    assert.deepEqual(legitimate.exits, [0]);

    const loadFailure = await evaluate({
      load() {
        throw new Error('inert native load failure');
      },
    });
    assert.deepEqual(loadFailure.loads.length, 1);
    assert.deepEqual(
      loadFailure.writes,
      ['DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:NATIVE_ADDON_LOAD_FAILED\n'],
    );
    assert.deepEqual(loadFailure.exits, [0]);

    const callFailureCalls = [];
    const callFailure = await evaluate({
      load: () => ({
        observe(...arguments_) {
          callFailureCalls.push(arguments_);
          throw new Error('inert native status failure');
        },
      }),
    });
    assert.deepEqual(callFailureCalls, [[]]);
    assert.deepEqual(
      callFailure.writes,
      ['DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:NATIVE_STATUS_CALL_FAILED\n'],
    );
    assert.deepEqual(callFailure.exits, [0]);

    const invalidResult = await evaluate({
      load: () => ({ observe: () => 'UNADMITTED_RESULT' }),
    });
    assert.deepEqual(
      invalidResult.writes,
      ['DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:NATIVE_STATUS_CALL_FAILED\n'],
    );
    assert.deepEqual(invalidResult.exits, [0]);

    const readinessFailure = await evaluate({
      load() {
        throw new Error('load must remain unreachable');
      },
      ready: false,
    });
    assert.deepEqual(readinessFailure.loads, []);
    assert.deepEqual(
      readinessFailure.writes,
      ['DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:ELECTRON_READINESS_FAILED\n'],
    );
    assert.deepEqual(readinessFailure.exits, [0]);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test('proof build and package selection are fixed and cannot alter the normal Main entry', () => {
  assert.match(buildSource, /'service-management-status-proof'/);
  assert.match(buildSource, /DOSAI_BUILD_MODE_0001/);
  assert.match(viteSource, /mode === 'service-management-status-proof'/);
  assert.match(viteSource, /src\/main\/execution\/service-management-status-proof-entry\.ts/);
  assert.match(viteSource, /src\/main\/index\.ts/);
  assert.match(viteSource, /fileName: \(\) => 'index\.cjs'/);
  assert.match(packageSource, /--signed-app-service-management-status-proof-fixture/);
  assert.match(
    packageSource,
    /staticNamedServiceLaunchAgentFixture: true,[\s\S]*staticNamedServiceFixture: true,[\s\S]*staticStatusAddonFixture: true,[\s\S]*staticWatchdogFixture: true,[\s\S]*signedAppStatusProofFixture: true/,
  );
  assert.match(
    packageSource,
    /packageMode\.signedAppStatusProofFixture\s*\?\s*'service-management-status-proof'\s*:\s*'production'/,
  );
  assert.doesNotMatch(packageSource, /service-management-status-proof-entry.*src\/main\/index|src\/main\/index.*service-management-status-proof-entry/);
});

test('audit runner has one exact child target, no arguments, bounded output, and no retry path', () => {
  assert.match(
    runnerSource,
    /out\/DOSAI-darwin-arm64\/DOSAI\.app\/Contents\/MacOS\/DOSAI/,
  );
  assert.match(runnerSource, /execFileAsync\(proofExecutable, \[\], \{/);
  assert.match(runnerSource, /timeout: 15_000/);
  assert.match(runnerSource, /killSignal: 'SIGKILL'/);
  assert.match(runnerSource, /maxBuffer: 1024/);
  assert.match(runnerSource, /DOSAI_STATUS_PROOF_ARGUMENTS_0001/);
  assert.match(runnerSource, /DOSAI_STATUS_PROOF_STDERR_0001/);
  assert.match(runnerSource, /DOSAI_STATUS_PROOF_OUTPUT_0001/);
  for (const observation of [
    'NATIVE_ADDON_LOAD_FAILED',
    'NATIVE_STATUS_CALL_FAILED',
    'ELECTRON_READINESS_FAILED',
  ]) assert.match(runnerSource, new RegExp(`'${observation}'`));
  assert.match(runnerSource, /LANG: 'C'/);
  assert.match(runnerSource, /LC_ALL: 'C'/);
  assert.match(runnerSource, /PATH: '\/usr\/bin:\/bin'/);
  assert.doesNotMatch(
    runnerSource,
    /process\.env|shell:\s*true|spawn\s*\(|fork\s*\(|setInterval|setTimeout|while\s*\(|for\s*\(|retry|launchctl|SMAppService|\.register\s*\(|\.unregister\s*\(/,
  );
});
