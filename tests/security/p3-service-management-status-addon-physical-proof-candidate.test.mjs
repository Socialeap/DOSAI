import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
  assert.match(entrySource, /createRequire\(import\.meta\.url\)/);
  assert.match(entrySource, /join\(process\.resourcesPath, statusAddonName\)/);
  assert.match(entrySource, /createServiceManagementStatusAdapter\(loadFixedStatusAddon\(\)\)\.observe\(\)/);
  assert.equal((entrySource.match(/process\.stdout\.write/g) ?? []).length, 1);
  assert.equal((entrySource.match(/app\.exit\(0\)/g) ?? []).length, 1);
  assert.equal((entrySource.match(/app\.exit\(1\)/g) ?? []).length, 1);
  assert.doesNotMatch(
    entrySource,
    /BrowserWindow|webContents|ipcMain|ipcRenderer|contextBridge|preload|renderer|process\.argv|process\.env|child_process|node:fs|node:net|node:http|node:https|launchctl|SMAppService|\.register\s*\(|\.unregister\s*\(/,
  );
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
  assert.match(runnerSource, /LANG: 'C'/);
  assert.match(runnerSource, /LC_ALL: 'C'/);
  assert.match(runnerSource, /PATH: '\/usr\/bin:\/bin'/);
  assert.doesNotMatch(
    runnerSource,
    /process\.env|shell:\s*true|spawn\s*\(|fork\s*\(|setInterval|setTimeout|while\s*\(|for\s*\(|retry|launchctl|SMAppService|\.register\s*\(|\.unregister\s*\(/,
  );
});
