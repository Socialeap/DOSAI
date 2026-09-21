import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

import { analyzeRendererAuthority } from './renderer-authority.mjs';
import { collectSourceFiles } from './source-graph.mjs';

const root = resolve(import.meta.dirname, '../..');
const rendererRoot = join(root, 'src/renderer');
const policy = JSON.parse(
  await readFile(join(root, 'docs/architecture/renderer-authority-policy-v1.json'), 'utf8'),
);

test('renderer authority policy is versioned and bound to the accepted architecture', () => {
  assert.equal(policy.schema_version, 1);
  assert.equal(policy.status, 'IMPLEMENTED');
  assert.equal(policy.source_boundary, 'src/renderer');
  assert.equal(policy.accepted_adr, 'docs/decisions/0001-runtime-and-privilege-boundaries.md');
  assert.equal(policy.enforcement, 'tests/architecture/renderer-authority.test.mjs');
  assert.equal(policy.forbid_all_node_builtins, true);
  assert.deepEqual(Object.keys(policy.categories), [
    'raw_process',
    'filesystem',
    'database',
    'credential',
    'arbitrary_ipc',
    'debugger',
  ]);
  assert.deepEqual(policy.typed_bridge.allowed_calls, [
    { argument_count: 0, path: 'window.dosai.runtime.getSnapshot' },
  ]);
});

test('every renderer source file satisfies the no-authority policy', async () => {
  const files = await collectSourceFiles(rendererRoot);
  assert.ok(files.length > 0);

  for (const path of files) {
    const violations = analyzeRendererAuthority(await readFile(path, 'utf8'), path, policy);
    assert.deepEqual(violations, [], `${relative(root, path)}: ${JSON.stringify(violations)}`);
  }
});

test('malicious renderer fixtures fail in every forbidden authority category', () => {
  const fixtures = [
    ['raw_process', 'process.env.HOME'],
    ['raw_process', 'global.process'],
    ['raw_process', 'const runtime = window["process"]'],
    ['arbitrary_ipc', 'const key = "process"; window[key]'],
    ['raw_process', 'import os from "node:os"'],
    ['filesystem', 'import fs from "node:fs/promises"'],
    ['filesystem', 'type Stats = import("node:fs").Stats'],
    ['filesystem', 'showOpenFilePicker()'],
    ['filesystem', 'const view = <input type="file" />'],
    ['database', 'indexedDB.open("dosai")'],
    ['database', 'localStorage.setItem("key", "value")'],
    ['database', 'import Database from "better-sqlite3"'],
    ['credential', 'navigator.credentials.get({ password: true })'],
    ['credential', 'navigator.clipboard.readText()'],
    ['arbitrary_ipc', 'const browser = navigator; browser.credentials.get()'],
    ['credential', 'document.cookie'],
    ['credential', 'import keytar from "keytar"'],
    ['credential', 'const view = <input type="password" />'],
    ['arbitrary_ipc', 'import { ipcRenderer } from "electron"'],
    ['arbitrary_ipc', 'window.postMessage({ unsafe: true }, "*")'],
    ['arbitrary_ipc', 'new BroadcastChannel("dosai")'],
    ['arbitrary_ipc', 'window.addEventListener("message", () => {})'],
    ['debugger', 'debugger'],
    ['debugger', 'window.chrome.debugger'],
    ['debugger', 'import CDP from "chrome-remote-interface"'],
  ];

  for (const [expectedCategory, source] of fixtures) {
    const violations = analyzeRendererAuthority(source, `${expectedCategory}.tsx`, policy);
    assert.ok(
      violations.some(({ category }) => category === expectedCategory),
      `${expectedCategory} fixture passed: ${source}; ${JSON.stringify(violations)}`,
    );
  }
});

test('typed bridge rejects aliasing, computed access, unknown methods, and arguments', () => {
  const rejected = [
    'const bridge = window.dosai',
    'window["dosai"].runtime.getSnapshot()',
    'window.dosai.runtime.getSnapshot("extra")',
    'window.dosai.runtime.getSnapshot.call(null)',
    'window.dosai.runtime.unknown()',
    'globalThis.dosai.runtime.getSnapshot()',
    'self.dosai.runtime.getSnapshot()',
    'window.window.dosai.runtime.getSnapshot()',
  ];

  for (const source of rejected) {
    const violations = analyzeRendererAuthority(source, 'bridge-negative.ts', policy);
    assert.ok(
      violations.some(({ category }) => category === 'arbitrary_ipc'),
      `Bridge bypass passed: ${source}; ${JSON.stringify(violations)}`,
    );
  }

  assert.deepEqual(
    analyzeRendererAuthority('window.dosai.runtime.getSnapshot()', 'bridge-positive.ts', policy),
    [],
  );
});

test('comments, strings, and inert property keys do not trigger authority findings', () => {
  const source = `
    // process.env and window.postMessage are forbidden examples.
    const guidance = "never call indexedDB or navigator.credentials";
    const labels = { process: "process", credentials: "credentials" };
    export { guidance, labels };
  `;
  assert.deepEqual(analyzeRendererAuthority(source, 'inert.ts', policy), []);
});
