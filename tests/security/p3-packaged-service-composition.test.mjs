import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');
const fixtureBuildSource = await readFile(
  resolve(root, 'scripts/watchdog-xpc-fixture.mjs'),
  'utf8',
);
const v15 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v15.json'), 'utf8'),
);

test('static watchdog package mode is exact and owner-authorized', () => {
  const service = v15.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(v15.status, 'ACCEPTED');
  assert.equal(service.owner_authorized_packaged_test_app_signing, true);
  assert.equal(service.owner_authorized_packaged_test_fixture_signing, true);
  assert.match(packageSource, /const staticWatchdogArgument = '--static-watchdog-fixture'/);
  assert.match(packageSource, /const staticWatchdogIdentitySelector = 'UMXN25Z493'/);
  assert.match(packageSource, /const staticWatchdogTeamIdentifier = '3RD3TADLRY'/);
  assert.match(
    packageSource,
    /Contents\/Library\/LaunchServices\/com\.socialeap\.dosai\.watchdog-xpc-fixture/,
  );
  assert.match(packageSource, /arguments_\.length === 0/);
  assert.match(packageSource, /arguments_\.length === 1/);
  assert.match(packageSource, /DOSAI_PACKAGE_ARGUMENTS_0001/);
});

test('nested fixture is signed before the outer app and both are strictly verified', () => {
  const nestedBuildIndex = packageSource.indexOf('buildWatchdogXPCFixture(packagedWatchdogFixture');
  const outerSignIndex = packageSource.indexOf("'--identifier',\n    appIdentifier,\n    appBundle");
  assert.ok(nestedBuildIndex > 0);
  assert.ok(outerSignIndex > nestedBuildIndex);
  assert.match(packageSource, /codesign\(\['--verify', '--strict', '--verbose=2', packagedWatchdogFixture\]\)/);
  assert.match(packageSource, /codesign\(\['--verify', '--deep', '--strict', '--verbose=2', appBundle\]\)/);
  assert.match(packageSource, /buildWatchdogXPCFixture\(packagedWatchdogFixture/);
  assert.match(fixtureBuildSource, /export const watchdogXPCFixtureSources = Object\.freeze/);
  assert.match(packageSource, /TeamIdentifier=/);
  assert.match(packageSource, /doesNotMatch\(fixtureSigning, \/Signature=adhoc\//);
  assert.match(packageSource, /doesNotMatch\(appSigning, \/Signature=adhoc\//);
});

test('accepted anonymous composition remains plist-free and effect-free', () => {
  assert.doesNotMatch(packageSource, /spawn\s*\(|exec\s*\(|fork\s*\(/);
  assert.doesNotMatch(packageSource, /invokeWatchdogXPCFixture/);
  assert.match(
    packageSource,
    /if \(!packageMode\.staticWatchdogFixture\) \{\n\s+const helperDescription = await describeSecureEnclaveProofHelper/,
  );
  const buildOnlySource = fixtureBuildSource.slice(
    fixtureBuildSource.indexOf('export async function buildWatchdogXPCFixture'),
    fixtureBuildSource.indexOf('export async function invokeWatchdogXPCFixture'),
  );
  assert.ok(buildOnlySource.length > 0);
  assert.doesNotMatch(buildOnlySource, /invokeWatchdogXPCFixture|resolve\(executablePath\)/);
  const anonymousPackageBlock = packageSource.slice(
    packageSource.indexOf('if (packageMode.anonymousWatchdogFixture)'),
    packageSource.indexOf('if (packageMode.staticNamedServiceFixture)'),
  );
  assert.doesNotMatch(
    anonymousPackageBlock,
    /MachServices|packagedNamedServiceLaunchAgent|copyFile|ServiceManagement|SMAppService|launchctl|xpc_connection_create_mach_service/,
  );
  assert.match(packageSource, /assert\.rejects\(access\(forbiddenPath\)\)/);

  const service = v15.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'launch_daemon_plist_authority',
    'packaged_fixture_application_reachable',
    'mach_service_listener_authority',
    'vm_creation_authority',
    'vm_start_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
    'journal_authority',
    'reconciliation_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});
