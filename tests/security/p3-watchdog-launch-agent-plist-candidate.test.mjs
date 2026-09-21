import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import plist from 'plist';

const root = resolve(import.meta.dirname, '../..');
const { loadLifecycleCompositionSuccessor } = await import(
  '../architecture/p3-lifecycle-composition-successor.mjs'
);
const lifecycleSuccessor = await loadLifecycleCompositionSuccessor(root);
const candidatePath = resolve(
  root,
  'native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist',
);
const candidateSource = await readFile(candidatePath, 'utf8');
const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');
const testSource = await readFile(import.meta.filename, 'utf8');
const v25 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v25.json'), 'utf8'),
);
const service = v25.native_helpers.find(({ id }) => id === 'execution-service');
const v28 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v28.json'), 'utf8'),
);
const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v36Addon = v36.native_helpers.find(({ id }) => id === 'service-management-status-addon');
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);
const v37Addon = v37.native_helpers.find(({ id }) => id === 'service-management-status-addon');

const label = 'com.socialeap.dosai.execution-service-fixture';
const bundleProgram =
  'Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture';
const machService = 'com.socialeap.dosai.execution-service-fixture.watchdog';
const expectedValue = {
  Label: label,
  BundleProgram: bundleProgram,
  MachServices: {
    [machService]: true,
  },
};
const expectedXMLKeys = ['Label', 'BundleProgram', 'MachServices', machService];

const admitLaunchAgentPlist = (source) => {
  assert.equal(typeof source, 'string');
  assert.ok(Buffer.byteLength(source, 'utf8') <= 4_096);
  assert.equal(source.startsWith('\uFEFF'), false);
  assert.doesNotMatch(source, /<!ENTITY/i);

  const parsed = plist.parse(source);
  assert.ok(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
  assert.deepEqual(Object.keys(parsed).sort(), ['BundleProgram', 'Label', 'MachServices']);
  assert.equal(parsed.Label, label);
  assert.equal(parsed.BundleProgram, bundleProgram);
  assert.ok(
    parsed.MachServices !== null
      && typeof parsed.MachServices === 'object'
      && !Array.isArray(parsed.MachServices),
  );
  assert.deepEqual(Object.keys(parsed.MachServices), [machService]);
  assert.equal(parsed.MachServices[machService], true);

  const sourceKeys = [...source.matchAll(/<key>([^<]+)<\/key>/g)]
    .map((match) => match[1]);
  assert.deepEqual(sourceKeys, expectedXMLKeys);
  return parsed;
};

const buildCandidate = (overrides = {}) => plist.build({
  ...expectedValue,
  ...overrides,
});

test('source plist is a regular file with the exact three-key declaration', async () => {
  const metadata = await lstat(candidatePath);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.isSymbolicLink(), false);
  assert.deepEqual(admitLaunchAgentPlist(candidateSource), expectedValue);
  assert.deepEqual(admitLaunchAgentPlist(plist.build(expectedValue)), expectedValue);
});

test('admission rejects identity, program path, and Mach service substitution', () => {
  const hostileCandidates = [
    buildCandidate({ Label: `${label}.other` }),
    buildCandidate({ BundleProgram: `/Applications/${label}` }),
    buildCandidate({ BundleProgram: `../${label}` }),
    buildCandidate({ BundleProgram: `${bundleProgram}.other` }),
    buildCandidate({ MachServices: {} }),
    buildCandidate({ MachServices: { [`${machService}.other`]: true } }),
    buildCandidate({ MachServices: { [machService]: false } }),
    buildCandidate({ MachServices: { [machService]: 'true' } }),
    buildCandidate({ MachServices: { [machService]: true, [`${machService}.other`]: true } }),
  ];
  for (const source of hostileCandidates) {
    assert.throws(() => admitLaunchAgentPlist(source), assert.AssertionError);
  }
});

test('admission rejects every adjacent launchd authority key', () => {
  const adjacentAuthority = {
    Program: bundleProgram,
    ProgramArguments: [bundleProgram, '--unsafe'],
    EnvironmentVariables: { DOSAI_UNSAFE: '1' },
    RunAtLoad: true,
    KeepAlive: true,
    Disabled: false,
    UserName: 'root',
    GroupName: 'wheel',
    Sockets: { Listener: { SockType: 'stream' } },
    WatchPaths: ['/tmp'],
    QueueDirectories: ['/tmp'],
    StartCalendarInterval: { Minute: 0 },
    NetworkState: true,
    StandardOutPath: '/tmp/dosai.out',
    StandardErrorPath: '/tmp/dosai.err',
    ProcessType: 'Interactive',
    LimitLoadToSessionType: 'Aqua',
  };
  for (const [key, value] of Object.entries(adjacentAuthority)) {
    assert.throws(
      () => admitLaunchAgentPlist(buildCandidate({ [key]: value })),
      assert.AssertionError,
      key,
    );
  }
});

test('admission rejects duplicate keys, non-dictionary data, BOM, and oversized input', () => {
  const duplicateLabel = candidateSource.replace(
    '\t<key>Label</key>',
    `\t<key>Label</key>\n\t<string>${label}</string>\n\t<key>Label</key>`,
  );
  for (const source of [
    duplicateLabel,
    plist.build([]),
    `\uFEFF${candidateSource}`,
    `${candidateSource}${' '.repeat(4_096)}`,
  ]) {
    assert.throws(() => admitLaunchAgentPlist(source));
  }
});

test('source declaration is composed only by the exact v28 mode and remains effect-free', () => {
  assert.equal(v25.status, 'ACCEPTED');
  assert.equal(
    createHash('sha256')
      .update(packageSource)
      .digest('hex'),
    lifecycleSuccessor.expected(
      'scripts/package.mjs',
      v37Addon.physical_proof_implemented_files
        .find(({ path }) => path === 'scripts/package.mjs').sha256,
    ),
  );
  assert.doesNotMatch(
    packageSource,
    /SMAppService|agent\(plistName|registerAndReturnError|unregisterAndReturnError|launchctl/,
  );
  assert.match(packageSource, /--static-named-service-launch-agent-fixture/);
  assert.match(
    packageSource,
    /copyFile\(staticNamedServiceLaunchAgentSource, packagedNamedServiceLaunchAgent\)/,
  );
  const importedModules = testSource
    .split('\n')
    .filter((line) => line.startsWith('import '))
    .map((line) => line.match(/from '([^']+)'/)?.[1]);
  assert.deepEqual(importedModules, [
    'node:assert/strict',
    'node:crypto',
    'node:fs/promises',
    'node:path',
    'node:test',
    'plist',
  ]);
  for (const field of [
    'launch_agent_plist_active_declaration_authority',
    'launch_agent_plist_package_change_authority',
    'launch_agent_plist_service_management_authority',
    'launch_agent_plist_launchctl_authority',
    'launch_agent_plist_packaged_observed',
    'launch_agent_plist_signed_observed',
    'launch_agent_plist_registration_observed',
    'launch_agent_plist_launch_observed',
    'launch_agent_plist_application_connection_observed',
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
  for (const field of [
    'launch_agent_static_package_source_observed',
    'launch_agent_static_package_build_observed',
    'launch_agent_static_package_plist_copy_observed',
    'launch_agent_static_package_plist_hash_match_observed',
    'launch_agent_static_package_nested_signature_observed',
    'launch_agent_static_package_outer_signature_observed',
    'launch_agent_static_package_designated_requirements_observed',
    'launch_agent_static_package_layout_observed',
  ]) {
    assert.equal(v28Service[field], true, field);
  }
  assert.equal(v28Service.launch_agent_static_package_registration_observed, false);
  assert.equal(v28Service.launch_agent_static_package_launch_observed, false);
});
