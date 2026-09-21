import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const helperPath = resolve(root, 'scripts/service-management-status-addon.mjs');
const packagePath = resolve(root, 'scripts/package.mjs');
const helperSource = await readFile(helperPath, 'utf8');
const packageSource = await readFile(packagePath, 'utf8');
const v35 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v35.json'), 'utf8'),
);

const sha256 = async (path) =>
  createHash('sha256').update(await readFile(path)).digest('hex');

async function listRelativeEntries(directory, prefix = '') {
  const results = [];
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = prefix === '' ? entry.name : join(prefix, entry.name);
    assert.equal(entry.isSymbolicLink(), false, relativePath);
    if (entry.isDirectory()) {
      results.push(`${relativePath}/`);
      results.push(...await listRelativeEntries(join(directory, entry.name), relativePath));
    } else {
      assert.equal(entry.isFile(), true, relativePath);
      results.push(relativePath);
    }
  }
  return results;
}

test('status-addon builder fixes source, headers, target, identity, and signing selector', () => {
  assert.equal(v35.status, 'ACCEPTED');
  assert.match(
    helperSource,
    /native-helpers\/service-management-status-addon\/service-management-status-addon\.mm/,
  );
  assert.match(helperSource, /process\.version !== 'v24\.18\.0'/);
  for (const header of [
    'node_api.h',
    'node_api_types.h',
    'js_native_api.h',
    'js_native_api_types.h',
  ]) {
    assert.equal((helperSource.match(new RegExp(header.replace('.', '\\.'), 'g')) ?? []).length, 1);
  }
  assert.match(helperSource, /'arm64-apple-macos15\.0'/);
  assert.match(helperSource, /'-std=c\+\+20'/);
  assert.match(helperSource, /'-Wl,-no_adhoc_codesign'/);
  assert.match(helperSource, /'UMXN25Z493'/);
  assert.match(helperSource, /com\.socialeap\.dosai\.service-management-status-addon/);
  assert.match(helperSource, /dosai-service-management-status\.node/);
});

test('status-addon builder can invoke only the compiler and exact signing tool', () => {
  assert.deepEqual(
    [...helperSource.matchAll(/execFileAsync\(\s*'([^']+)'/g)].map((match) => match[1]),
    ['/usr/bin/xcrun', '/usr/bin/codesign'],
  );
  assert.doesNotMatch(
    helperSource,
    /process\.dlopen|\brequire\s*\(|\bimport\s*\(|from ['"]electron['"]|SMAppService|launchctl/,
  );
});

test('package mode is exact, complete, mutually exclusive, and fixed-path', () => {
  assert.match(
    packageSource,
    /--static-named-service-launch-agent-status-addon-fixture/,
  );
  assert.match(
    packageSource,
    /staticNamedServiceLaunchAgentFixture: true,[\s\S]*staticNamedServiceFixture: true,[\s\S]*staticStatusAddonFixture: true,[\s\S]*staticWatchdogFixture: true/,
  );
  assert.match(
    packageSource,
    /Contents\/Resources\/\$\{serviceManagementStatusAddonName\}/,
  );
  assert.match(
    packageSource,
    /Contents\/Library\/LaunchServices\/com\.socialeap\.dosai\.execution-service-fixture/,
  );
  assert.match(
    packageSource,
    /Contents\/Library\/LaunchAgents\/com\.socialeap\.dosai\.execution-service-fixture\.plist/,
  );
  assert.match(packageSource, /arguments_\.length === 1/);
  assert.match(packageSource, /DOSAI_PACKAGE_ARGUMENTS_0001/);
});

test('package mode signs nested code before the outer app and exposes no runtime effect', () => {
  const serviceBuild = packageSource.indexOf(
    'await buildWatchdogNamedServiceFixture(packagedNamedServiceFixture)',
  );
  const plistCopy = packageSource.indexOf(
    'await copyFile(staticNamedServiceLaunchAgentSource, packagedNamedServiceLaunchAgent)',
  );
  const addonBuild = packageSource.indexOf(
    'await buildServiceManagementStatusAddon(packagedStatusAddon)',
  );
  const outerSign = packageSource.indexOf(
    "await codesign([\n    '--force',\n    '--sign',\n    staticNamedServiceIdentitySelector",
  );
  assert.ok(serviceBuild > 0);
  assert.ok(plistCopy > serviceBuild);
  assert.ok(addonBuild > plistCopy);
  assert.ok(outerSign > addonBuild);
  assert.doesNotMatch(
    packageSource,
    /process\.dlopen|SMAppService|launchctl|\.register\s*\(|\.unregister\s*\(/,
  );
  assert.doesNotMatch(packageSource, /execFileAsync\(\s*packagedStatusAddon/);
});

test('retained status-addon package has exact signed static structure without loading', {
  timeout: 30_000,
}, async () => {
  const v36 = JSON.parse(
    await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
  );
  const addon = v36.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const appPath = resolve(root, addon.static_package_output_path);
  const modulePath = resolve(appPath, addon.static_package_addon_relative_path);
  const moduleStats = await lstat(modulePath);
  assert.equal(moduleStats.isFile(), true);
  assert.equal(moduleStats.isSymbolicLink(), false);
  assert.notEqual(moduleStats.mode & 0o111, 0);
  assert.equal(await sha256(modulePath), addon.static_package_addon_sha256);

  const [signing, architectures, build, libraries, symbols] = await Promise.all([
    execFileAsync('/usr/bin/codesign', ['-d', '--verbose=4', modulePath], {
      encoding: 'utf8',
    }),
    execFileAsync('/usr/bin/lipo', ['-archs', modulePath], { encoding: 'utf8' }),
    execFileAsync('/usr/bin/xcrun', ['vtool', '-show-build', modulePath], {
      encoding: 'utf8',
    }),
    execFileAsync('/usr/bin/otool', ['-L', modulePath], { encoding: 'utf8' }),
    execFileAsync('/usr/bin/nm', ['-g', modulePath], { encoding: 'utf8' }),
  ]);
  assert.match(signing.stderr, /Identifier=com\.socialeap\.dosai\.service-management-status-addon/);
  assert.match(signing.stderr, /TeamIdentifier=3RD3TADLRY/);
  assert.doesNotMatch(signing.stderr, /Signature=adhoc/);
  assert.equal(architectures.stdout.trim(), 'arm64');
  assert.match(build.stdout, /minos 15\.0/);
  assert.match(libraries.stdout, /ServiceManagement\.framework/);
  assert.doesNotMatch(
    libraries.stdout,
    /Virtualization\.framework|Security\.framework|Network\.framework/,
  );
  assert.match(symbols.stdout, /node_api_module_get_api_version_v1/);
  assert.match(symbols.stdout, /napi_register_module_v1/);
  assert.deepEqual(
    [...symbols.stdout.matchAll(/^\s+U (_napi_[A-Za-z0-9_]+)$/gm)]
      .map((match) => match[1])
      .sort(),
    [
      '_napi_create_function',
      '_napi_create_string_utf8',
      '_napi_get_cb_info',
      '_napi_set_named_property',
    ],
  );
  assert.deepEqual(
    await listRelativeEntries(resolve(appPath, 'Contents/Library')),
    [
      'LaunchAgents/',
      'LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist',
      'LaunchServices/',
      'LaunchServices/com.socialeap.dosai.execution-service-fixture',
    ],
  );
});
