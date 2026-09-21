import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const packagePath = resolve(root, 'scripts/package.mjs');
const packageSource = await readFile(packagePath, 'utf8');
const sourcePlistPath = resolve(
  root,
  'native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist',
);
const sourcePlist = await readFile(sourcePlistPath);
const v27 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v27.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);
const service = v27.native_helpers.find(({ id }) => id === 'execution-service');

test('plist-bearing package mode is exact and owner-authorized', () => {
  assert.equal(v27.status, 'ACCEPTED');
  assert.equal(
    service.launch_agent_static_package_candidate_authority,
    'ACCEPTED_OWNER_GATED_SIGNED_TEST_PACKAGE_ONLY',
  );
  assert.equal(
    service.launch_agent_static_package_signing_authority,
    'OWNER_AUTHORIZED_TEST_ONLY',
  );
  assert.equal(service.owner_authorized_launch_agent_static_package_nested_signing, true);
  assert.equal(service.owner_authorized_launch_agent_static_package_outer_signing, true);
  assert.match(
    packageSource,
    /const staticNamedServiceLaunchAgentArgument =\n\s+'--static-named-service-launch-agent-fixture'/,
  );
  assert.match(
    packageSource,
    /Contents\/Library\/LaunchAgents\/com\.socialeap\.dosai\.execution-service-fixture\.plist/,
  );
  assert.equal((packageSource.match(/arguments_\.length === 1/g) ?? []).length, 5);
  assert.match(
    packageSource,
    /staticNamedServiceLaunchAgentFixture: true,\n\s+staticNamedServiceFixture: true,\n\s+staticStatusAddonFixture: false,\n\s+staticWatchdogFixture: true/,
  );
  assert.equal(v37.status, 'ACCEPTED');
  assert.match(
    packageSource,
    /--signed-app-service-management-status-proof-fixture/,
  );
  assert.match(
    packageSource,
    /staticNamedServiceLaunchAgentFixture: true,\n\s+staticNamedServiceFixture: true,\n\s+staticStatusAddonFixture: true,\n\s+staticWatchdogFixture: true,\n\s+signedAppStatusProofFixture: true/,
  );
});

test('admission rejects unknown, combined, empty, and extra package arguments before effects', async () => {
  const outStatsBefore = await stat(resolve(root, 'out'));
  for (const arguments_ of [
    ['--unknown'],
    [''],
    ['--static-named-service-launch-agent-fixture', '--static-named-service-fixture'],
    ['--static-named-service-launch-agent-fixture', '--'],
  ]) {
    await assert.rejects(
      execFileAsync(process.execPath, [packagePath, ...arguments_], {
        cwd: root,
        encoding: 'utf8',
        env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
        maxBuffer: 256 * 1024,
        timeout: 10_000,
      }),
      (error) => error?.stderr?.includes('DOSAI_PACKAGE_ARGUMENTS_0001') === true,
    );
  }
  const outStatsAfter = await stat(resolve(root, 'out'));
  assert.equal(outStatsAfter.mtimeMs, outStatsBefore.mtimeMs);
});

test('accepted plist is verified and copied between nested and outer signing', () => {
  assert.equal(
    createHash('sha256').update(sourcePlist).digest('hex'),
    'b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5',
  );
  assert.match(packageSource, /lstat\(staticNamedServiceLaunchAgentSource\)/);
  assert.match(packageSource, /sourceStats\.isSymbolicLink\(\), false/);
  assert.match(
    packageSource,
    /copyFile\(staticNamedServiceLaunchAgentSource, packagedNamedServiceLaunchAgent\)/,
  );
  assert.match(packageSource, /packagedPlistStats\.isSymbolicLink\(\), false/);
  assert.equal(
    (packageSource.match(/staticNamedServiceLaunchAgentSourceSha256/g) ?? []).length,
    3,
  );
  assert.equal(
    (packageSource.match(/staticNamedServiceLaunchAgentValue/g) ?? []).length,
    3,
  );

  const nestedSignIndex = packageSource.indexOf(
    'buildWatchdogNamedServiceFixture(packagedNamedServiceFixture)',
  );
  const plistCopyIndex = packageSource.indexOf(
    'copyFile(staticNamedServiceLaunchAgentSource, packagedNamedServiceLaunchAgent)',
  );
  const outerSignIndex = packageSource.indexOf(
    "'--identifier',\n    appIdentifier,\n    appBundle",
    nestedSignIndex,
  );
  assert.ok(nestedSignIndex > 0);
  assert.ok(plistCopyIndex > nestedSignIndex);
  assert.ok(outerSignIndex > plistCopyIndex);
});

test('final package verifies signatures, identifiers, and exact Library layout', () => {
  assert.match(
    packageSource,
    /codesign\(\['--verify', '--strict', '--verbose=2', packagedNamedServiceFixture\]\)/,
  );
  assert.match(
    packageSource,
    /codesign\(\['--verify', '--deep', '--strict', '--verbose=2', appBundle\]\)/,
  );
  assert.equal((packageSource.match(/'\-R'/g) ?? []).length, 3);
  assert.match(packageSource, /TeamIdentifier=/);
  assert.match(
    packageSource,
    /await listRelativeEntries\(join\(appBundle, 'Contents\/Library'\)\)/,
  );
  for (const entry of [
    'LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist',
    'LaunchServices/com.socialeap.dosai.execution-service-fixture',
  ]) {
    assert.match(packageSource, new RegExp(entry.replaceAll('.', '\\.')));
  }
});

test('plist-bearing package adds no registration, launch, or application effect', () => {
  assert.doesNotMatch(
    packageSource,
    /SMAppService|agent\(plistName|registerAndReturnError|unregisterAndReturnError|launchctl/,
  );
  assert.doesNotMatch(
    packageSource,
    /invokeWatchdogXPCFixture|invokeWatchdogNamedService|open\s*\(|NSWorkspace|xpc_connection_create_mach_service/,
  );
  assert.match(packageSource, /await assert\.rejects\(access\(packagedWatchdogFixture\)\)/);
  assert.match(
    packageSource,
    /await assert\.rejects\(access\(join\(appBundle, 'Contents\/Library\/LaunchDaemons'\)\)\)/,
  );
  for (const field of [
    'launch_agent_static_package_executable_invocation_observed',
    'launch_agent_static_package_app_invocation_observed',
    'launch_agent_static_package_service_management_observed',
    'launch_agent_static_package_launchctl_observed',
    'launch_agent_static_package_registration_observed',
    'launch_agent_static_package_launch_observed',
    'launch_agent_static_package_application_connection_observed',
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
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
