import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  buildWatchdogControlFixture,
  invokeWatchdogControlFixture,
  watchdogControlFixtureName,
  watchdogControlFixtureSources,
} from '../../scripts/watchdog-control-fixture.mjs';

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
  throw new Error('UNSAFE_WATCHDOG_FIXTURE_INPUT_ACCEPTED');
}

test('Swift fixture source has only inert control-core capability', async () => {
  const sources = await Promise.all(watchdogControlFixtureSources.map((path) => readFile(path, 'utf8')));
  const source = sources.join('\n');
  const imports = [...source.matchAll(/^import ([A-Za-z0-9_]+)$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['Foundation', 'Foundation']);
  assert.match(source, /case inspect = "INSPECT"/);
  assert.match(source, /case stopOne = "STOP_ONE"/);
  assert.match(source, /case stopAll = "STOP_ALL"/);
  assert.match(source, /disconnect\(\)/);
  assert.doesNotMatch(source, /import (?:ServiceManagement|Virtualization|XPC|Network)/);
  assert.doesNotMatch(source, /\b(?:VZVirtualMachine|SMAppService|XPCListener|NSXPCConnection)\b/);
  assert.doesNotMatch(source, /\bProcess\s*\(|posix_spawn|execve|system\s*\(/);
  assert.doesNotMatch(source, /standardInput|readToEnd|FileManager|Data\(contentsOf:|write\(to:/);
  assert.doesNotMatch(source, /URLSession|CFNetwork|NWConnection|socket\s*\(/);
});

test('arm64 macOS 15 fixture is ad-hoc signed and passes adversarial self-test', {
  timeout: 120_000,
}, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'dosai-watchdog-control-test-'));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  const executable = join(directory, watchdogControlFixtureName);
  await buildWatchdogControlFixture(executable);

  const executableStats = await stat(executable);
  assert.ok(executableStats.isFile());
  assert.notEqual(executableStats.mode & 0o111, 0);

  const description = await invokeWatchdogControlFixture(executable, 'describe');
  assert.deepEqual(description, {
    ok: true,
    result: {
      application_reachable: false,
      external_mutation_authority: false,
      filesystem_authority: false,
      generic_payload_authority: false,
      helper_id: 'com.socialeap.dosai.watchdog-control-fixture',
      journal_authority: false,
      minimum_macos_version: '15.0',
      network_authority: false,
      operations: ['describe', 'self-test'],
      process_launch_authority: false,
      production_registration_authority: false,
      protocol_version: 1,
      stdin_consumed: false,
      transport_implemented: false,
      virtual_machine_authority: false,
    },
    schema: 'DOSAI_WATCHDOG_CONTROL_FIXTURE_V1',
  });

  const report = await invokeWatchdogControlFixture(executable, 'self-test');
  assert.equal(report.ok, true);
  assert.equal(report.schema, 'DOSAI_WATCHDOG_CONTROL_FIXTURE_V1');
  assert.equal(report.result.external_mutation_performed, false);
  assert.equal(report.result.fixture_records_mutated, true);
  assert.equal(report.result.transport_implemented, false);
  assert.deepEqual(report.result.priority_order, ['STOP_ALL', 'STOP_ONE', 'INSPECT']);
  assert.ok(Object.values(report.result.checks).every((value) => value === true));

  const [{ stdout: architectures }, { stdout: build }, { stdout: libraries }] = await Promise.all([
    execFileAsync('/usr/bin/lipo', ['-archs', executable], { encoding: 'utf8' }),
    execFileAsync('/usr/bin/xcrun', ['vtool', '-show-build', executable], { encoding: 'utf8' }),
    execFileAsync('/usr/bin/otool', ['-L', executable], { encoding: 'utf8' }),
    execFileAsync('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', executable], {
      encoding: 'utf8',
    }),
  ]);
  assert.equal(architectures.trim(), 'arm64');
  assert.match(build, /minos 15\.0/);
  assert.doesNotMatch(libraries, /Virtualization|ServiceManagement|XPC\.framework|Network\.framework/);

  for (const arguments_ of [[], ['unknown'], ['describe', 'extra'], ['self-test', 'extra']]) {
    assert.deepEqual(await rejectedInvocation(executable, arguments_), {
      exitCode: 64,
      response: {
        error: { code: 'DOSAI_WATCHDOG_FIXTURE_PROTOCOL_0001' },
        ok: false,
        schema: 'DOSAI_WATCHDOG_CONTROL_FIXTURE_V1',
      },
      stderr: '',
    });
  }
});
