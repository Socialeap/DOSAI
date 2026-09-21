import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { admitGuestSourceManifest } from '../../src/contracts/p3/guest-source.ts';
import { createSchemaValidator } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const validator = await createSchemaValidator(root, [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v1/guest-source-manifest.schema.json',
]);
const schema = validator.getSchema('urn:dosai:schema:guest-source-manifest:1');

const notPublished = () => ({
  availability: 'NOT_PUBLISHED',
  signature_url: '',
  signer_fingerprint: '',
  mathematical_verification: false,
  trust_verification: false,
});

function source(source_id, role, component, version, archive_name, canonical_url, sha256) {
  return {
    source_id,
    role,
    component,
    version,
    archive_name,
    canonical_url,
    sha256,
    size_bytes: 1_048_576,
    license_expression: component === 'linux' ? 'GPL-2.0-only' : 'BSD-3-Clause',
    license_files: [component === 'linux' ? 'COPYING' : 'LICENSE'],
    signature: notPublished(),
  };
}

function candidateManifest() {
  const sources = [
    source(
      'buildroot',
      'BUILD_SYSTEM',
      'buildroot',
      '2025.02.16',
      'buildroot-2025.02.16.tar.xz',
      'https://buildroot.org/downloads/buildroot-2025.02.16.tar.xz',
      '15305e3d366eeaf4a5ecaf2ed42f685fd6af7fe5dbf1f62e1de5f46ee83225e2',
    ),
    source(
      'busybox',
      'ROOT_FILESYSTEM_PACKAGE',
      'busybox',
      '1.37.0',
      'busybox-1.37.0.tar.bz2',
      'https://busybox.net/downloads/busybox-1.37.0.tar.bz2',
      '1'.repeat(64),
    ),
    source(
      'go-bootstrap-stage1',
      'TOOLCHAIN_BOOTSTRAP',
      'go',
      '1.4-bootstrap-20171003',
      'go1.4-bootstrap-20171003.tar.gz',
      'https://dl.google.com/go/go1.4-bootstrap-20171003.tar.gz',
      'f4ff5b5eb3a3cae1c993723f3eab519c5bae18866b5e5f96fe1102f0cb5c3e52',
    ),
    source(
      'go-bootstrap-stage2',
      'TOOLCHAIN_BOOTSTRAP',
      'go',
      '1.19.13',
      'go1.19.13.src.tar.gz',
      'https://go.dev/dl/go1.19.13.src.tar.gz',
      'ccf36b53fb0024a017353c3ddb22c1f00bc7a8073c6aac79042da24ee34434d3',
    ),
    source(
      'go-bootstrap-stage3',
      'TOOLCHAIN_BOOTSTRAP',
      'go',
      '1.21.8',
      'go1.21.8.src.tar.gz',
      'https://go.dev/dl/go1.21.8.src.tar.gz',
      'dc806cf75a87e1414b5b4c3dcb9dd3e9cc98f4cfccec42b7af617d5a658a3c43',
    ),
    source(
      'go-bootstrap-stage4',
      'TOOLCHAIN_BOOTSTRAP',
      'go',
      '1.23.12',
      'go1.23.12.src.tar.gz',
      'https://go.dev/dl/go1.23.12.src.tar.gz',
      'e1cce9379a24e895714a412c7ddd157d2614d9edbe83a84449b6e1840b4f1226',
    ),
    source(
      'go-bootstrap-stage5',
      'TOOLCHAIN_BOOTSTRAP',
      'go',
      '1.25.12',
      'go1.25.12.src.tar.gz',
      'https://go.dev/dl/go1.25.12.src.tar.gz',
      'f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932',
    ),
    source(
      'go-final',
      'TOOLCHAIN_FINAL',
      'go',
      '1.26.5',
      'go1.26.5.src.tar.gz',
      'https://go.dev/dl/go1.26.5.src.tar.gz',
      '495be4bc87176ac567392e5b4116abd98466d33d7b49d41e764ccc6976b2dc42',
    ),
    source(
      'linux-kernel',
      'KERNEL',
      'linux',
      '6.12.99',
      'linux-6.12.99.tar.xz',
      'https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.12.99.tar.xz',
      '2'.repeat(64),
    ),
  ];
  sources[0].signature = {
    availability: 'REQUIRED',
    signature_url: 'https://buildroot.org/downloads/buildroot-2025.02.16.tar.xz.sign',
    signer_fingerprint: '18C7DF2819C1733D822D599EA500D6EE9CB0E540',
    mathematical_verification: false,
    trust_verification: false,
  };

  return {
    schema_id: 'urn:dosai:schema:guest-source-manifest:1',
    schema_version: 1,
    manifest_id: randomUUID(),
    source_set_version: '1',
    scope: 'FULL_GUEST_BUILD',
    status: 'DECLARED_UNVERIFIED',
    build_allowed: false,
    runtime_eligible: false,
    sources,
    patches: [
      {
        patch_id: 'buildroot-go-security-1.26.5',
        target_source_id: 'buildroot',
        apply_order: 1,
        kind: 'DOSAI_LOCAL',
        repository_path: 'guest-build/patches/buildroot-2025.02.16/0001-package-go-security-bump-to-go-1.26.5.patch',
        sha256: '038704e622a717b0eab302e6c223174d24a77e3e6798dab710f1ad9ab0f7275d',
        expected_touched_paths: [
          'package/go/go-bootstrap-stage5/go-bootstrap-stage5.hash',
          'package/go/go-bootstrap-stage5/go-bootstrap-stage5.mk',
          'package/go/go.hash',
          'package/go/go.mk',
        ],
        application: {
          verifier: 'GIT_APPLY_CHECK',
          strip_components: 1,
          fuzz_allowed: 0,
          offsets_allowed: false,
          backup_files_allowed: false,
          reject_files_allowed: false,
          verified: false,
        },
      },
    ],
    toolchain: {
      build_system_source_id: 'buildroot',
      build_system_version: '2025.02.16',
      build_system_sha256: '15305e3d366eeaf4a5ecaf2ed42f685fd6af7fe5dbf1f62e1de5f46ee83225e2',
      bootstrap_source_ids: [
        'go-bootstrap-stage1',
        'go-bootstrap-stage2',
        'go-bootstrap-stage3',
        'go-bootstrap-stage4',
        'go-bootstrap-stage5',
      ],
      stage5_source_id: 'go-bootstrap-stage5',
      stage5_version: '1.25.12',
      stage5_sha256: 'f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932',
      final_source_id: 'go-final',
      final_version: '1.26.5',
      final_sha256: '495be4bc87176ac567392e5b4116abd98466d33d7b49d41e764ccc6976b2dc42',
      accepted_patch_id: 'buildroot-go-security-1.26.5',
      required_provider: 'BUILDROOT_HOST_GO_SRC',
      prebuilt_provider_allowed: false,
      provider_configuration_verified: false,
      target_os: 'linux',
      target_arch: 'arm64',
      cgo_enabled: false,
      build_environment: {
        GOFLAGS: '-mod=vendor',
        GOPROXY: 'off',
        GOSUMDB: 'off',
        GOTOOLCHAIN: 'local',
        GOWORK: 'off',
      },
    },
    closure: {
      sealed_bundle_path: 'guest-sources/v1/guest-source-bundle.tar.zst',
      sealed_bundle_sha256: 'a'.repeat(64),
      sealed_bundle_size_bytes: 1_073_741_824,
      canonical_inventory_sha256: 'b'.repeat(64),
      declared_source_count: 9,
      declared_patch_count: 1,
      source_digests_verified: false,
      upstream_signatures_verified: false,
      signer_trust_verified: false,
      patches_verified: false,
      provider_verified: false,
      network_during_build: false,
      shared_cache: false,
      complete: false,
    },
  };
}

test('accepted schema registry v14 adds only the source manifest to hash-locked v13', async () => {
  const v13Bytes = await readFile(resolve(root, 'docs/architecture/schema-registry-v13.json'));
  const v13 = JSON.parse(v13Bytes);
  const v14 = JSON.parse(
    await readFile(resolve(root, 'docs/architecture/schema-registry-v14.json'), 'utf8'),
  );
  assert.equal(
    createHash('sha256').update(v13Bytes).digest('hex'),
    'b57a67eadec3245d96cb21d765b3a728788a1c3f3c59917e26cd121fadf0e642',
  );
  assert.equal(v14.status, 'ACCEPTED');
  assert.equal(v14.registry_version, 14);
  assert.equal(v14.supersedes, v13.registry_id);
  assert.deepEqual(
    v14.schemas.filter(({ name }) => name !== 'guest-source-manifest'),
    v13.schemas,
  );
  assert.deepEqual(v14.schemas.filter(({ name }) => name === 'guest-source-manifest'), [{
    name: 'guest-source-manifest',
    schema_id: 'urn:dosai:schema:guest-source-manifest:1',
    version: 1,
    owner_phase: 'P3',
    state: 'DEFINED',
    path: 'schemas/v1/guest-source-manifest.schema.json',
  }]);
});

test('source candidate is exact, detached, immutable, and non-authorizing', () => {
  const candidate = candidateManifest();
  assert.equal(schema(candidate), true, JSON.stringify(schema.errors));
  const admitted = admitGuestSourceManifest(candidate);
  assert.deepEqual(structuredClone(admitted), candidate);
  assert.notEqual(admitted, candidate);
  assert.equal(admitted.build_allowed, false);
  assert.equal(admitted.runtime_eligible, false);
  assert.equal(admitted.closure.complete, false);
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.sources));
  assert.ok(Object.isFrozen(admitted.sources[0].signature));
  assert.ok(Object.isFrozen(admitted.patches[0].application));
  assert.ok(Object.isFrozen(admitted.toolchain.build_environment));
  assert.ok(Object.isFrozen(admitted.closure));
});

test('schema rejects source, patch, closure, and authority expansion', () => {
  const cases = [
    (value) => { value.build_allowed = true; },
    (value) => { value.runtime_eligible = true; },
    (value) => { value.status = 'VERIFIED'; },
    (value) => { value.sources[0].signature.trust_verification = true; },
    (value) => { value.patches[0].application.verified = true; },
    (value) => { value.patches[0].application.fuzz_allowed = 1; },
    (value) => { value.patches[0].repository_path = '../patch.patch'; },
    (value) => { value.toolchain.prebuilt_provider_allowed = true; },
    (value) => { value.toolchain.provider_configuration_verified = true; },
    (value) => { value.closure.network_during_build = true; },
    (value) => { value.closure.complete = true; },
    (value) => { value.extra = 'authority'; },
  ];
  for (const mutate of cases) {
    const candidate = candidateManifest();
    mutate(candidate);
    assert.equal(schema(candidate), false);
  }
});

test('runtime rejects canonicalization and cross-record substitution', () => {
  const cases = [
    (value) => { value.sources[0].canonical_url += '?mirror=1'; },
    (value) => { value.sources[1].canonical_url = 'https://busybox.net/downloads/busybox%2D1.37.0.tar.bz2'; },
    (value) => { value.sources.reverse(); },
    (value) => { value.sources[1].archive_name = value.sources[0].archive_name; },
    (value) => { value.sources[2].version = '1.4-bootstrap-20171004'; },
    (value) => { value.sources[3].sha256 = 'c'.repeat(64); },
    (value) => { value.sources[4].canonical_url = 'https://example.com/go1.21.8.src.tar.gz'; },
    (value) => { value.sources[0].signature = notPublished(); },
    (value) => { value.patches[0].target_source_id = 'busybox'; },
    (value) => { value.patches[0].apply_order = 2; },
    (value) => { value.patches[0].sha256 = 'd'.repeat(64); },
    (value) => { value.closure.declared_source_count = 10; },
  ];
  for (const mutate of cases) {
    const candidate = candidateManifest();
    mutate(candidate);
    assert.throws(() => admitGuestSourceManifest(candidate), TypeError);
  }
});

test('descriptor admission rejects accessors without invoking them', () => {
  const candidate = candidateManifest();
  let invoked = false;
  Object.defineProperty(candidate, 'manifest_id', {
    enumerable: true,
    get() {
      invoked = true;
      return randomUUID();
    },
  });
  assert.throws(() => admitGuestSourceManifest(candidate), TypeError);
  assert.equal(invoked, false);
});

test('URL admission is insulated from mutable global parser replacement', () => {
  const original = globalThis.URL;
  globalThis.URL = class ForgedUrl {
    constructor(value) {
      this.protocol = 'https:';
      this.username = '';
      this.password = '';
      this.port = '';
      this.search = '';
      this.hash = '';
      this.pathname = '/forged';
      this.href = value;
    }
  };
  try {
    const candidate = candidateManifest();
    candidate.sources[0].canonical_url += '?mirror=1';
    assert.throws(() => admitGuestSourceManifest(candidate), TypeError);
  } finally {
    globalThis.URL = original;
  }
});

test('source admission module exposes no filesystem, network, process, or execution effect', async () => {
  const moduleText = await readFile(resolve(root, 'src/contracts/p3/guest-source.ts'), 'utf8');
  for (const forbidden of [
    'node:child_process',
    'node:fs',
    'node:net',
    'node:http',
    'node:https',
    'electron',
    'Virtualization',
    'fetch(',
    'spawn(',
    'exec(',
  ]) {
    assert.equal(moduleText.includes(forbidden), false, forbidden);
  }
});
