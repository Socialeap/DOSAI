import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  buildWatchdogXPCFixture,
  invokeWatchdogXPCFixture,
  watchdogXPCFixtureIdentifier,
  watchdogXPCFixtureName,
  watchdogXPCFixtureSources,
} from '../../scripts/watchdog-xpc-fixture.mjs';

const execFileAsync = promisify(execFile);

async function rejectedInvocation(executable, arguments_) {
  try {
    await execFileAsync(executable, arguments_, {
      encoding: 'utf8',
      env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
      maxBuffer: 64 * 1024,
      timeout: 5_000,
    });
  } catch (error) {
    return {
      exitCode: error.code,
      response: JSON.parse(error.stdout),
      stderr: error.stderr,
    };
  }
  throw new Error('UNSAFE_WATCHDOG_XPC_INPUT_ACCEPTED');
}

test('XPC fixture source is anonymous, strictly framed, and transport-only', async () => {
  const sources = await Promise.all(watchdogXPCFixtureSources.map((path) => readFile(path, 'utf8')));
  const source = sources.join('\n');
  const transportSource = sources.slice(1).join('\n');
  const imports = [...source.matchAll(/^import ([A-Za-z0-9_]+)$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['Foundation', 'Foundation', 'XPC', 'Foundation']);
  assert.match(transportSource, /xpc_connection_set_peer_code_signing_requirement/g);
  assert.match(transportSource, /anchor apple generic/);
  assert.match(transportSource, /certificate leaf\[subject\.OU\]/);
  assert.match(transportSource, /identifier/);
  assert.doesNotMatch(transportSource, /\bsignature\b/i);
  assert.doesNotMatch(source, /import (?:ServiceManagement|Virtualization|Network|Security)/);
  assert.doesNotMatch(source, /xpc_connection_create_mach_service|XPCListener|NSXPCConnection/);
  assert.doesNotMatch(source, /\b(?:VZVirtualMachine|SMAppService)\b/);
  assert.doesNotMatch(source, /\bProcess\s*\(|posix_spawn|execve|system\s*\(/);
  assert.doesNotMatch(source, /standardInput|readToEnd|FileManager|Data\(contentsOf:|write\(to:/);
  assert.doesNotMatch(source, /URLSession|CFNetwork|NWConnection|socket\s*\(/);
});

test('ad-hoc arm64 macOS 15 XPC fixture proves framing and rejects peer authentication', {
  timeout: 120_000,
}, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'dosai-watchdog-xpc-test-'));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  const executable = join(directory, watchdogXPCFixtureName);
  let signingAccessorInvoked = false;
  const hostileOptions = {};
  Object.defineProperty(hostileOptions, 'signingIdentity', {
    enumerable: true,
    get() {
      signingAccessorInvoked = true;
      return '-';
    },
  });
  await assert.rejects(
    () => buildWatchdogXPCFixture(executable, hostileOptions),
    /BUILD_OPTIONS/,
  );
  assert.equal(signingAccessorInvoked, false);
  await assert.rejects(
    () => buildWatchdogXPCFixture(executable, { unknown: true }),
    /BUILD_OPTIONS/,
  );
  await buildWatchdogXPCFixture(executable);

  const executableStats = await stat(executable);
  assert.ok(executableStats.isFile());
  assert.notEqual(executableStats.mode & 0o111, 0);

  const description = await invokeWatchdogXPCFixture(executable, 'describe');
  assert.deepEqual(description, {
    ok: true,
    result: {
      ad_hoc_authentication_eligible: false,
      application_reachable: false,
      filesystem_authority: false,
      helper_id: watchdogXPCFixtureIdentifier,
      journal_authority: false,
      mach_service_registered: false,
      minimum_macos_version: '15.0',
      network_authority: false,
      operations: ['describe', 'self-test', 'peer-auth-self-test'],
      peer_requirement_api: 'xpc_connection_set_peer_code_signing_requirement',
      process_launch_authority: false,
      production_registration_authority: false,
      protocol_version: 1,
      service_management_imported: false,
      stdin_consumed: false,
      transport: 'ANONYMOUS_IN_PROCESS_XPC',
      virtual_machine_authority: false,
    },
    schema: 'DOSAI_WATCHDOG_XPC_FIXTURE_V1',
  });

  const report = await invokeWatchdogXPCFixture(executable, 'self-test');
  assert.equal(report.ok, true);
  assert.equal(report.result.peer_authentication_claimed, false);
  assert.ok(Object.values(report.result.checks).every((value) => value === true));

  const invalidTeam = await rejectedInvocation(executable, ['peer-auth-self-test', 'bad']);
  assert.equal(invalidTeam.exitCode, 77);
  assert.equal(invalidTeam.response.result.outcome, 'INVALID_TEAM_IDENTIFIER');
  assert.equal(invalidTeam.response.result.requirement_configured_on_both_connections, false);

  const adHoc = await rejectedInvocation(executable, ['peer-auth-self-test', 'ABCDE12345']);
  assert.equal(adHoc.exitCode, 77);
  assert.equal(adHoc.response.ok, false);
  assert.equal(adHoc.response.result.authenticated_peer_observed, false);
  assert.equal(adHoc.response.result.outcome, 'PEER_IDENTITY_REJECTED');
  assert.equal(adHoc.response.result.requirement_configured_on_both_connections, true);
  assert.equal(adHoc.response.result.synthetic_trust_installed, false);

  const [architectures, build, libraries, signing] = await Promise.all([
    execFileAsync('/usr/bin/lipo', ['-archs', executable], { encoding: 'utf8' }),
    execFileAsync('/usr/bin/xcrun', ['vtool', '-show-build', executable], { encoding: 'utf8' }),
    execFileAsync('/usr/bin/otool', ['-L', executable], { encoding: 'utf8' }),
    execFileAsync('/usr/bin/codesign', ['-d', '--verbose=4', executable], { encoding: 'utf8' }),
    execFileAsync('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', executable], {
      encoding: 'utf8',
    }),
  ]);
  assert.equal(architectures.stdout.trim(), 'arm64');
  assert.match(build.stdout, /minos 15\.0/);
  assert.match(libraries.stdout, /libswiftXPC/);
  assert.doesNotMatch(libraries.stdout, /Virtualization|ServiceManagement|Network\.framework/);
  assert.match(signing.stderr, new RegExp(`Identifier=${watchdogXPCFixtureIdentifier}`));
  assert.match(signing.stderr, /Signature=adhoc/);
  assert.match(signing.stderr, /TeamIdentifier=not set/);

  for (const arguments_ of [
    [],
    ['unknown'],
    ['describe', 'extra'],
    ['self-test', 'extra'],
    ['peer-auth-self-test'],
    ['peer-auth-self-test', 'ABCDE12345', 'extra'],
  ]) {
    const rejected = await rejectedInvocation(executable, arguments_);
    assert.equal(rejected.exitCode, 64);
    assert.deepEqual(rejected.response, {
      error: { code: 'DOSAI_WATCHDOG_XPC_FIXTURE_PROTOCOL_0001' },
      ok: false,
      schema: 'DOSAI_WATCHDOG_XPC_FIXTURE_V1',
    });
    assert.equal(rejected.stderr, '');
  }
});
