import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { admitLinuxBuilderManifest } from '../../src/contracts/p3/builder-input.ts';
import { createSchemaValidator } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const validator = await createSchemaValidator(root, [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v1/linux-builder-manifest.schema.json',
]);
const schema = validator.getSchema('urn:dosai:schema:linux-builder-manifest:1');

function candidateManifest() {
  const baseIndexDigest = `sha256:${'1'.repeat(64)}`;
  return {
    schema_id: 'urn:dosai:schema:linux-builder-manifest:1',
    schema_version: 1,
    manifest_id: randomUUID(),
    builder_set_version: '1',
    scope: 'GUEST_BUILD_PREPARATION',
    status: 'DECLARED_UNVERIFIED',
    image_preparation_allowed: false,
    guest_build_allowed: false,
    release_evidence_eligible: false,
    platform: {
      os: 'linux',
      architecture: 'amd64',
      native_execution_required: true,
      emulation_allowed: false,
    },
    base_image: {
      distribution: 'debian',
      release: 'trixie',
      major_version: 13,
      registry: 'docker.io',
      repository: 'library/debian',
      index_digest: baseIndexDigest,
      amd64_manifest_digest: `sha256:${'2'.repeat(64)}`,
      config_digest: `sha256:${'3'.repeat(64)}`,
      pinned_reference: `docker.io/library/debian@${baseIndexDigest}`,
      tag_reference_allowed: false,
    },
    package_snapshot: {
      service: 'snapshot.debian.org',
      timestamp: '20260802T000000Z',
      release_file_sha256: '4'.repeat(64),
      sources_list_sha256: '5'.repeat(64),
      packages: [
        { name: 'bash', version: '5.2.37-2+b5', architecture: 'amd64', deb_sha256: '6'.repeat(64) },
        { name: 'build-essential', version: '12.12', architecture: 'amd64', deb_sha256: '7'.repeat(64) },
        { name: 'ca-certificates', version: '20250419', architecture: 'amd64', deb_sha256: '8'.repeat(64) },
      ],
      output_package_manager_network_configured: false,
    },
    recipe: {
      dockerfile_path: 'guest-build/builder/Dockerfile',
      dockerfile_sha256: '9'.repeat(64),
      build_policy_path: 'guest-build/builder/build-policy.json',
      build_policy_sha256: 'a'.repeat(64),
      build_context_inventory_sha256: 'b'.repeat(64),
      source_manifest_schema_id: 'urn:dosai:schema:guest-source-manifest:1',
      source_manifest_sha256: 'c'.repeat(64),
    },
    output: {
      oci_archive_path: 'builder-artifacts/v1/dosai-linux-builder-amd64.oci.tar',
      oci_archive_sha256: 'd'.repeat(64),
      oci_manifest_digest: `sha256:${'e'.repeat(64)}`,
      sbom_sha256: 'f'.repeat(64),
      sbom_format: 'SPDX_2_3_JSON',
      provenance_sha256: '0'.repeat(64),
      signatures_verified: false,
      vulnerability_review: 'NOT_PERFORMED',
    },
    execution_policy: {
      pull_policy: 'NEVER',
      network_mode: 'NONE',
      loopback_only: true,
      read_only_root: true,
      all_capabilities_dropped: true,
      no_new_privileges: true,
      host_namespaces: false,
      devices: [],
      docker_socket: false,
      run_as_uid: 1000,
      run_as_gid: 1000,
      input_mount: 'READ_ONLY_RECURSIVE',
      work_mount: 'FRESH_EMPTY',
      output_mount: 'FRESH_EMPTY',
      shared_cache: false,
      secrets: false,
      cleanup_required: true,
      minimum_independent_runs: 2,
      distinct_native_hosts: true,
      exact_output_comparison_required: true,
      policy_verified: false,
    },
    verification: {
      base_image_verified: false,
      snapshot_verified: false,
      packages_verified: false,
      recipe_verified: false,
      oci_archive_verified: false,
      sbom_verified: false,
      provenance_verified: false,
      native_runs_verified: false,
      independence_verified: false,
      outputs_reproducible: false,
      complete: false,
    },
  };
}

test('accepted schema registry v15 adds only the builder manifest to hash-locked v14', async () => {
  const v14Bytes = await readFile(resolve(root, 'docs/architecture/schema-registry-v14.json'));
  const v14 = JSON.parse(v14Bytes);
  const v15 = JSON.parse(
    await readFile(resolve(root, 'docs/architecture/schema-registry-v15.json'), 'utf8'),
  );
  assert.equal(
    createHash('sha256').update(v14Bytes).digest('hex'),
    '367d6c5dfe4114205fb096dfa9cb1978f8182aa4c7165dc06187751f30714088',
  );
  assert.equal(v15.status, 'ACCEPTED');
  assert.equal(v15.updated_at, '2026-08-02T03:51:24.000-04:00');
  assert.equal(v15.registry_version, 15);
  assert.equal(v15.supersedes, v14.registry_id);
  assert.deepEqual(
    v15.schemas.filter(({ name }) => name !== 'linux-builder-manifest'),
    v14.schemas,
  );
  assert.deepEqual(v15.schemas.filter(({ name }) => name === 'linux-builder-manifest'), [{
    name: 'linux-builder-manifest',
    schema_id: 'urn:dosai:schema:linux-builder-manifest:1',
    version: 1,
    owner_phase: 'P3',
    state: 'DEFINED',
    path: 'schemas/v1/linux-builder-manifest.schema.json',
  }]);
});

test('builder declaration is exact, detached, immutable, and non-authorizing', () => {
  const candidate = candidateManifest();
  assert.equal(schema(candidate), true, JSON.stringify(schema.errors));
  const admitted = admitLinuxBuilderManifest(candidate);
  assert.deepEqual(structuredClone(admitted), candidate);
  assert.notEqual(admitted, candidate);
  assert.equal(admitted.image_preparation_allowed, false);
  assert.equal(admitted.guest_build_allowed, false);
  assert.equal(admitted.release_evidence_eligible, false);
  assert.equal(admitted.verification.complete, false);
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.base_image));
  assert.ok(Object.isFrozen(admitted.package_snapshot.packages));
  assert.ok(admitted.package_snapshot.packages.every(Object.isFrozen));
  assert.ok(Object.isFrozen(admitted.execution_policy.devices));
  assert.ok(Object.isFrozen(admitted.verification));
});

test('schema rejects authority, platform, isolation, and assurance expansion', () => {
  const cases = [
    (value) => { value.image_preparation_allowed = true; },
    (value) => { value.guest_build_allowed = true; },
    (value) => { value.release_evidence_eligible = true; },
    (value) => { value.status = 'VERIFIED'; },
    (value) => { value.platform.architecture = 'arm64'; },
    (value) => { value.platform.emulation_allowed = true; },
    (value) => { value.base_image.tag_reference_allowed = true; },
    (value) => { value.package_snapshot.output_package_manager_network_configured = true; },
    (value) => { value.package_snapshot.timestamp = '20261399T256161Z'; },
    (value) => { value.execution_policy.network_mode = 'BRIDGE'; },
    (value) => { value.execution_policy.read_only_root = false; },
    (value) => { value.execution_policy.devices = ['/dev/kvm']; },
    (value) => { value.execution_policy.docker_socket = true; },
    (value) => { value.execution_policy.input_mount = 'READ_WRITE'; },
    (value) => { value.execution_policy.shared_cache = true; },
    (value) => { value.execution_policy.secrets = true; },
    (value) => { value.execution_policy.minimum_independent_runs = 1; },
    (value) => { value.verification.complete = true; },
    (value) => { value.extra = 'authority'; },
  ];
  for (const mutate of cases) {
    const candidate = candidateManifest();
    mutate(candidate);
    assert.equal(schema(candidate), false);
    assert.throws(() => admitLinuxBuilderManifest(candidate), TypeError);
  }
});

test('runtime rejects digest substitution and non-canonical package closure', () => {
  const cases = [
    (value) => { value.base_image.pinned_reference = `docker.io/library/debian@sha256:${'0'.repeat(64)}`; },
    (value) => { value.base_image.pinned_reference = 'docker.io/library/debian:13'; },
    (value) => { value.package_snapshot.packages.reverse(); },
    (value) => { value.package_snapshot.packages[1].name = 'bash'; },
  ];
  for (const mutate of cases) {
    const candidate = candidateManifest();
    mutate(candidate);
    assert.throws(() => admitLinuxBuilderManifest(candidate), TypeError);
  }
});

test('builder admission rejects accessors without invoking them', () => {
  const candidate = candidateManifest();
  let invoked = false;
  Object.defineProperty(candidate.base_image, 'index_digest', {
    enumerable: true,
    get() {
      invoked = true;
      return `sha256:${'1'.repeat(64)}`;
    },
  });
  assert.throws(() => admitLinuxBuilderManifest(candidate), TypeError);
  assert.equal(invoked, false);

  const packageCandidate = candidateManifest();
  Object.defineProperty(packageCandidate.package_snapshot.packages, '0', {
    enumerable: true,
    get() {
      invoked = true;
      return candidateManifest().package_snapshot.packages[0];
    },
  });
  assert.throws(() => admitLinuxBuilderManifest(packageCandidate), TypeError);
  assert.equal(invoked, false);
});

test('builder admission module exposes no filesystem, network, process, or container effect', async () => {
  const source = await readFile(resolve(root, 'src/contracts/p3/builder-input.ts'), 'utf8');
  assert.doesNotMatch(source, /^import /m);
  assert.doesNotMatch(
    source,
    /child_process|node:|electron|VZVirtualMachine|Dockerode|\bspawn\s*\(|\bexec\s*\(|\bfetch\s*\(|docker\s+(?:build|pull|run)|readFile|writeFile/,
  );
});
