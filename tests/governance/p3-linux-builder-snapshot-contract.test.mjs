import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { admitLinuxBuilderManifestV2 } from '../../src/contracts/p3/builder-input-v2.ts';
import { createSchemaValidator } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const validator = await createSchemaValidator(root, [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v2/linux-builder-manifest.schema.json',
]);
const schema = validator.getSchema('urn:dosai:schema:linux-builder-manifest:2');

function releaseFile(archive, suite, sha256) {
  const path = `dists/${suite}/InRelease`;
  return {
    archive,
    suite,
    path,
    snapshot_uri:
      `https://snapshot.debian.org/archive/${archive}/20260713T000000Z/${path}`,
    sha256,
    size_bytes: 150_000,
  };
}

function packageIndex(archive, suite, sha256, releaseFileSha256) {
  const path = `dists/${suite}/main/binary-amd64/Packages.xz`;
  return {
    archive,
    suite,
    component: 'main',
    architecture: 'amd64',
    path,
    snapshot_uri:
      `https://snapshot.debian.org/archive/${archive}/20260713T000000Z/${path}`,
    sha256,
    size_bytes: 8_000_000,
    release_file_sha256: releaseFileSha256,
  };
}

function candidateManifest() {
  const baseIndexDigest = `sha256:${'1'.repeat(64)}`;
  const releases = [
    releaseFile(
      'debian',
      'trixie',
      '98b25b5cd185c59d34aa6e4c3e9b5b8f01bbe9d104fe2dcfbcd30dc0a14a59ed',
    ),
    releaseFile(
      'debian',
      'trixie-updates',
      '88044b0f14b7cb9c5379adabd766262c76d482d94c0a17c89c54f0550e5195a1',
    ),
    releaseFile(
      'debian-security',
      'trixie-security',
      '23d56758baefb802b7fd7356bce1ea952b9963a800d01a4f8fd768555da20198',
    ),
  ];
  return {
    schema_id: 'urn:dosai:schema:linux-builder-manifest:2',
    schema_version: 2,
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
      timestamp: '20260713T000000Z',
      sources_list_sha256:
        'eebc0e88a193ffa3695507713f8fa7a19818447f0f67b8a83d3c1507dfad9229',
      archive_keyring_sha256: '4'.repeat(64),
      base_package_manifest_sha256:
        '180af5bad936ad6b9298fdd45cab7d0d49dbfe9199e52c983a8a631ed363a676',
      direct_package_intent_sha256:
        'b2f0935683765d0c3d1948b5b5566fda6b8ab6527ef79d6fc8021419afae1dc2',
      release_files: releases,
      package_indexes: [
        packageIndex('debian', 'trixie', '5'.repeat(64), releases[0].sha256),
        packageIndex('debian', 'trixie-updates', '6'.repeat(64), releases[1].sha256),
        packageIndex(
          'debian-security',
          'trixie-security',
          '7'.repeat(64),
          releases[2].sha256,
        ),
      ],
      packages: [
        {
          name: 'bash',
          version: '5.2.37-2+b9',
          architecture: 'amd64',
          archive: 'debian',
          pool_path: 'pool/main/b/bash/bash_5.2.37-2+b9_amd64.deb',
          size_bytes: 1_500_000,
          deb_sha256: '8'.repeat(64),
          source_name: 'bash',
          source_version: '5.2.37-2',
        },
        {
          name: 'ca-certificates',
          version: '20250419',
          architecture: 'all',
          archive: 'debian',
          pool_path: 'pool/main/c/ca-certificates/ca-certificates_20250419_all.deb',
          size_bytes: 161_000,
          deb_sha256: '9'.repeat(64),
          source_name: 'ca-certificates',
          source_version: '20250419',
        },
      ],
      resolution_report_sha256: 'a'.repeat(64),
      installed_inventory_sha256: 'b'.repeat(64),
      output_package_manager_network_configured: false,
      release_signatures_verified: false,
      indexes_verified: false,
      closure_complete: false,
    },
    recipe: {
      dockerfile_path: 'guest-build/builder/Dockerfile',
      dockerfile_sha256: 'c'.repeat(64),
      build_policy_path: 'guest-build/builder/build-policy.json',
      build_policy_sha256: 'd'.repeat(64),
      build_context_inventory_sha256: 'e'.repeat(64),
      source_manifest_schema_id: 'urn:dosai:schema:guest-source-manifest:1',
      source_manifest_sha256: 'f'.repeat(64),
    },
    output: {
      oci_archive_path: 'builder-artifacts/v1/dosai-linux-builder-amd64.oci.tar',
      oci_archive_sha256: '1'.repeat(64),
      oci_manifest_digest: `sha256:${'2'.repeat(64)}`,
      sbom_sha256: '3'.repeat(64),
      sbom_format: 'SPDX_2_3_JSON',
      provenance_sha256: '4'.repeat(64),
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

test('proposed registry v16 changes only the builder contract over accepted v15', async () => {
  const v15Bytes = await readFile(resolve(root, 'docs/architecture/schema-registry-v15.json'));
  const v15 = JSON.parse(v15Bytes);
  const v16 = JSON.parse(
    await readFile(resolve(root, 'docs/architecture/schema-registry-v16.json'), 'utf8'),
  );
  assert.equal(
    createHash('sha256').update(v15Bytes).digest('hex'),
    'ec122a0151e109bc9f84de7eeeef9667e68cccca214d578405b48ea7190ea76c',
  );
  assert.equal(v15.status, 'ACCEPTED');
  assert.equal(v16.status, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.equal(v16.registry_version, 16);
  assert.equal(v16.supersedes, v15.registry_id);
  assert.deepEqual(
    v16.schemas.filter(({ name }) => name !== 'linux-builder-manifest'),
    v15.schemas.filter(({ name }) => name !== 'linux-builder-manifest'),
  );
  assert.deepEqual(
    v16.schemas.find(({ name }) => name === 'linux-builder-manifest'),
    {
      name: 'linux-builder-manifest',
      schema_id: 'urn:dosai:schema:linux-builder-manifest:2',
      version: 2,
      owner_phase: 'P3',
      state: 'DEFINED',
      path: 'schemas/v2/linux-builder-manifest.schema.json',
    },
  );
});

test('v2 binds all signed suites, package indexes, source identities, and all packages', () => {
  const candidate = candidateManifest();
  assert.equal(schema(candidate), true, JSON.stringify(schema.errors));
  const admitted = admitLinuxBuilderManifestV2(candidate);
  assert.deepEqual(structuredClone(admitted), candidate);
  assert.notEqual(admitted, candidate);
  assert.deepEqual(
    admitted.package_snapshot.release_files.map(({ archive, suite }) => [archive, suite]),
    [
      ['debian', 'trixie'],
      ['debian', 'trixie-updates'],
      ['debian-security', 'trixie-security'],
    ],
  );
  assert.equal(admitted.package_snapshot.packages[1].architecture, 'all');
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.package_snapshot.release_files));
  assert.ok(Object.isFrozen(admitted.package_snapshot.package_indexes));
  assert.ok(Object.isFrozen(admitted.package_snapshot.packages));
});

test('v2 rejects v1 shape, suite substitution, index rebinding, and package ambiguity', () => {
  const invalid = [
    (value) => {
      value.package_snapshot.release_file_sha256 = '0'.repeat(64);
      delete value.package_snapshot.release_files;
    },
    (value) => { value.package_snapshot.release_files.reverse(); },
    (value) => { value.package_snapshot.package_indexes[1].release_file_sha256 = '0'.repeat(64); },
    (value) => { value.package_snapshot.package_indexes[2].archive = 'debian'; },
    (value) => { value.package_snapshot.packages[1].architecture = 'arm64'; },
    (value) => { value.package_snapshot.packages[1].pool_path = '../ca-certificates.deb'; },
    (value) => { value.package_snapshot.packages[1].source_name = 'CA-certificates'; },
    (value) => { value.package_snapshot.release_signatures_verified = true; },
    (value) => { value.package_snapshot.closure_complete = true; },
  ];
  for (const mutate of invalid) {
    const candidate = candidateManifest();
    mutate(candidate);
    assert.throws(() => admitLinuxBuilderManifestV2(candidate), TypeError);
  }
});

test('v2 rejects package reordering, duplicate names, and timestamp URI drift', () => {
  const invalid = [
    (value) => { value.package_snapshot.packages.reverse(); },
    (value) => { value.package_snapshot.packages[1].name = 'bash'; },
    (value) => {
      value.package_snapshot.release_files[0].snapshot_uri =
        value.package_snapshot.release_files[0].snapshot_uri.replace('20260713', '20260714');
    },
    (value) => {
      value.package_snapshot.packages[1].pool_path =
        'pool/main/c/ca-certificates/ca-certificates_20250419_amd64.deb';
    },
  ];
  for (const mutate of invalid) {
    const candidate = candidateManifest();
    mutate(candidate);
    assert.throws(() => admitLinuxBuilderManifestV2(candidate), TypeError);
  }
});

test('v2 admission rejects accessors without invoking them', () => {
  const candidate = candidateManifest();
  let invoked = false;
  Object.defineProperty(candidate.package_snapshot.release_files[0], 'sha256', {
    enumerable: true,
    get() {
      invoked = true;
      return '0'.repeat(64);
    },
  });
  assert.throws(() => admitLinuxBuilderManifestV2(candidate), TypeError);
  assert.equal(invoked, false);
});

test('v2 admission adds no filesystem, network, process, or container effect', async () => {
  const source = await readFile(resolve(root, 'src/contracts/p3/builder-input-v2.ts'), 'utf8');
  assert.doesNotMatch(
    source,
    /child_process|node:|electron|VZVirtualMachine|Dockerode|\bspawn\s*\(|\bexec\s*\(|\bfetch\s*\(|docker\s+(?:build|pull|run)|readFile|writeFile/,
  );
  assert.match(source, /from '\.\/builder-input\.ts'/);
});
