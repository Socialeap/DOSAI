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
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import plist from 'plist';

import { buildApplication } from './build.mjs';
import {
  buildSecureEnclaveProofHelper,
  describeSecureEnclaveProofHelper,
  secureEnclaveProofHelperName,
} from './secure-enclave-helper.mjs';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'out');
const appName = 'DOSAI';
const nativeBuildDir = resolve(root, 'build/native-helpers');
const builtSecureEnclaveHelper = join(nativeBuildDir, secureEnclaveProofHelperName);
const electronArchiveName = 'electron-v43.2.0-darwin-arm64.zip';

async function sha256(path) {
  const hasher = createHash('sha256');
  await pipeline(createReadStream(path), hasher);
  return hasher.digest('hex');
}

async function checksumVerifiedElectronZipDirectory() {
  const checksums = JSON.parse(
    await readFile(resolve(root, 'node_modules/electron/checksums.json'), 'utf8'),
  );
  const expected = checksums[electronArchiveName];
  assert.match(expected, /^[0-9a-f]{64}$/);
  const cacheRoot = join(homedir(), 'Library/Caches/electron');
  let entries;
  try {
    entries = await readdir(cacheRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) =>
    a.name.localeCompare(b.name))) {
    const candidate = join(cacheRoot, entry.name, electronArchiveName);
    try {
      await access(candidate);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    if (await sha256(candidate) === expected) {
      return dirname(candidate);
    }
  }
  return undefined;
}

await buildApplication();
await rm(outDir, { force: true, recursive: true });
await buildSecureEnclaveProofHelper(builtSecureEnclaveHelper);
const electronZipDir = await checksumVerifiedElectronZipDirectory();

const appPaths = await packager({
  appBundleId: 'com.socialeap.dosai',
  appCategoryType: 'public.app-category.developer-tools',
  arch: 'arm64',
  asar: true,
  dir: root,
  electronVersion: '43.2.0',
  ...(electronZipDir === undefined ? {} : { electronZipDir }),
  executableName: appName,
  extraResource: [builtSecureEnclaveHelper],
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
const packagedSecureEnclaveHelper = join(
  appBundle,
  'Contents',
  'Resources',
  secureEnclaveProofHelperName,
);

await Promise.all([
  access(executable),
  access(asarPath),
  access(infoPlistPath),
  access(packagedSecureEnclaveHelper),
]);

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

const helperStats = await stat(packagedSecureEnclaveHelper);
assert.ok(helperStats.isFile(), 'Packaged Secure Enclave proof helper is not a file');
assert.notEqual(helperStats.mode & 0o111, 0, 'Packaged Secure Enclave proof helper is not executable');
const helperMagic = (await readFile(packagedSecureEnclaveHelper)).subarray(0, 4).toString('hex');
assert.equal(helperMagic, 'cffaedfe', 'Packaged Secure Enclave proof helper is not 64-bit Mach-O');
const helperDescription = await describeSecureEnclaveProofHelper(packagedSecureEnclaveHelper);
assert.deepEqual(helperDescription, {
  ok: true,
  result: {
    helper_id: 'com.socialeap.dosai.secure-enclave-proof',
    key_scope: 'UNIQUE_TRANSIENT_TEST_TAG_ONLY',
    minimum_macos_version: '15.0',
    mutation_performed: false,
    network_authority: false,
    operations: ['describe', 'exercise-test-lifecycle', 'cleanup-test-key'],
    production_checkpoint_signing: false,
    protocol_version: 1,
    remote_attestation: 'UNAVAILABLE',
    stdin_consumed: false,
  },
  schema: 'DOSAI_SECURE_ENCLAVE_PROOF_HELPER_V1',
});

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
console.log(`Verified ${Object.keys(FuseV1Options).length / 2} declared Electron fuses, ${packagedFiles.length} ASAR entries, a least-privilege Info.plist, and the read-only native-helper description`);
