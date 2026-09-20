import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { admitGuestCompositionManifest } from '../../src/contracts/p3/guest-composition.ts';
import { createSchemaValidator } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const validator = await createSchemaValidator(root, [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v2/guest-artifact-manifest.schema.json',
]);

function candidateManifest() {
  return {
    schema_id: 'urn:dosai:schema:guest-artifact-manifest:2',
    schema_version: 2,
    manifest_id: randomUUID(),
    artifact_set_version: '1',
    architecture: 'arm64',
    boot_protocol: 'LINUX_DIRECT_BOOT',
    release_status: 'COMPOSITION_DECLARED_UNVERIFIED',
    runtime_eligible: false,
    artifacts: [
      {
        role: 'KERNEL',
        package_path: 'guest-artifacts/v2/kernel.bin',
        sha256: '1'.repeat(64),
        size_bytes: 8_388_608,
        media_type: 'application/vnd.linux.kernel',
        read_only: true,
      },
      {
        role: 'INITRAMFS',
        package_path: 'guest-artifacts/v2/initramfs.img',
        sha256: '2'.repeat(64),
        size_bytes: 16_777_216,
        media_type: 'application/vnd.linux.initramfs',
        read_only: true,
      },
      {
        role: 'ROOT_FILESYSTEM',
        package_path: 'guest-artifacts/v2/rootfs.squashfs',
        sha256: '3'.repeat(64),
        size_bytes: 268_435_456,
        media_type: 'application/vnd.dosai.squashfs',
        read_only: true,
      },
      {
        role: 'GUEST_AGENT',
        package_path: 'guest-artifacts/v2/dosai-guest-agent',
        sha256: '4'.repeat(64),
        size_bytes: 2_097_152,
        media_type: 'application/vnd.dosai.guest-agent',
        read_only: true,
      },
    ],
    supply_chain: {
      build_recipe_sha256: '5'.repeat(64),
      source_manifest_sha256: '6'.repeat(64),
      sbom_sha256: '7'.repeat(64),
      sbom_format: 'SPDX_2_3_JSON',
      license_manifest_sha256: '8'.repeat(64),
      clean_room_rebuild: 'NOT_PROVEN',
      vulnerability_review: 'NOT_PERFORMED',
      signatures_verified: false,
    },
    composition: {
      verification_status: 'NOT_PERFORMED',
      kernel_command_line: {
        package_path: 'guest-artifacts/v2/kernel-command-line.txt',
        sha256: '9'.repeat(64),
        size_bytes: 128,
        media_type: 'text/plain; charset=us-ascii',
      },
      kernel_config: {
        package_path: 'guest-artifacts/v2/kernel.config',
        sha256: 'a'.repeat(64),
        size_bytes: 65_536,
        media_type: 'text/plain; charset=us-ascii',
        loadable_modules: false,
        module_loading: false,
        debug_interfaces: false,
        network_stack: false,
        interactive_console: false,
      },
      filesystem_inventories: [
        {
          filesystem_role: 'INITRAMFS',
          package_path: 'guest-artifacts/v2/initramfs.inventory.json',
          sha256: 'b'.repeat(64),
          size_bytes: 8_192,
          media_type: 'application/vnd.dosai.fs-inventory+json',
          format: 'DOSAI_FS_INVENTORY_V1',
          entry_count: 12,
        },
        {
          filesystem_role: 'ROOT_FILESYSTEM',
          package_path: 'guest-artifacts/v2/rootfs.inventory.json',
          sha256: 'c'.repeat(64),
          size_bytes: 32_768,
          media_type: 'application/vnd.dosai.fs-inventory+json',
          format: 'DOSAI_FS_INVENTORY_V1',
          entry_count: 48,
        },
      ],
      boot_chain: {
        initramfs_entry_path: '/init',
        immutable_root_device: '/dev/vda',
        immutable_root_filesystem: 'squashfs',
        immutable_root_read_only: true,
        guest_agent_path: '/sbin/dosai-guest-agent',
        alternate_init_allowed: false,
        rescue_shell_allowed: false,
        login_allowed: false,
      },
      embedded_guest_agent: {
        filesystem_role: 'ROOT_FILESYSTEM',
        path: '/sbin/dosai-guest-agent',
        sha256: '4'.repeat(64),
      },
      verification: {
        kernel_command_line_reviewed: false,
        kernel_config_reviewed: false,
        inventories_verified: false,
        embedded_agent_digest_matched: false,
        boot_chain_verified: false,
      },
    },
  };
}

test('accepted schema registry v13 changes only the guest manifest over hash-locked v12', async () => {
  const v12Bytes = await readFile(resolve(root, 'docs/architecture/schema-registry-v12.json'));
  const v12 = JSON.parse(v12Bytes);
  const v13 = JSON.parse(
    await readFile(resolve(root, 'docs/architecture/schema-registry-v13.json'), 'utf8'),
  );
  assert.equal(
    createHash('sha256').update(v12Bytes).digest('hex'),
    '2638a165277fe93a8cdd02aa0d321cb93301708907e2f28fb15733410752ea42',
  );
  assert.equal(v13.status, 'ACCEPTED');
  assert.equal(v13.registry_version, 13);
  assert.equal(v13.supersedes, v12.registry_id);
  assert.deepEqual(
    v13.schemas.filter(({ name }) => name !== 'guest-artifact-manifest'),
    v12.schemas.filter(({ name }) => name !== 'guest-artifact-manifest'),
  );
  assert.deepEqual(
    v13.schemas.find(({ name }) => name === 'guest-artifact-manifest'),
    {
      name: 'guest-artifact-manifest',
      schema_id: 'urn:dosai:schema:guest-artifact-manifest:2',
      version: 2,
      owner_phase: 'P3',
      state: 'DEFINED',
      path: 'schemas/v2/guest-artifact-manifest.schema.json',
    },
  );
});

test('composition candidate is exact, detached, immutable, and non-runnable', () => {
  const candidate = candidateManifest();
  assert.equal(validator.getSchema('urn:dosai:schema:guest-artifact-manifest:2')(candidate), true);
  const admitted = admitGuestCompositionManifest(candidate);
  assert.deepEqual(structuredClone(admitted), candidate);
  assert.notEqual(admitted, candidate);
  assert.equal(admitted.runtime_eligible, false);
  assert.equal(admitted.composition.verification_status, 'NOT_PERFORMED');
  assert.equal(
    admitted.composition.embedded_guest_agent.sha256,
    admitted.artifacts[3].sha256,
  );
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.composition));
  assert.ok(Object.isFrozen(admitted.composition.filesystem_inventories));
  assert.ok(Object.isFrozen(admitted.composition.verification));
});

test('schema rejects eligibility, verification, boot, kernel, and hidden authority expansion', () => {
  const invalid = [
    { ...candidateManifest(), runtime_eligible: true },
    { ...candidateManifest(), release_status: 'ACCEPTED' },
    {
      ...candidateManifest(),
      composition: {
        ...candidateManifest().composition,
        verification: {
          ...candidateManifest().composition.verification,
          embedded_agent_digest_matched: true,
        },
      },
    },
    {
      ...candidateManifest(),
      composition: {
        ...candidateManifest().composition,
        kernel_config: { ...candidateManifest().composition.kernel_config, network_stack: true },
      },
    },
    {
      ...candidateManifest(),
      composition: {
        ...candidateManifest().composition,
        kernel_command_line: {
          ...candidateManifest().composition.kernel_command_line,
          size_bytes: 4_097,
        },
      },
    },
    {
      ...candidateManifest(),
      composition: {
        ...candidateManifest().composition,
        filesystem_inventories: candidateManifest().composition.filesystem_inventories.map(
          (inventory, index) => index === 0
            ? { ...inventory, media_type: 'application/json' }
            : inventory,
        ),
      },
    },
    {
      ...candidateManifest(),
      composition: {
        ...candidateManifest().composition,
        boot_chain: { ...candidateManifest().composition.boot_chain, rescue_shell_allowed: true },
      },
    },
    { ...candidateManifest(), host_path: '/Users/example/repository' },
  ];
  for (const candidate of invalid) {
    assert.equal(validator.getSchema('urn:dosai:schema:guest-artifact-manifest:2')(candidate), false);
    assert.throws(() => admitGuestCompositionManifest(candidate));
  }
});

test('runtime admission enforces cross-artifact composition relations', () => {
  const reorderedArtifacts = candidateManifest();
  [reorderedArtifacts.artifacts[0], reorderedArtifacts.artifacts[1]] = [
    reorderedArtifacts.artifacts[1], reorderedArtifacts.artifacts[0],
  ];
  const reorderedInventories = candidateManifest();
  [
    reorderedInventories.composition.filesystem_inventories[0],
    reorderedInventories.composition.filesystem_inventories[1],
  ] = [
    reorderedInventories.composition.filesystem_inventories[1],
    reorderedInventories.composition.filesystem_inventories[0],
  ];
  const mismatchedAgent = candidateManifest();
  mismatchedAgent.composition.embedded_guest_agent.sha256 = 'd'.repeat(64);
  const duplicatePath = candidateManifest();
  duplicatePath.composition.kernel_command_line.package_path =
    duplicatePath.artifacts[0].package_path;

  for (const candidate of [
    reorderedArtifacts,
    reorderedInventories,
    mismatchedAgent,
    duplicatePath,
  ]) {
    assert.equal(validator.getSchema('urn:dosai:schema:guest-artifact-manifest:2')(candidate), true);
    assert.throws(
      () => admitGuestCompositionManifest(candidate),
      /DOSAI_GUEST_COMPOSITION_RELATION_0001/,
    );
  }
});

test('composition admission rejects accessors without invocation and exposes no effects', async () => {
  let invoked = false;
  const accessor = candidateManifest();
  Object.defineProperty(accessor.composition.embedded_guest_agent, 'sha256', {
    enumerable: true,
    get() {
      invoked = true;
      return '4'.repeat(64);
    },
  });
  assert.throws(() => admitGuestCompositionManifest(accessor));
  assert.equal(invoked, false);

  const hidden = candidateManifest();
  Object.defineProperty(hidden.composition.kernel_config, 'network_device', {
    enumerable: false,
    value: true,
  });
  assert.throws(() => admitGuestCompositionManifest(hidden));

  const source = await readFile(resolve(root, 'src/contracts/p3/guest-composition.ts'), 'utf8');
  assert.doesNotMatch(source, /^import /m);
  assert.doesNotMatch(
    source,
    /VZVirtualMachine|child_process|node:|electron|\bspawn\s*\(|\bexec\s*\(|URLSession|\bfetch\s*\(/,
  );
});
