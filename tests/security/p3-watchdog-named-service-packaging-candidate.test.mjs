import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const builderSource = await readFile(
  resolve(root, 'scripts/watchdog-named-service-fixture.mjs'),
  'utf8',
);
const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');
const v23 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v23.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);
const service = v23.native_helpers.find(({ id }) => id === 'execution-service');

test('named-service builder fixes source, target, identity, and identifier', () => {
  assert.equal(v23.status, 'ACCEPTED');
  assert.equal(
    service.named_service_static_package_candidate_authority,
    'ACCEPTED_OWNER_GATED_SIGNED_TEST_PACKAGE_ONLY',
  );
  assert.equal(service.named_service_static_package_signing_authority, 'OWNER_AUTHORIZED_TEST_ONLY');
  assert.equal(service.owner_authorized_named_service_fixture_signing, true);
  assert.equal(service.owner_authorized_named_service_outer_app_signing, true);

  for (const source of [
    'WatchdogControlCore.swift',
    'WatchdogXPCTransport.swift',
    'WatchdogNamedListenerCandidate.swift',
    'WatchdogNamedListenerTransportCandidate.swift',
    'WatchdogNamedServiceFixtureMain.swift',
  ]) {
    assert.equal((builderSource.match(new RegExp(source, 'g')) ?? []).length, 1, source);
  }
  assert.match(builderSource, /watchdogNamedServiceFixtureSources = Object\.freeze/);
  assert.match(builderSource, /arm64-apple-macos15\.0/);
  assert.match(builderSource, /'-no_adhoc_codesign'/);
  assert.match(builderSource, /const signingIdentitySelector = 'UMXN25Z493'/);
  assert.match(
    builderSource,
    /watchdogNamedServiceFixtureIdentifier =\n\s+'com\.socialeap\.dosai\.execution-service-fixture'/,
  );
  assert.doesNotMatch(builderSource, /process\.argv|process\.env|CommandLine|standardInput/);
});

test('builder can invoke only the compiler and exact signing tool', () => {
  const invokedTools = [...builderSource.matchAll(/execFileAsync\(\s*'([^']+)'/g)]
    .map((match) => match[1]);
  assert.deepEqual(invokedTools, ['/usr/bin/xcrun', '/usr/bin/codesign']);
  assert.doesNotMatch(builderSource, /invoke|spawn\s*\(|fork\s*\(|exec\s*\(/);
  assert.doesNotMatch(
    builderSource,
    /ServiceManagement|SMAppService|launchctl|Virtualization|VZVirtualMachine|URLSession|NWConnection|socket\s*\(/,
  );
});

test('package mode is exact, mutually exclusive, and fixed-path', () => {
  assert.match(packageSource, /const staticNamedServiceArgument = '--static-named-service-fixture'/);
  assert.match(packageSource, /const staticNamedServiceIdentitySelector = 'UMXN25Z493'/);
  assert.match(packageSource, /const staticNamedServiceTeamIdentifier = '3RD3TADLRY'/);
  assert.match(
    packageSource,
    /Contents\/Library\/LaunchServices\/com\.socialeap\.dosai\.execution-service-fixture/,
  );
  assert.equal(
    (packageSource.match(/arguments_\.length === 1/g) ?? []).length,
    5,
  );
  assert.match(packageSource, /DOSAI_PACKAGE_ARGUMENTS_0001/);
  assert.match(
    packageSource,
    /staticNamedServiceFixture: true,\n\s+staticStatusAddonFixture: false,\n\s+staticWatchdogFixture: true/,
  );
  assert.match(
    packageSource,
    /anonymousWatchdogFixture: false,\n\s+staticNamedServiceLaunchAgentFixture: false,\n\s+staticNamedServiceFixture: true/,
  );
  assert.equal(v37.status, 'ACCEPTED');
  assert.match(
    packageSource,
    /staticNamedServiceFixture: true,\n\s+staticStatusAddonFixture: true,\n\s+staticWatchdogFixture: true,\n\s+signedAppStatusProofFixture: true/,
  );
});

test('named service is built and signed before the outer app and both are inspected', () => {
  const nestedBuildIndex = packageSource.indexOf(
    'buildWatchdogNamedServiceFixture(packagedNamedServiceFixture)',
  );
  const outerSignIndex = packageSource.indexOf(
    "'--identifier',\n    appIdentifier,\n    appBundle",
    nestedBuildIndex,
  );
  assert.ok(nestedBuildIndex > 0);
  assert.ok(outerSignIndex > nestedBuildIndex);
  assert.match(
    packageSource,
    /codesign\(\['--verify', '--strict', '--verbose=2', packagedNamedServiceFixture\]\)/,
  );
  assert.match(
    packageSource,
    /codesign\(\['--verify', '--deep', '--strict', '--verbose=2', appBundle\]\)/,
  );
  assert.equal((packageSource.match(/'\-R'/g) ?? []).length, 3);
  assert.equal((packageSource.match(/`=\$\{(?:namedService|app)Requirement\}`/g) ?? []).length, 2);
  assert.match(packageSource, /TeamIdentifier=/);
  assert.match(packageSource, /execFileAsync\('\/usr\/bin\/lipo'/);
  assert.match(packageSource, /execFileAsync\('\/usr\/bin\/xcrun', \['vtool'/);
  assert.match(packageSource, /execFileAsync\('\/usr\/bin\/otool'/);
  assert.match(packageSource, /doesNotMatch\(namedServiceSigning, \/Signature=adhoc\//);
});

test('accepted plist-free mode remains distinct and all static modes remain effect-free', () => {
  assert.match(
    packageSource,
    /if \(!packageMode\.staticWatchdogFixture\) \{\n\s+const helperDescription = await describeSecureEnclaveProofHelper/,
  );
  assert.doesNotMatch(packageSource, /invokeWatchdogXPCFixture|invokeWatchdogNamedService/);
  assert.doesNotMatch(
    packageSource,
    /SMAppService|agent\(plistName|registerAndReturnError|unregisterAndReturnError|launchctl/,
  );
  assert.match(packageSource, /assert\.rejects\(access\(packagedWatchdogFixture\)\)/);
  assert.match(
    packageSource,
    /else \{\n\s+await assert\.rejects\(access\(join\(appBundle, 'Contents\/Library\/LaunchAgents'\)\)\);/,
  );
  for (const field of [
    'named_service_static_package_executable_invocation_observed',
    'named_service_static_package_app_invocation_observed',
    'named_service_static_package_plist_observed',
    'named_service_static_package_registration_observed',
    'named_service_static_package_launch_observed',
    'named_service_static_package_application_connection_observed',
    'application_reachable',
    'registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
    'reconciliation_authority',
    'journal_authority',
    'vm_creation_authority',
    'vm_start_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});
