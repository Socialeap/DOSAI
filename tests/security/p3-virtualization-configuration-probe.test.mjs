import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  buildVirtualizationConfigurationProbe,
  invokeVirtualizationConfigurationProbe,
  virtualizationConfigurationProbeEntitlements,
  virtualizationConfigurationProbeName,
  virtualizationConfigurationProbeSource,
} from '../../scripts/virtualization-configuration-probe.mjs';

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
  throw new Error('UNSAFE_PROBE_INPUT_ACCEPTED');
}

test('fixture source has no VM lifecycle, process, input, file, or network capability', async () => {
  const [source, entitlements] = await Promise.all([
    readFile(virtualizationConfigurationProbeSource, 'utf8'),
    readFile(virtualizationConfigurationProbeEntitlements, 'utf8'),
  ]);
  const imports = [...source.matchAll(/^import ([A-Za-z0-9_]+)$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['Foundation', 'Virtualization']);
  assert.match(source, /VZVirtualMachineConfiguration\(\)/);
  assert.match(source, /framework_validation_invoked": false/);
  assert.doesNotMatch(source, /\bVZVirtualMachine\s*\(/);
  assert.doesNotMatch(source, /\.start\s*\(|\.stop\s*\(|validate\s*\(/);
  assert.doesNotMatch(source, /\bProcess\s*\(|posix_spawn|execve|system\s*\(/);
  assert.doesNotMatch(source, /standardInput|readToEnd|FileManager|Data\(contentsOf:|write\(to:/);
  assert.doesNotMatch(source, /URLSession|Network\.|CFNetwork|NWConnection|socket\s*\(/);
  assert.match(entitlements, /<key>com\.apple\.security\.virtualization<\/key>\s*<true\/>/);
  assert.equal((entitlements.match(/<key>/g) ?? []).length, 1);
});

test('arm64 macOS 15 probe reports one fixed device-empty structural profile', {
  timeout: 120_000,
}, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'dosai-virtualization-probe-test-'));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  const executable = join(directory, virtualizationConfigurationProbeName);
  await buildVirtualizationConfigurationProbe(executable);

  const executableStats = await stat(executable);
  assert.ok(executableStats.isFile());
  assert.notEqual(executableStats.mode & 0o111, 0);

  const description = await invokeVirtualizationConfigurationProbe(executable, 'describe');
  assert.equal(
    typeof description.result.virtualization_supported_in_current_process,
    'boolean',
  );
  assert.deepEqual(description, {
    ok: true,
    result: {
      helper_id: 'com.socialeap.dosai.virtualization-configuration-probe',
      minimum_macos_version: '15.0',
      mutation_performed: false,
      network_authority: false,
      operations: ['describe', 'inspect-fixed-profile'],
      process_launch_authority: false,
      protocol_version: 1,
      stdin_consumed: false,
      virtual_machine_created: false,
      virtual_machine_start_authority: false,
      virtualization_supported_in_current_process:
        description.result.virtualization_supported_in_current_process,
    },
    schema: 'DOSAI_VIRTUALIZATION_CONFIGURATION_PROBE_V1',
  });

  const profile = await invokeVirtualizationConfigurationProbe(executable, 'inspect-fixed-profile');
  assert.equal(profile.ok, true);
  assert.equal(profile.schema, 'DOSAI_VIRTUALIZATION_CONFIGURATION_PROBE_V1');
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(profile.result).filter(([key]) => key.endsWith('_count')),
    ),
    {
      audio_device_count: 0,
      cpu_count: 1,
      directory_share_count: 0,
      entropy_device_count: 0,
      graphics_device_count: 0,
      keyboard_count: 0,
      maximum_allowed_cpu_count: profile.result.maximum_allowed_cpu_count,
      memory_balloon_device_count: 0,
      minimum_allowed_cpu_count: profile.result.minimum_allowed_cpu_count,
      network_device_count: 0,
      pointing_device_count: 0,
      serial_port_count: 0,
      socket_device_count: 0,
      storage_device_count: 0,
    },
  );
  assert.equal(profile.result.memory_size, 512 * 1024 * 1024);
  assert.equal(profile.result.inspection_kind, 'STRUCTURAL_ONLY_NO_BOOT_ARTIFACTS');
  assert.equal(profile.result.boot_artifacts_supplied, false);
  assert.equal(profile.result.configuration_is_bootable, false);
  assert.equal(profile.result.framework_validation_invoked, false);
  assert.equal(profile.result.mutation_performed, false);
  assert.equal(profile.result.virtual_machine_created, false);
  assert.equal(profile.result.virtual_machine_started, false);
  assert.ok(profile.result.cpu_count >= profile.result.minimum_allowed_cpu_count);
  assert.ok(profile.result.cpu_count <= profile.result.maximum_allowed_cpu_count);
  assert.ok(profile.result.memory_size >= profile.result.minimum_allowed_memory_size);
  assert.ok(profile.result.memory_size <= profile.result.maximum_allowed_memory_size);

  const [
    { stdout: architectures },
    { stdout: loadCommands },
    { stdout: libraries },
    { stdout: symbols },
    entitlementDescription,
  ] =
    await Promise.all([
      execFileAsync('/usr/bin/lipo', ['-archs', executable], { encoding: 'utf8' }),
      execFileAsync('/usr/bin/otool', ['-l', executable], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }),
      execFileAsync('/usr/bin/otool', ['-L', executable], { encoding: 'utf8' }),
      execFileAsync('/usr/bin/nm', ['-u', '-j', executable], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      }),
      execFileAsync('/usr/bin/codesign', ['-d', '--entitlements', '-', executable], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024,
      }),
    ]);
  assert.equal(architectures.trim(), 'arm64');
  assert.match(loadCommands, /cmd LC_BUILD_VERSION[\s\S]*?platform 1[\s\S]*?minos 15\.0/);
  assert.match(libraries, /Virtualization\.framework/);
  assert.doesNotMatch(symbols, /\b_(?:connect|socket|getaddrinfo|posix_spawn|execve|system)\b/);
  const entitlementOutput = `${entitlementDescription.stdout}${entitlementDescription.stderr}`;
  assert.match(
    entitlementOutput,
    /\[Key\] com\.apple\.security\.virtualization[\s\S]*?\[Bool\] true/,
  );
  assert.equal(
    (entitlementOutput.match(/com\.apple\.security\.virtualization/g) ?? []).length,
    1,
  );

  for (const arguments_ of [[], ['unknown'], ['describe', 'extra'], ['inspect-fixed-profile', 'extra']]) {
    assert.deepEqual(await rejectedInvocation(executable, arguments_), {
      exitCode: 64,
      response: {
        error: { code: 'DOSAI_VIRTUALIZATION_PROBE_PROTOCOL_0001' },
        ok: false,
        schema: 'DOSAI_VIRTUALIZATION_CONFIGURATION_PROBE_V1',
      },
      stderr: '',
    });
  }
});
