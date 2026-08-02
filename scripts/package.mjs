import { listPackage } from '@electron/asar';
import {
  flipFuses,
  FuseV1Options,
  FuseVersion,
  FuseState,
  getCurrentFuseWire,
} from '@electron/fuses';
import { packager } from '@electron/packager';
import assert from 'node:assert/strict';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import plist from 'plist';

import { buildApplication } from './build.mjs';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'out');
const appName = 'DOSAI';

await buildApplication();
await rm(outDir, { force: true, recursive: true });

const appPaths = await packager({
  appBundleId: 'com.socialeap.dosai',
  appCategoryType: 'public.app-category.developer-tools',
  arch: 'arm64',
  asar: true,
  dir: root,
  electronVersion: '43.2.0',
  executableName: appName,
  extendInfo: {
    LSMinimumSystemVersion: '15.0',
  },
  ignore: [/^\/(?!dist(?:\/|$)|package\.json$)/],
  name: appName,
  out: outDir,
  overwrite: true,
  platform: 'darwin',
  prune: true,
});

if (appPaths.length !== 1 || appPaths[0] === undefined) {
  throw new Error(`Expected one packaged DOSAI application, received ${appPaths.length}`);
}

const appBundle = join(appPaths[0], `${appName}.app`);
const executable = join(appBundle, 'Contents', 'MacOS', appName);
const asarPath = join(appBundle, 'Contents', 'Resources', 'app.asar');
const infoPlistPath = join(appBundle, 'Contents', 'Info.plist');

await Promise.all([access(executable), access(asarPath), access(infoPlistPath)]);

const infoPlist = plist.parse(await readFile(infoPlistPath, 'utf8'));
const unusedPermissionKeys = [
  'NSAppTransportSecurity',
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
];

for (const key of unusedPermissionKeys) {
  delete infoPlist[key];
}
await writeFile(infoPlistPath, plist.build(infoPlist));

const fuseConfig = {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: true,
  strictlyRequireAllFuses: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  [FuseV1Options.WasmTrapHandlers]: true,
};

await flipFuses(executable, fuseConfig);

const actualFuses = await getCurrentFuseWire(executable);
for (const [fuse, expected] of Object.entries(fuseConfig)) {
  if (Number.isNaN(Number(fuse))) {
    continue;
  }
  assert.equal(
    actualFuses[fuse],
    expected ? FuseState.ENABLE : FuseState.DISABLE,
    `Packaged fuse ${FuseV1Options[Number(fuse)]} did not match its required state`,
  );
}

const sanitizedInfoPlist = plist.parse(await readFile(infoPlistPath, 'utf8'));
for (const key of unusedPermissionKeys) {
  assert.equal(key in sanitizedInfoPlist, false, `Packaged Info.plist declares unused ${key}`);
}
assert.equal(sanitizedInfoPlist.LSMinimumSystemVersion, '15.0');

const packagedFiles = listPackage(asarPath, { isPack: false });
const allowedDirectories = new Set([
  '/dist',
  '/dist/main',
  '/dist/preload',
  '/dist/renderer',
  '/dist/renderer/assets',
]);
const allowedFile = /^\/(?:package\.json|dist\/(?:main\/index\.cjs|preload\/index\.cjs|renderer\/(?:index\.html|assets\/[A-Za-z0-9_-]+\.(?:css|js))))$/;

for (const path of packagedFiles) {
  assert.ok(
    allowedDirectories.has(path) || allowedFile.test(path),
    `Unexpected entry in packaged ASAR: ${path}`,
  );
}

console.log(`Packaged ${appBundle}`);
console.log(`Verified ${Object.keys(FuseV1Options).length / 2} declared Electron fuses, ${packagedFiles.length} ASAR entries, and a least-privilege Info.plist`);
