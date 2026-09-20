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
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import plist from 'plist';

import { buildApplication } from './build.mjs';
import {
  buildSecureEnclaveProofHelper,
  describeSecureEnclaveProofHelper,
  secureEnclaveProofHelperName,
} from './secure-enclave-helper.mjs';
import {
  buildServiceManagementStatusAddon,
  serviceManagementStatusAddonIdentifier,
  serviceManagementStatusAddonName,
} from './service-management-status-addon.mjs';
import {
  buildWatchdogXPCFixture,
  watchdogXPCFixtureIdentifier,
} from './watchdog-xpc-fixture.mjs';
import {
  buildWatchdogNamedServiceFixture,
  watchdogNamedServiceFixtureIdentifier,
} from './watchdog-named-service-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const execFileAsync = promisify(execFile);
const outDir = resolve(root, 'out');
const appName = 'DOSAI';
const appIdentifier = 'com.socialeap.dosai';
const nativeBuildDir = resolve(root, 'build/native-helpers');
const builtSecureEnclaveHelper = join(nativeBuildDir, secureEnclaveProofHelperName);
const electronArchiveName = 'electron-v43.2.0-darwin-arm64.zip';
const staticWatchdogArgument = '--static-watchdog-fixture';
const staticWatchdogIdentitySelector = 'UMXN25Z493';
const staticWatchdogTeamIdentifier = '3RD3TADLRY';
const staticWatchdogRelativePath =
  'Contents/Library/LaunchServices/com.socialeap.dosai.watchdog-xpc-fixture';
const staticNamedServiceArgument = '--static-named-service-fixture';
const staticNamedServiceIdentitySelector = 'UMXN25Z493';
const staticNamedServiceTeamIdentifier = '3RD3TADLRY';
const staticNamedServiceRelativePath =
  'Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture';
const staticNamedServiceLaunchAgentArgument =
  '--static-named-service-launch-agent-fixture';
const staticNamedServiceLaunchAgentRelativePath =
  'Contents/Library/LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist';
const staticNamedServiceLaunchAgentSource = resolve(
  root,
  'native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist',
);
const staticNamedServiceLaunchAgentSourceSha256 =
  'b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5';
const staticStatusAddonArgument =
  '--static-named-service-launch-agent-status-addon-fixture';
const signedAppStatusProofArgument =
  '--signed-app-service-management-status-proof-fixture';
const staticStatusAddonRelativePath = `Contents/Resources/${serviceManagementStatusAddonName}`;
const staticNamedServiceLaunchAgentValue = Object.freeze({
  Label: watchdogNamedServiceFixtureIdentifier,
  BundleProgram: staticNamedServiceRelativePath,
  MachServices: Object.freeze({
    'com.socialeap.dosai.execution-service-fixture.watchdog': true,
  }),
});

function admitPackageArguments(arguments_) {
  if (arguments_.length === 0) {
    return Object.freeze({
      anonymousWatchdogFixture: false,
      staticNamedServiceLaunchAgentFixture: false,
      staticNamedServiceFixture: false,
      staticStatusAddonFixture: false,
      staticWatchdogFixture: false,
      signedAppStatusProofFixture: false,
    });
  }
  if (arguments_.length === 1 && arguments_[0] === staticWatchdogArgument) {
    return Object.freeze({
      anonymousWatchdogFixture: true,
      staticNamedServiceLaunchAgentFixture: false,
      staticNamedServiceFixture: false,
      staticStatusAddonFixture: false,
      staticWatchdogFixture: true,
      signedAppStatusProofFixture: false,
    });
  }
  if (arguments_.length === 1 && arguments_[0] === staticNamedServiceArgument) {
    return Object.freeze({
      anonymousWatchdogFixture: false,
      staticNamedServiceLaunchAgentFixture: false,
      staticNamedServiceFixture: true,
      staticStatusAddonFixture: false,
      staticWatchdogFixture: true,
      signedAppStatusProofFixture: false,
    });
  }
  if (
    arguments_.length === 1
    && arguments_[0] === staticNamedServiceLaunchAgentArgument
  ) {
    return Object.freeze({
      anonymousWatchdogFixture: false,
      staticNamedServiceLaunchAgentFixture: true,
      staticNamedServiceFixture: true,
      staticStatusAddonFixture: false,
      staticWatchdogFixture: true,
      signedAppStatusProofFixture: false,
    });
  }
  if (arguments_.length === 1 && arguments_[0] === staticStatusAddonArgument) {
    return Object.freeze({
      anonymousWatchdogFixture: false,
      staticNamedServiceLaunchAgentFixture: true,
      staticNamedServiceFixture: true,
      staticStatusAddonFixture: true,
      staticWatchdogFixture: true,
      signedAppStatusProofFixture: false,
    });
  }
  if (arguments_.length === 1 && arguments_[0] === signedAppStatusProofArgument) {
    return Object.freeze({
      anonymousWatchdogFixture: false,
      staticNamedServiceLaunchAgentFixture: true,
      staticNamedServiceFixture: true,
      staticStatusAddonFixture: true,
      staticWatchdogFixture: true,
      signedAppStatusProofFixture: true,
    });
  }
  throw new Error('DOSAI_PACKAGE_ARGUMENTS_0001');
}

async function codesign(arguments_) {
  return execFileAsync('/usr/bin/codesign', arguments_, {
    encoding: 'utf8',
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
    maxBuffer: 256 * 1024,
    timeout: 30_000,
  });
}

async function signingDescription(path) {
  const { stderr } = await codesign(['-d', '--verbose=4', path]);
  return stderr;
}

const packageMode = admitPackageArguments(process.argv.slice(2));

async function sha256(path) {
  const hasher = createHash('sha256');
  await pipeline(createReadStream(path), hasher);
  return hasher.digest('hex');
}

async function listRelativeEntries(directory, prefix = '') {
  const results = [];
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = prefix === '' ? entry.name : join(prefix, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `Unexpected symbolic link: ${relativePath}`);
    if (entry.isDirectory()) {
      results.push(`${relativePath}/`);
      results.push(...await listRelativeEntries(join(directory, entry.name), relativePath));
      continue;
    }
    assert.equal(entry.isFile(), true, `Unexpected package entry type: ${relativePath}`);
    results.push(relativePath);
  }
  return results;
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

await buildApplication(
  packageMode.signedAppStatusProofFixture
    ? 'service-management-status-proof'
    : 'production',
);
await rm(outDir, { force: true, recursive: true });
await buildSecureEnclaveProofHelper(builtSecureEnclaveHelper);
const electronZipDir = await checksumVerifiedElectronZipDirectory();

const appPaths = await packager({
  appBundleId: appIdentifier,
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
const packagedWatchdogFixture = join(appBundle, staticWatchdogRelativePath);
const packagedNamedServiceFixture = join(appBundle, staticNamedServiceRelativePath);
const packagedNamedServiceLaunchAgent = join(
  appBundle,
  staticNamedServiceLaunchAgentRelativePath,
);
const packagedStatusAddon = join(appBundle, staticStatusAddonRelativePath);

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
if (!packageMode.staticWatchdogFixture) {
  const helperDescription = await describeSecureEnclaveProofHelper(packagedSecureEnclaveHelper);
  assert.deepEqual(helperDescription, {
    ok: true,
    result: {
      helper_id: 'com.socialeap.dosai.secure-enclave-proof',
      key_scope: 'UNIQUE_TRANSIENT_TEST_TAG_ONLY',
      minimum_macos_version: '15.0',
      mutation_performed: false,
      network_authority: false,
      operations: [
        'describe',
        'exercise-test-lifecycle',
        'exercise-ephemeral-hardware',
        'cleanup-test-key',
      ],
      production_checkpoint_signing: false,
      protocol_version: 1,
      remote_attestation: 'UNAVAILABLE',
      stdin_consumed: false,
    },
    schema: 'DOSAI_SECURE_ENCLAVE_PROOF_HELPER_V1',
  });
}

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

if (packageMode.anonymousWatchdogFixture) {
  await mkdir(dirname(packagedWatchdogFixture), { recursive: true });
  await buildWatchdogXPCFixture(packagedWatchdogFixture, {
    signingIdentity: staticWatchdogIdentitySelector,
  });

  await codesign([
    '--force',
    '--sign',
    staticWatchdogIdentitySelector,
    '--identifier',
    appIdentifier,
    appBundle,
  ]);
  await codesign(['--verify', '--strict', '--verbose=2', packagedWatchdogFixture]);
  await codesign(['--verify', '--deep', '--strict', '--verbose=2', appBundle]);

  const [fixtureSigning, appSigning] = await Promise.all([
    signingDescription(packagedWatchdogFixture),
    signingDescription(appBundle),
  ]);
  assert.match(fixtureSigning, new RegExp(`Identifier=${watchdogXPCFixtureIdentifier}`));
  assert.match(fixtureSigning, new RegExp(`TeamIdentifier=${staticWatchdogTeamIdentifier}`));
  assert.doesNotMatch(fixtureSigning, /Signature=adhoc/);
  assert.match(appSigning, new RegExp(`Identifier=${appIdentifier}`));
  assert.match(appSigning, new RegExp(`TeamIdentifier=${staticWatchdogTeamIdentifier}`));
  assert.doesNotMatch(appSigning, /Signature=adhoc/);

  for (const forbiddenPath of [
    join(appBundle, 'Contents/Library/LaunchAgents'),
    join(appBundle, 'Contents/Library/LaunchDaemons'),
  ]) {
    await assert.rejects(access(forbiddenPath));
  }
}

if (packageMode.staticNamedServiceFixture) {
  await mkdir(dirname(packagedNamedServiceFixture), { recursive: true });
  await buildWatchdogNamedServiceFixture(packagedNamedServiceFixture);

  if (packageMode.staticNamedServiceLaunchAgentFixture) {
    const sourceStats = await lstat(staticNamedServiceLaunchAgentSource);
    assert.equal(sourceStats.isFile(), true, 'Source LaunchAgent plist is not a regular file');
    assert.equal(sourceStats.isSymbolicLink(), false, 'Source LaunchAgent plist is a symlink');
    assert.equal(
      await sha256(staticNamedServiceLaunchAgentSource),
      staticNamedServiceLaunchAgentSourceSha256,
      'Source LaunchAgent plist hash mismatch',
    );
    assert.deepEqual(
      plist.parse(await readFile(staticNamedServiceLaunchAgentSource, 'utf8')),
      staticNamedServiceLaunchAgentValue,
    );
    await mkdir(dirname(packagedNamedServiceLaunchAgent), { recursive: true });
    await copyFile(staticNamedServiceLaunchAgentSource, packagedNamedServiceLaunchAgent);
    const packagedPlistStats = await lstat(packagedNamedServiceLaunchAgent);
    assert.equal(packagedPlistStats.isFile(), true, 'Packaged LaunchAgent plist is not a file');
    assert.equal(packagedPlistStats.isSymbolicLink(), false, 'Packaged LaunchAgent plist is a symlink');
    assert.equal(
      await sha256(packagedNamedServiceLaunchAgent),
      staticNamedServiceLaunchAgentSourceSha256,
      'Packaged LaunchAgent plist hash mismatch',
    );
    assert.deepEqual(
      plist.parse(await readFile(packagedNamedServiceLaunchAgent, 'utf8')),
      staticNamedServiceLaunchAgentValue,
    );
  }

  if (packageMode.staticStatusAddonFixture) {
    await buildServiceManagementStatusAddon(packagedStatusAddon);
  } else {
    await assert.rejects(access(packagedStatusAddon));
  }

  await codesign([
    '--force',
    '--sign',
    staticNamedServiceIdentitySelector,
    '--identifier',
    appIdentifier,
    appBundle,
  ]);
  await codesign(['--verify', '--strict', '--verbose=2', packagedNamedServiceFixture]);
  if (packageMode.staticStatusAddonFixture) {
    await codesign(['--verify', '--strict', '--verbose=2', packagedStatusAddon]);
  }
  await codesign(['--verify', '--deep', '--strict', '--verbose=2', appBundle]);

  const namedServiceRequirement =
    `identifier "${watchdogNamedServiceFixtureIdentifier}" and anchor apple generic `
    + `and certificate leaf[subject.OU] = "${staticNamedServiceTeamIdentifier}"`;
  const appRequirement =
    `identifier "${appIdentifier}" and anchor apple generic `
    + `and certificate leaf[subject.OU] = "${staticNamedServiceTeamIdentifier}"`;
  const statusAddonRequirement =
    `identifier "${serviceManagementStatusAddonIdentifier}" and anchor apple generic `
    + `and certificate leaf[subject.OU] = "${staticNamedServiceTeamIdentifier}"`;
  await codesign([
    '--verify',
    '--strict',
    '-R',
    `=${namedServiceRequirement}`,
    packagedNamedServiceFixture,
  ]);
  await codesign([
    '--verify',
    '--deep',
    '--strict',
    '-R',
    `=${appRequirement}`,
    appBundle,
  ]);
  if (packageMode.staticStatusAddonFixture) {
    await codesign([
      '--verify',
      '--strict',
      '-R',
      `=${statusAddonRequirement}`,
      packagedStatusAddon,
    ]);
  }

  const [namedServiceSigning, appSigning, architectures, build, libraries] =
    await Promise.all([
      signingDescription(packagedNamedServiceFixture),
      signingDescription(appBundle),
      execFileAsync('/usr/bin/lipo', ['-archs', packagedNamedServiceFixture], {
        encoding: 'utf8',
      }),
      execFileAsync('/usr/bin/xcrun', ['vtool', '-show-build', packagedNamedServiceFixture], {
        encoding: 'utf8',
      }),
      execFileAsync('/usr/bin/otool', ['-L', packagedNamedServiceFixture], {
        encoding: 'utf8',
      }),
    ]);
  assert.match(
    namedServiceSigning,
    new RegExp(`Identifier=${watchdogNamedServiceFixtureIdentifier}`),
  );
  assert.match(
    namedServiceSigning,
    new RegExp(`TeamIdentifier=${staticNamedServiceTeamIdentifier}`),
  );
  assert.doesNotMatch(namedServiceSigning, /Signature=adhoc/);
  assert.match(appSigning, new RegExp(`Identifier=${appIdentifier}`));
  assert.match(appSigning, new RegExp(`TeamIdentifier=${staticNamedServiceTeamIdentifier}`));
  assert.doesNotMatch(appSigning, /Signature=adhoc/);
  assert.equal(architectures.stdout.trim(), 'arm64');
  assert.match(build.stdout, /minos 15\.0/);
  assert.match(libraries.stdout, /libswiftXPC/);
  assert.match(libraries.stdout, /libswiftDispatch/);
  for (const forbiddenFramework of [
    ['Virtual', 'ization'].join(''),
    ['Service', 'Management'].join(''),
    ['Net', 'work.framework'].join(''),
    ['Sec', 'urity.framework'].join(''),
  ]) {
    assert.equal(libraries.stdout.includes(forbiddenFramework), false, forbiddenFramework);
  }

  if (packageMode.staticStatusAddonFixture) {
    const [
      addonSigning,
      addonArchitectures,
      addonBuild,
      addonLibraries,
      addonSymbols,
    ] = await Promise.all([
      signingDescription(packagedStatusAddon),
      execFileAsync('/usr/bin/lipo', ['-archs', packagedStatusAddon], {
        encoding: 'utf8',
      }),
      execFileAsync('/usr/bin/xcrun', ['vtool', '-show-build', packagedStatusAddon], {
        encoding: 'utf8',
      }),
      execFileAsync('/usr/bin/otool', ['-L', packagedStatusAddon], {
        encoding: 'utf8',
      }),
      execFileAsync('/usr/bin/nm', ['-g', packagedStatusAddon], {
        encoding: 'utf8',
      }),
    ]);
    assert.match(
      addonSigning,
      new RegExp(`Identifier=${serviceManagementStatusAddonIdentifier}`),
    );
    assert.match(
      addonSigning,
      new RegExp(`TeamIdentifier=${staticNamedServiceTeamIdentifier}`),
    );
    assert.doesNotMatch(addonSigning, /Signature=adhoc/);
    assert.equal(addonArchitectures.stdout.trim(), 'arm64');
    assert.match(addonBuild.stdout, /minos 15\.0/);
    assert.match(addonLibraries.stdout, /ServiceManagement\.framework/);
    assert.doesNotMatch(
      addonLibraries.stdout,
      /Virtualization\.framework|Security\.framework|Network\.framework/,
    );
    assert.match(addonSymbols.stdout, /node_api_module_get_api_version_v1/);
    assert.match(addonSymbols.stdout, /napi_register_module_v1/);
    assert.deepEqual(
      [...addonSymbols.stdout.matchAll(/^\s+U (_napi_[A-Za-z0-9_]+)$/gm)]
        .map((match) => match[1])
        .sort(),
      [
        '_napi_create_function',
        '_napi_create_string_utf8',
        '_napi_get_cb_info',
        '_napi_set_named_property',
      ],
    );
    assert.doesNotMatch(addonSymbols.stdout, /\bnode::|\bv8::|\buv_|\bSSL_|\bCRYPTO_/);
  }

  await assert.rejects(access(packagedWatchdogFixture));
  await assert.rejects(access(join(appBundle, 'Contents/Library/LaunchDaemons')));
  if (packageMode.staticNamedServiceLaunchAgentFixture) {
    assert.deepEqual(
      await listRelativeEntries(join(appBundle, 'Contents/Library')),
      [
        'LaunchAgents/',
        'LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist',
        'LaunchServices/',
        'LaunchServices/com.socialeap.dosai.execution-service-fixture',
      ],
    );
  } else {
    await assert.rejects(access(join(appBundle, 'Contents/Library/LaunchAgents')));
  }
}

console.log(`Packaged ${appBundle}`);
console.log(`Verified ${Object.keys(FuseV1Options).length / 2} declared Electron fuses, ${packagedFiles.length} ASAR entries, and a least-privilege Info.plist`);
if (!packageMode.staticWatchdogFixture) {
  console.log('Verified the read-only native-helper description');
}
if (packageMode.anonymousWatchdogFixture) {
  console.log(
    `Verified static nested watchdog fixture ${staticWatchdogRelativePath} with no service registration or launch`,
  );
}
if (packageMode.staticNamedServiceFixture) {
  console.log(
    `Verified static nested named-service fixture ${staticNamedServiceRelativePath} with no service registration or launch`,
  );
}
if (packageMode.staticNamedServiceLaunchAgentFixture) {
  console.log(
    `Verified static LaunchAgent declaration ${staticNamedServiceLaunchAgentRelativePath} with no service registration or launch`,
  );
}
if (packageMode.staticStatusAddonFixture) {
  console.log(
    `Verified static Service Management status addon ${staticStatusAddonRelativePath} without loading or invocation`,
  );
}
if (packageMode.signedAppStatusProofFixture) {
  console.log('Packaged the signed-app status-proof bundle without launching it');
}
