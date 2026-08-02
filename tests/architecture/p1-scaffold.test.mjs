import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';

import { collectSourceFiles, importedModules } from './source-graph.mjs';

const root = resolve(import.meta.dirname, '../..');
const sourceRoot = join(root, 'src');

test('toolchain and direct dependencies use exact accepted pins', async () => {
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const nodeVersion = (await readFile(join(root, '.node-version'), 'utf8')).trim();

  assert.equal(nodeVersion, '24.18.0');
  assert.equal(packageJson.engines.node, nodeVersion);
  assert.equal(packageJson.engines.pnpm, '11.18.0');
  assert.equal(packageJson.packageManager, 'pnpm@11.18.0');
  assert.equal(packageJson.devDependencies.electron, '43.2.0');
  assert.equal(packageJson.devDependencies.vite, '8.2.0');
  assert.equal(packageJson.devDependencies.react, '19.2.8');
  assert.equal(packageJson.devDependencies.typescript, '7.0.2');

  for (const version of Object.values(packageJson.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  }
});

test('renderer imports no Electron or Node authority', async () => {
  const rendererRoot = join(sourceRoot, 'renderer');
  const rendererFiles = await collectSourceFiles(rendererRoot);
  const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

  for (const path of rendererFiles) {
    const source = await readFile(path, 'utf8');
    const imports = importedModules(source, path);
    for (const specifier of imports) {
      assert.notEqual(specifier, 'electron', `${relative(root, path)} imports Electron`);
      assert.equal(builtins.has(specifier), false, `${relative(root, path)} imports Node module ${specifier}`);
    }
  }
});

test('application source contains no process execution import', async () => {
  const files = await collectSourceFiles(sourceRoot);
  const forbidden = new Set(['child_process', 'node:child_process', 'cluster', 'node:cluster']);

  for (const path of files) {
    const source = await readFile(path, 'utf8');
    for (const specifier of importedModules(source, path)) {
      assert.equal(forbidden.has(specifier), false, `${relative(root, path)} imports ${specifier}`);
    }
  }
});

test('packaging enables ASAR integrity and authority-reducing fuses', async () => {
  const config = await readFile(join(root, 'scripts/package.mjs'), 'utf8');

  assert.match(config, /asar:\s*true/);
  assert.match(config, /electronVersion:\s*'43\.2\.0'/);
  assert.match(config, /RunAsNode\]:\s*false/);
  assert.match(config, /EnableNodeOptionsEnvironmentVariable\]:\s*false/);
  assert.match(config, /EnableNodeCliInspectArguments\]:\s*false/);
  assert.match(config, /EnableEmbeddedAsarIntegrityValidation\]:\s*true/);
  assert.match(config, /OnlyLoadAppFromAsar\]:\s*true/);
  assert.match(config, /GrantFileProtocolExtraPrivileges\]:\s*false/);
  assert.match(config, /strictlyRequireAllFuses:\s*true/);
  assert.match(config, /getCurrentFuseWire\(executable\)/);
  assert.match(config, /listPackage\(asarPath/);
  assert.match(config, /unusedPermissionKeys/);
  assert.match(config, /delete infoPlist\[key\]/);
  assert.match(config, /LSMinimumSystemVersion:\s*'15\.0'/);
});

test('development starts through the Electron CLI for on-demand binary installation', async () => {
  const devScript = await readFile(join(root, 'scripts/dev.mjs'), 'utf8');

  assert.match(devScript, /node_modules[\s\S]*\.bin[\s\S]*electron/);
  assert.doesNotMatch(devScript, /require\(['"]electron['"]\)/);
});
