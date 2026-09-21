import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { verifyBuildrootToolchainConfig } from '../../scripts/verify-buildroot-toolchain-config.mjs';

const root = resolve(import.meta.dirname, '../..');
const defconfigPath = resolve(
  root,
  'guest-build/buildroot-external/configs/dosai_toolchain_proof_defconfig',
);

function resolvedConfig(overrides = new Map()) {
  const entries = new Map([
    ['BR2_ARCH', '"aarch64"'],
    ['BR2_DOSAI_CONFIG_PROOF_ONLY', 'y'],
    ['BR2_NORMALIZED_ARCH', '"arm64"'],
    ['BR2_PACKAGE_HOST_GO', 'y'],
    ['BR2_PACKAGE_HOST_GO_BIN', 'n'],
    ['BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE1_ARCH_SUPPORTS', 'y'],
    ['BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE2_ARCH_SUPPORTS', 'y'],
    ['BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE3_ARCH_SUPPORTS', 'y'],
    ['BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE4_ARCH_SUPPORTS', 'y'],
    ['BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE5_ARCH_SUPPORTS', 'y'],
    ['BR2_PACKAGE_HOST_GO_SRC', 'y'],
    ['BR2_PACKAGE_PROVIDES_HOST_GO', '"host-go-src"'],
    ['BR2_STATIC_LIBS', 'y'],
    ['BR2_TOOLCHAIN_BUILDROOT_MUSL', 'y'],
    ['BR2_TOOLCHAIN_USES_MUSL', 'y'],
    ['BR2_aarch64', 'y'],
  ]);
  for (const [key, value] of overrides) {
    if (value === undefined) entries.delete(key);
    else entries.set(key, value);
  }
  const lines = [
    '#',
    '# Automatically generated file; DO NOT EDIT.',
    '# Buildroot 2025.02.16 Configuration',
    '#',
    ...[...entries].map(([key, value]) =>
      value === 'n' ? `# ${key} is not set` : `${key}=${value}`),
  ];
  return `${lines.join('\n')}\n`;
}

const context = async (resolved = resolvedConfig()) => ({
  requestedConfig: await readFile(defconfigPath, 'utf8'),
  resolvedConfig: resolved,
  evaluationHostOs: 'darwin',
  kconfigHostArchitecture: 'x86_64',
});

test('accepted v14 and the configuration-proof external tree are exact', async () => {
  const v14Bytes = await readFile(resolve(root, 'docs/architecture/schema-registry-v14.json'));
  assert.equal(
    createHash('sha256').update(v14Bytes).digest('hex'),
    '367d6c5dfe4114205fb096dfa9cb1978f8182aa4c7165dc06187751f30714088',
  );
  assert.equal(JSON.parse(v14Bytes).status, 'ACCEPTED');
  assert.equal(
    await readFile(resolve(root, 'guest-build/buildroot-external/external.desc'), 'utf8'),
    'name: DOSAI\ndesc: DOSAI governed Buildroot configuration proof\n',
  );
  assert.equal(
    await readFile(resolve(root, 'guest-build/buildroot-external/Config.in'), 'utf8'),
    'config BR2_DOSAI_CONFIG_PROOF_ONLY\n\tbool\n\tdefault y\n\thelp\n\t  Marks the DOSAI toolchain provider fixture as configuration-only.\n\t  Build and source-fetch goals are rejected by external.mk.\n',
  );
  const makeGuard = await readFile(
    resolve(root, 'guest-build/buildroot-external/external.mk'),
    'utf8',
  );
  assert.equal(
    makeGuard,
    'ifeq ($(strip $(MAKECMDGOALS)),)\n$(error DOSAI toolchain configuration proof cannot build or fetch sources)\nendif\nifneq ($(filter-out %config list-defconfigs check-package,$(MAKECMDGOALS)),)\n$(error DOSAI toolchain configuration proof cannot build or fetch sources)\nendif\n',
  );
});

test('source-provider resolution is immutable and explicitly non-authorizing', async () => {
  const result = verifyBuildrootToolchainConfig(await context());
  assert.equal(result.status, 'SIMULATED_KCONFIG_RESOLUTION');
  assert.equal(result.semantic_projection.BR2_PACKAGE_HOST_GO_SRC, 'y');
  assert.equal(result.semantic_projection.BR2_PACKAGE_HOST_GO_BIN, 'n');
  assert.equal(result.semantic_projection.BR2_PACKAGE_PROVIDES_HOST_GO, '"host-go-src"');
  assert.equal(result.physical_linux_builder_verified, false);
  assert.equal(result.source_downloaded, false);
  assert.equal(result.compiler_built, false);
  assert.equal(result.artifact_created, false);
  assert.equal(result.build_allowed, false);
  assert.equal(result.runtime_eligible, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.semantic_projection));
});

test('requested defconfig rejects additions, omissions, and binary-provider selection', async () => {
  const valid = await context();
  for (const requestedConfig of [
    valid.requestedConfig.replace('BR2_PACKAGE_HOST_GO_SRC=y\n', ''),
    valid.requestedConfig.replace('BR2_DOSAI_CONFIG_PROOF_ONLY=y\n', ''),
    `${valid.requestedConfig}BR2_PACKAGE_BUSYBOX=y\n`,
    valid.requestedConfig.replace(
      '# BR2_PACKAGE_HOST_GO_BIN is not set',
      'BR2_PACKAGE_HOST_GO_BIN=y',
    ),
    valid.requestedConfig.replaceAll('\n', '\r\n'),
  ]) {
    assert.throws(
      () => verifyBuildrootToolchainConfig({ ...valid, requestedConfig }),
      TypeError,
    );
  }
});

test('resolved configuration rejects provider, target, libc, linking, and bootstrap drift', async () => {
  const cases = [
    new Map([['BR2_PACKAGE_HOST_GO_SRC', 'n']]),
    new Map([['BR2_PACKAGE_HOST_GO_BIN', 'y']]),
    new Map([['BR2_PACKAGE_PROVIDES_HOST_GO', '"host-go-bin"']]),
    new Map([['BR2_ARCH', '"x86_64"']]),
    new Map([['BR2_TOOLCHAIN_BUILDROOT_MUSL', 'n']]),
    new Map([['BR2_STATIC_LIBS', 'n']]),
    new Map([['BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE3_ARCH_SUPPORTS', undefined]]),
  ];
  for (const overrides of cases) {
    const candidate = await context(resolvedConfig(overrides));
    assert.throws(
      () => verifyBuildrootToolchainConfig(candidate),
      TypeError,
    );
  }
});

test('resolved configuration rejects duplicates and false environment claims', async () => {
  const valid = await context();
  assert.throws(
    () => verifyBuildrootToolchainConfig({
      ...valid,
      resolvedConfig: `${valid.resolvedConfig}BR2_PACKAGE_HOST_GO_SRC=y\n`,
    }),
    /DOSAI_BUILDROOT_CONFIG_DUPLICATE_0001/,
  );
  for (const mutation of [
    { evaluationHostOs: 'linux' },
    { kconfigHostArchitecture: 'aarch64' },
  ]) {
    assert.throws(
      () => verifyBuildrootToolchainConfig({ ...valid, ...mutation }),
      TypeError,
    );
  }
});

test('configuration verifier cannot download, compile, spawn, or write', async () => {
  const source = await readFile(
    resolve(root, 'scripts/verify-buildroot-toolchain-config.mjs'),
    'utf8',
  );
  for (const forbidden of [
    'node:child_process',
    'node:http',
    'node:https',
    'node:net',
    'fetch(',
    'spawn(',
    'writeFile(',
    'appendFile(',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
