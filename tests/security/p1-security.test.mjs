import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { transformWithOxc } from 'vite';

const root = resolve(import.meta.dirname, '../..');

async function importStandaloneTypeScript(path) {
  const source = await readFile(path, 'utf8');
  const { code: output } = await transformWithOxc(source, path);
  const encoded = Buffer.from(output).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const policy = await importStandaloneTypeScript(
  join(root, 'src/main/security/application-policy.ts'),
);
const ipcContract = await importStandaloneTypeScript(join(root, 'src/contracts/ipc.ts'));

test('production protocol exposes only the application document and built assets', () => {
  const accepted = new Map([
    ['dosai://app/', 'index.html'],
    ['dosai://app/index.html', 'index.html'],
    ['dosai://app/assets/index-CnP_9.js', 'assets/index-CnP_9.js'],
    ['dosai://app/assets/index-a1.css', 'assets/index-a1.css'],
  ]);

  for (const [url, resource] of accepted) {
    assert.equal(policy.resolveApplicationResource(url), resource);
    assert.equal(policy.isAllowedSessionRequest(url, true), true);
  }

  const rejected = [
    'dosai://app',
    'dosai://app/../package.json',
    'dosai://app/%2e%2e/package.json',
    'dosai://app/assets/../index.html',
    'dosai://app/assets/index.js.map',
    'dosai://app/assets/index%2ejs',
    'dosai://app/assets/nested/index.js',
    'dosai://app/index.html?debug=true',
    'dosai://app/index.html#fragment',
    'dosai://user@app/',
    'dosai://app:42/',
    'dosai://other/',
    'dosai://app.evil/',
    'file:///etc/passwd',
    'https://app/',
    'not a url',
  ];

  for (const url of rejected) {
    assert.equal(policy.resolveApplicationResource(url), undefined, url);
    assert.equal(policy.isAllowedSessionRequest(url, true), false, url);
  }
});

test('development request policy is loopback-only and production denies network access', () => {
  for (const url of [
    'http://127.0.0.1:5173/',
    'http://127.0.0.1:5173/@vite/client',
    'http://127.0.0.1:5173/src/renderer/main.tsx?t=1',
    'ws://127.0.0.1:5173/?token=development',
  ]) {
    assert.equal(policy.isAllowedSessionRequest(url, false), true, url);
    assert.equal(policy.isAllowedSessionRequest(url, true), false, url);
  }

  for (const url of [
    'http://localhost:5173/',
    'http://127.0.0.1:5174/',
    'https://127.0.0.1:5173/',
    'http://user@127.0.0.1:5173/',
    'ws://example.com:5173/',
    'https://example.com/',
  ]) {
    assert.equal(policy.isAllowedSessionRequest(url, false), false, url);
  }
});

test('top-level navigation and IPC sender checks require exact trusted identities', () => {
  assert.equal(policy.isTrustedRendererUrl('dosai://app/', true), true);
  assert.equal(policy.isTrustedRendererUrl('http://127.0.0.1:5173/', false), true);

  for (const url of [
    'dosai://app/index.html',
    'dosai://app/#fragment',
    'dosai://app/assets/index.js',
    'https://example.com/',
    'file:///tmp/index.html',
  ]) {
    assert.equal(policy.isTrustedRendererUrl(url, true), false, url);
  }

  const trustedIdentity = {
    frameUrl: 'dosai://app/',
    isMainFrame: true,
    ownerWebContentsId: 7,
    senderWebContentsId: 7,
  };
  assert.equal(policy.isTrustedIpcSender(trustedIdentity, true), true);

  const rejectedIdentities = [
    { ...trustedIdentity, frameUrl: 'dosai://app/#frame' },
    { ...trustedIdentity, frameUrl: 'https://example.com/' },
    { ...trustedIdentity, isMainFrame: false },
    { ...trustedIdentity, ownerWebContentsId: undefined },
    { ...trustedIdentity, ownerWebContentsId: 8 },
  ];
  for (const identity of rejectedIdentities) {
    assert.equal(policy.isTrustedIpcSender(identity, true), false);
  }
  assert.equal(policy.isTrustedIpcSender(trustedIdentity, false), false);
});

test('content security policies deny execution and framing outside the application', () => {
  assert.match(policy.PRODUCTION_CONTENT_SECURITY_POLICY, /default-src 'none'/);
  assert.match(policy.PRODUCTION_CONTENT_SECURITY_POLICY, /script-src 'self'/);
  assert.match(policy.PRODUCTION_CONTENT_SECURITY_POLICY, /connect-src 'none'/);
  assert.match(policy.PRODUCTION_CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
  assert.doesNotMatch(policy.PRODUCTION_CONTENT_SECURITY_POLICY, /unsafe-(?:eval|inline)/);
  assert.match(policy.DEVELOPMENT_CONTENT_SECURITY_POLICY, /ws:\/\/127\.0\.0\.1:5173/);
  assert.doesNotMatch(policy.DEVELOPMENT_CONTENT_SECURITY_POLICY, /unsafe-eval/);
});

test('preload and main expose one typed no-argument IPC operation', async () => {
  assert.deepEqual(Object.keys(ipcContract.APPLICATION_IPC), ['getRuntimeSnapshot']);
  assert.equal(
    ipcContract.APPLICATION_IPC.getRuntimeSnapshot,
    'dosai:runtime:get-snapshot',
  );

  const [preload, registration] = await Promise.all([
    readFile(join(root, 'src/preload/runtime-bridge.ts'), 'utf8'),
    readFile(join(root, 'src/main/ipc/register-application-ipc.ts'), 'utf8'),
  ]);

  assert.equal(preload.match(/ipcRenderer\.invoke\(/g)?.length, 1);
  assert.doesNotMatch(preload, /ipcRenderer\.(?:send|sendSync|on|once|postMessage)\(/);
  assert.match(registration, /ipcMain\.handle\(APPLICATION_IPC\.getRuntimeSnapshot/);
  assert.match(registration, /arguments_\.length !== 0/);
  assert.match(registration, /isTrustedIpcSender/);
  assert.doesNotMatch(registration, /ipcMain\.(?:on|once)\(/);
});

test('BrowserWindow and package settings retain renderer isolation', async () => {
  const [windowSource, protocolSource, packageSource] = await Promise.all([
    readFile(join(root, 'src/main/window/main-window.ts'), 'utf8'),
    readFile(join(root, 'src/main/security/application-protocol.ts'), 'utf8'),
    readFile(join(root, 'scripts/package.mjs'), 'utf8'),
  ]);

  for (const setting of [
    /allowRunningInsecureContent:\s*false/,
    /contextIsolation:\s*true/,
    /nodeIntegration:\s*false/,
    /nodeIntegrationInSubFrames:\s*false/,
    /nodeIntegrationInWorker:\s*false/,
    /sandbox:\s*true/,
    /webSecurity:\s*true/,
    /webviewTag:\s*false/,
  ]) {
    assert.match(windowSource, setting);
  }
  assert.match(windowSource, /loadURL\(PRODUCTION_RENDERER_URL\)/);
  assert.doesNotMatch(windowSource, /loadFile\(/);
  assert.match(protocolSource, /standard:\s*true/);
  assert.match(protocolSource, /secure:\s*true/);
  assert.match(protocolSource, /bypassCSP:\s*false/);
  assert.match(packageSource, /GrantFileProtocolExtraPrivileges\]:\s*false/);
});
