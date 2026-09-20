import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  admitGuestArtifactManifest,
  admitStructuralMicroVMProfile,
} from '../../src/contracts/p3/isolation.ts';
import { createSchemaValidator } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const validator = await createSchemaValidator(root, [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v1/guest-artifact-manifest.schema.json',
  'docs/architecture/schemas/v1/microvm-profile.schema.json',
]);

function artifactManifest() {
  return {
    schema_id: 'urn:dosai:schema:guest-artifact-manifest:1',
    schema_version: 1,
    manifest_id: randomUUID(),
    artifact_set_version: '1',
    architecture: 'arm64',
    boot_protocol: 'LINUX_DIRECT_BOOT',
    release_status: 'CANDIDATE_UNVERIFIED',
    runtime_eligible: false,
    artifacts: [
      {
        role: 'KERNEL',
        package_path: 'guest-artifacts/v1/kernel.bin',
        sha256: '1'.repeat(64),
        size_bytes: 8_388_608,
        media_type: 'application/vnd.linux.kernel',
        read_only: true,
      },
      {
        role: 'INITRAMFS',
        package_path: 'guest-artifacts/v1/initramfs.img',
        sha256: '2'.repeat(64),
        size_bytes: 16_777_216,
        media_type: 'application/vnd.linux.initramfs',
        read_only: true,
      },
      {
        role: 'ROOT_FILESYSTEM',
        package_path: 'guest-artifacts/v1/rootfs.squashfs',
        sha256: '3'.repeat(64),
        size_bytes: 268_435_456,
        media_type: 'application/vnd.dosai.squashfs',
        read_only: true,
      },
      {
        role: 'GUEST_AGENT',
        package_path: 'guest-artifacts/v1/dosai-guest-agent',
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
  };
}

function microVMProfile() {
  return {
    schema_id: 'urn:dosai:schema:microvm-profile:1',
    schema_version: 1,
    profile_id: randomUUID(),
    capsule_id: randomUUID(),
    generation: '1',
    guest_manifest_sha256: '9'.repeat(64),
    validation_level: 'STRUCTURAL_ONLY_NO_BOOT_ARTIFACTS',
    runtime_eligible: false,
    cpu_count: 1,
    memory_size_bytes: 536_870_912,
    immutable_root_filesystem: true,
    writable_disk_size_bytes: 1_073_741_824,
    writable_state_reuse: false,
    network_devices: [],
    shares: [{
      purpose: 'LEASED_WORKTREE',
      lease_id: randomUUID(),
      source_reference_kind: 'OPAQUE_LEASE_ID',
      guest_path: '/workspace',
      access: 'READ_WRITE',
    }],
    guest_identity: {
      uid: 1000,
      gid: 1000,
      working_directory: '/workspace',
      interactive_shell: false,
      login_enabled: false,
      environment: {},
    },
    integrations: {
      audio: false,
      clipboard: false,
      graphics: false,
      keyboard: false,
      pointing: false,
      usb: false,
    },
    lifecycle: {
      fresh_vm: true,
      destructive_stop_required: true,
      cleanup_verification_required: true,
    },
  };
}

test('accepted schema registry v12 is additive over hash-locked v11', async () => {
  const v11Bytes = await readFile(resolve(root, 'docs/architecture/schema-registry-v11.json'));
  const v11 = JSON.parse(v11Bytes);
  const v12 = JSON.parse(
    await readFile(resolve(root, 'docs/architecture/schema-registry-v12.json'), 'utf8'),
  );
  assert.equal(
    createHash('sha256').update(v11Bytes).digest('hex'),
    'd37498eefb78604c52b288449c1bf3938cb8d8054982f332f025aa386f557b79',
  );
  assert.equal(v12.status, 'ACCEPTED');
  assert.equal(v12.registry_version, 12);
  assert.equal(v12.supersedes, v11.registry_id);
  assert.deepEqual(
    v12.schemas.filter(({ name }) => !['guest-artifact-manifest', 'microvm-profile'].includes(name)),
    v11.schemas,
  );
  assert.deepEqual(
    v12.schemas.filter(({ name }) => ['guest-artifact-manifest', 'microvm-profile'].includes(name)),
    [
    {
      name: 'guest-artifact-manifest',
      schema_id: 'urn:dosai:schema:guest-artifact-manifest:1',
      version: 1,
      owner_phase: 'P3',
      state: 'DEFINED',
      path: 'schemas/v1/guest-artifact-manifest.schema.json',
    },
    {
      name: 'microvm-profile',
      schema_id: 'urn:dosai:schema:microvm-profile:1',
      version: 1,
      owner_phase: 'P3',
      state: 'DEFINED',
      path: 'schemas/v1/microvm-profile.schema.json',
    },
    ],
  );
});

test('guest manifest is exact, detached, immutable, and explicitly non-runnable', () => {
  const candidate = artifactManifest();
  assert.equal(
    validator.getSchema('urn:dosai:schema:guest-artifact-manifest:1')(candidate),
    true,
  );
  const admitted = admitGuestArtifactManifest(candidate);
  assert.deepEqual(structuredClone(admitted), candidate);
  assert.notEqual(admitted, candidate);
  assert.equal(admitted.runtime_eligible, false);
  assert.equal(admitted.release_status, 'CANDIDATE_UNVERIFIED');
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.artifacts));
  assert.ok(admitted.artifacts.every(Object.isFrozen));
  assert.ok(Object.isFrozen(admitted.supply_chain));
});

test('guest manifest rejects path, role, media, duplication, and assurance spoofing', () => {
  const invalidSchema = [
    { ...artifactManifest(), runtime_eligible: true },
    { ...artifactManifest(), release_status: 'ACCEPTED' },
    {
      ...artifactManifest(),
      artifacts: artifactManifest().artifacts.map((item, index) =>
        index === 0 ? { ...item, package_path: 'guest-artifacts/v1/../kernel' } : item),
    },
    {
      ...artifactManifest(),
      supply_chain: { ...artifactManifest().supply_chain, signatures_verified: true },
    },
    { ...artifactManifest(), network: [] },
  ];
  for (const candidate of invalidSchema) {
    assert.equal(
      validator.getSchema('urn:dosai:schema:guest-artifact-manifest:1')(candidate),
      false,
    );
    assert.throws(() => admitGuestArtifactManifest(candidate));
  }

  const reordered = artifactManifest();
  [reordered.artifacts[0], reordered.artifacts[1]] = [
    reordered.artifacts[1],
    reordered.artifacts[0],
  ];
  const wrongMedia = artifactManifest();
  wrongMedia.artifacts[0].media_type = wrongMedia.artifacts[1].media_type;
  const duplicatePath = artifactManifest();
  duplicatePath.artifacts[1].package_path = duplicatePath.artifacts[0].package_path;
  for (const candidate of [reordered, wrongMedia, duplicatePath]) {
    assert.equal(
      validator.getSchema('urn:dosai:schema:guest-artifact-manifest:1')(candidate),
      true,
    );
    assert.throws(
      () => admitGuestArtifactManifest(candidate),
      /DOSAI_GUEST_ARTIFACT_RELATION_0001/,
    );
  }
});

test('microVM profile fixes resources, opaque sharing, device absence, and teardown duties', () => {
  const candidate = microVMProfile();
  assert.equal(validator.getSchema('urn:dosai:schema:microvm-profile:1')(candidate), true);
  const admitted = admitStructuralMicroVMProfile(candidate);
  assert.deepEqual(structuredClone(admitted), candidate);
  assert.notEqual(admitted, candidate);
  assert.equal(admitted.runtime_eligible, false);
  assert.equal(admitted.validation_level, 'STRUCTURAL_ONLY_NO_BOOT_ARTIFACTS');
  assert.deepEqual(admitted.network_devices, []);
  assert.equal('host_path' in admitted.shares[0], false);
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.shares));
  assert.ok(Object.isFrozen(admitted.shares[0]));
  assert.ok(Object.isFrozen(admitted.guest_identity.environment));
});

test('microVM profile rejects resource, mount, integration, persistence, and lifecycle expansion', () => {
  const invalid = [
    { ...microVMProfile(), runtime_eligible: true },
    { ...microVMProfile(), cpu_count: 2 },
    { ...microVMProfile(), memory_size_bytes: 1_073_741_824 },
    { ...microVMProfile(), network_devices: [{}] },
    { ...microVMProfile(), writable_state_reuse: true },
    {
      ...microVMProfile(),
      shares: [{ ...microVMProfile().shares[0], host_path: '/Users/example/repository' }],
    },
    {
      ...microVMProfile(),
      guest_identity: { ...microVMProfile().guest_identity, environment: { PATH: '/bin' } },
    },
    {
      ...microVMProfile(),
      integrations: { ...microVMProfile().integrations, graphics: true },
    },
    {
      ...microVMProfile(),
      lifecycle: { ...microVMProfile().lifecycle, cleanup_verification_required: false },
    },
  ];
  for (const candidate of invalid) {
    assert.equal(validator.getSchema('urn:dosai:schema:microvm-profile:1')(candidate), false);
    assert.throws(() => admitStructuralMicroVMProfile(candidate));
  }
});

test('isolation admission rejects accessors without invoking them and holds no runtime authority', async () => {
  let invoked = false;
  const candidate = microVMProfile();
  Object.defineProperty(candidate, 'cpu_count', {
    enumerable: true,
    get() {
      invoked = true;
      return 1;
    },
  });
  assert.throws(() => admitStructuralMicroVMProfile(candidate));
  assert.equal(invoked, false);

  const manifest = artifactManifest();
  Object.defineProperty(manifest.artifacts, '0', {
    enumerable: true,
    get() {
      invoked = true;
      return artifactManifest().artifacts[0];
    },
  });
  assert.throws(() => admitGuestArtifactManifest(manifest));
  assert.equal(invoked, false);

  const hidden = microVMProfile();
  Object.defineProperty(hidden.shares[0], 'host_path', {
    enumerable: false,
    value: '/Users/example/repository',
  });
  assert.throws(() => admitStructuralMicroVMProfile(hidden));

  const source = await readFile(resolve(root, 'src/contracts/p3/isolation.ts'), 'utf8');
  assert.doesNotMatch(source, /^import /m);
  assert.doesNotMatch(
    source,
    /VZVirtualMachine|child_process|node:|electron|\bspawn\s*\(|\bexec\s*\(|URLSession|\bfetch\s*\(/,
  );
});
