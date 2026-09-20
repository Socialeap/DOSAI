const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL_SEQUENCE = /^(0|[1-9][0-9]*)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const OCI_DIGEST = /^sha256:[0-9a-f]{64}$/;
const PACKAGE_NAME = /^[a-z0-9][a-z0-9+.-]{0,95}$/;
const PACKAGE_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+:~_-]{0,127}$/;
const SNAPSHOT_TIMESTAMP = /^[0-9]{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]Z$/;

const MANIFEST_KEYS = Object.freeze([
  'schema_id', 'schema_version', 'manifest_id', 'builder_set_version', 'scope', 'status',
  'image_preparation_allowed', 'guest_build_allowed', 'release_evidence_eligible',
  'platform', 'base_image', 'package_snapshot', 'recipe', 'output', 'execution_policy',
  'verification',
] as const);
const PLATFORM_KEYS = Object.freeze([
  'os', 'architecture', 'native_execution_required', 'emulation_allowed',
] as const);
const BASE_IMAGE_KEYS = Object.freeze([
  'distribution', 'release', 'major_version', 'registry', 'repository', 'index_digest',
  'amd64_manifest_digest', 'config_digest', 'pinned_reference', 'tag_reference_allowed',
] as const);
const SNAPSHOT_KEYS = Object.freeze([
  'service', 'timestamp', 'release_file_sha256', 'sources_list_sha256', 'packages',
  'output_package_manager_network_configured',
] as const);
const PACKAGE_KEYS = Object.freeze(['name', 'version', 'architecture', 'deb_sha256'] as const);
const RECIPE_KEYS = Object.freeze([
  'dockerfile_path', 'dockerfile_sha256', 'build_policy_path', 'build_policy_sha256',
  'build_context_inventory_sha256', 'source_manifest_schema_id', 'source_manifest_sha256',
] as const);
const OUTPUT_KEYS = Object.freeze([
  'oci_archive_path', 'oci_archive_sha256', 'oci_manifest_digest', 'sbom_sha256',
  'sbom_format', 'provenance_sha256', 'signatures_verified', 'vulnerability_review',
] as const);
const POLICY_KEYS = Object.freeze([
  'pull_policy', 'network_mode', 'loopback_only', 'read_only_root',
  'all_capabilities_dropped', 'no_new_privileges', 'host_namespaces', 'devices',
  'docker_socket', 'run_as_uid', 'run_as_gid', 'input_mount', 'work_mount', 'output_mount',
  'shared_cache', 'secrets', 'cleanup_required', 'minimum_independent_runs',
  'distinct_native_hosts', 'exact_output_comparison_required', 'policy_verified',
] as const);
const VERIFICATION_KEYS = Object.freeze([
  'base_image_verified', 'snapshot_verified', 'packages_verified', 'recipe_verified',
  'oci_archive_verified', 'sbom_verified', 'provenance_verified', 'native_runs_verified',
  'independence_verified', 'outputs_reproducible', 'complete',
] as const);

type BuilderPackage = Readonly<{
  name: string;
  version: string;
  architecture: 'amd64';
  deb_sha256: string;
}>;

export type LinuxBuilderManifest = Readonly<{
  schema_id: 'urn:dosai:schema:linux-builder-manifest:1';
  schema_version: 1;
  manifest_id: string;
  builder_set_version: string;
  scope: 'GUEST_BUILD_PREPARATION';
  status: 'DECLARED_UNVERIFIED';
  image_preparation_allowed: false;
  guest_build_allowed: false;
  release_evidence_eligible: false;
  platform: Readonly<{
    os: 'linux';
    architecture: 'amd64';
    native_execution_required: true;
    emulation_allowed: false;
  }>;
  base_image: Readonly<{
    distribution: 'debian';
    release: 'trixie';
    major_version: 13;
    registry: 'docker.io';
    repository: 'library/debian';
    index_digest: string;
    amd64_manifest_digest: string;
    config_digest: string;
    pinned_reference: string;
    tag_reference_allowed: false;
  }>;
  package_snapshot: Readonly<{
    service: 'snapshot.debian.org';
    timestamp: string;
    release_file_sha256: string;
    sources_list_sha256: string;
    packages: readonly BuilderPackage[];
    output_package_manager_network_configured: false;
  }>;
  recipe: Readonly<{
    dockerfile_path: 'guest-build/builder/Dockerfile';
    dockerfile_sha256: string;
    build_policy_path: 'guest-build/builder/build-policy.json';
    build_policy_sha256: string;
    build_context_inventory_sha256: string;
    source_manifest_schema_id: 'urn:dosai:schema:guest-source-manifest:1';
    source_manifest_sha256: string;
  }>;
  output: Readonly<{
    oci_archive_path: 'builder-artifacts/v1/dosai-linux-builder-amd64.oci.tar';
    oci_archive_sha256: string;
    oci_manifest_digest: string;
    sbom_sha256: string;
    sbom_format: 'SPDX_2_3_JSON';
    provenance_sha256: string;
    signatures_verified: false;
    vulnerability_review: 'NOT_PERFORMED';
  }>;
  execution_policy: Readonly<{
    pull_policy: 'NEVER';
    network_mode: 'NONE';
    loopback_only: true;
    read_only_root: true;
    all_capabilities_dropped: true;
    no_new_privileges: true;
    host_namespaces: false;
    devices: readonly [];
    docker_socket: false;
    run_as_uid: 1000;
    run_as_gid: 1000;
    input_mount: 'READ_ONLY_RECURSIVE';
    work_mount: 'FRESH_EMPTY';
    output_mount: 'FRESH_EMPTY';
    shared_cache: false;
    secrets: false;
    cleanup_required: true;
    minimum_independent_runs: 2;
    distinct_native_hosts: true;
    exact_output_comparison_required: true;
    policy_verified: false;
  }>;
  verification: Readonly<{
    base_image_verified: false;
    snapshot_verified: false;
    packages_verified: false;
    recipe_verified: false;
    oci_archive_verified: false;
    sbom_verified: false;
    provenance_verified: false;
    native_runs_verified: false;
    independence_verified: false;
    outputs_reproducible: false;
    complete: false;
  }>;
}>;

function exactObject(
  candidate: unknown,
  keys: readonly string[],
  errorCode: string,
): Record<string, unknown> {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError(errorCode);
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(errorCode);
  const ownKeys = Reflect.ownKeys(candidate);
  if (
    ownKeys.some((key) => typeof key === 'symbol') ||
    ownKeys.map(String).sort().join('\0') !== [...keys].sort().join('\0')
  ) {
    throw new TypeError(errorCode);
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(errorCode);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactArray(
  candidate: unknown,
  minimum: number,
  maximum: number,
  errorCode: string,
): readonly unknown[] {
  if (
    !Array.isArray(candidate) ||
    Object.getPrototypeOf(candidate) !== Array.prototype ||
    candidate.length < minimum ||
    candidate.length > maximum
  ) {
    throw new TypeError(errorCode);
  }
  const expectedKeys = [
    ...Array.from({ length: candidate.length }, (_, index) => String(index)),
    'length',
  ];
  const ownKeys = Reflect.ownKeys(candidate);
  if (
    ownKeys.some((key) => typeof key === 'symbol') ||
    ownKeys.map(String).sort().join('\0') !== expectedKeys.sort().join('\0')
  ) {
    throw new TypeError(errorCode);
  }
  return Array.from({ length: candidate.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(errorCode);
    }
    return descriptor.value;
  });
}

function matchingString(
  value: unknown,
  pattern: RegExp,
  maximumLength: number,
  errorCode: string,
): string {
  if (typeof value !== 'string' || value.length > maximumLength || !pattern.test(value)) {
    throw new TypeError(errorCode);
  }
  return value;
}

function digest(value: unknown, errorCode: string): string {
  return matchingString(value, SHA256, 64, errorCode);
}

function ociDigest(value: unknown, errorCode: string): string {
  return matchingString(value, OCI_DIGEST, 71, errorCode);
}

function requireFalseFlags(
  candidate: Record<string, unknown>,
  keys: readonly string[],
  errorCode: string,
): void {
  if (keys.some((key) => candidate[key] !== false)) throw new TypeError(errorCode);
}

export function admitLinuxBuilderManifest(candidate: unknown): LinuxBuilderManifest {
  const errorCode = 'DOSAI_LINUX_BUILDER_SCHEMA_0001';
  const relationError = 'DOSAI_LINUX_BUILDER_RELATION_0001';
  const manifest = exactObject(candidate, MANIFEST_KEYS, errorCode);
  if (
    manifest.schema_id !== 'urn:dosai:schema:linux-builder-manifest:1' ||
    manifest.schema_version !== 1 ||
    manifest.scope !== 'GUEST_BUILD_PREPARATION' ||
    manifest.status !== 'DECLARED_UNVERIFIED' ||
    manifest.image_preparation_allowed !== false ||
    manifest.guest_build_allowed !== false ||
    manifest.release_evidence_eligible !== false
  ) {
    throw new TypeError(errorCode);
  }
  const manifestId = matchingString(manifest.manifest_id, UUID_V4, 36, errorCode);
  const builderSetVersion = matchingString(
    manifest.builder_set_version,
    DECIMAL_SEQUENCE,
    32,
    errorCode,
  );

  const platform = exactObject(manifest.platform, PLATFORM_KEYS, errorCode);
  if (
    platform.os !== 'linux' ||
    platform.architecture !== 'amd64' ||
    platform.native_execution_required !== true ||
    platform.emulation_allowed !== false
  ) {
    throw new TypeError(errorCode);
  }

  const baseImage = exactObject(manifest.base_image, BASE_IMAGE_KEYS, errorCode);
  if (
    baseImage.distribution !== 'debian' ||
    baseImage.release !== 'trixie' ||
    baseImage.major_version !== 13 ||
    baseImage.registry !== 'docker.io' ||
    baseImage.repository !== 'library/debian' ||
    baseImage.tag_reference_allowed !== false
  ) {
    throw new TypeError(errorCode);
  }
  const baseIndexDigest = ociDigest(baseImage.index_digest, errorCode);
  const baseAmd64ManifestDigest = ociDigest(baseImage.amd64_manifest_digest, errorCode);
  const baseConfigDigest = ociDigest(baseImage.config_digest, errorCode);
  const expectedReference = `docker.io/library/debian@${baseIndexDigest}`;
  if (baseImage.pinned_reference !== expectedReference) throw new TypeError(relationError);

  const snapshot = exactObject(manifest.package_snapshot, SNAPSHOT_KEYS, errorCode);
  if (
    snapshot.service !== 'snapshot.debian.org' ||
    snapshot.output_package_manager_network_configured !== false
  ) {
    throw new TypeError(errorCode);
  }
  const timestamp = matchingString(snapshot.timestamp, SNAPSHOT_TIMESTAMP, 16, errorCode);
  const packageCandidates = exactArray(snapshot.packages, 1, 256, errorCode);
  const packages = packageCandidates.map((candidatePackage): BuilderPackage => {
    const packageRecord = exactObject(candidatePackage, PACKAGE_KEYS, errorCode);
    if (packageRecord.architecture !== 'amd64') throw new TypeError(errorCode);
    return Object.freeze({
      name: matchingString(packageRecord.name, PACKAGE_NAME, 96, errorCode),
      version: matchingString(packageRecord.version, PACKAGE_VERSION, 128, errorCode),
      architecture: 'amd64',
      deb_sha256: digest(packageRecord.deb_sha256, errorCode),
    });
  });
  const names = packages.map(({ name }) => name);
  if (new Set(names).size !== names.length) throw new TypeError(relationError);
  for (let index = 1; index < packages.length; index += 1) {
    const previous = packages[index - 1];
    const current = packages[index];
    if (previous === undefined || current === undefined || previous.name >= current.name) {
      throw new TypeError(relationError);
    }
  }

  const recipe = exactObject(manifest.recipe, RECIPE_KEYS, errorCode);
  if (
    recipe.dockerfile_path !== 'guest-build/builder/Dockerfile' ||
    recipe.build_policy_path !== 'guest-build/builder/build-policy.json' ||
    recipe.source_manifest_schema_id !== 'urn:dosai:schema:guest-source-manifest:1'
  ) {
    throw new TypeError(errorCode);
  }

  const output = exactObject(manifest.output, OUTPUT_KEYS, errorCode);
  if (
    output.oci_archive_path !== 'builder-artifacts/v1/dosai-linux-builder-amd64.oci.tar' ||
    output.sbom_format !== 'SPDX_2_3_JSON' ||
    output.signatures_verified !== false ||
    output.vulnerability_review !== 'NOT_PERFORMED'
  ) {
    throw new TypeError(errorCode);
  }

  const policy = exactObject(manifest.execution_policy, POLICY_KEYS, errorCode);
  if (
    policy.pull_policy !== 'NEVER' ||
    policy.network_mode !== 'NONE' ||
    policy.loopback_only !== true ||
    policy.read_only_root !== true ||
    policy.all_capabilities_dropped !== true ||
    policy.no_new_privileges !== true ||
    policy.host_namespaces !== false ||
    policy.docker_socket !== false ||
    policy.run_as_uid !== 1000 ||
    policy.run_as_gid !== 1000 ||
    policy.input_mount !== 'READ_ONLY_RECURSIVE' ||
    policy.work_mount !== 'FRESH_EMPTY' ||
    policy.output_mount !== 'FRESH_EMPTY' ||
    policy.shared_cache !== false ||
    policy.secrets !== false ||
    policy.cleanup_required !== true ||
    policy.minimum_independent_runs !== 2 ||
    policy.distinct_native_hosts !== true ||
    policy.exact_output_comparison_required !== true ||
    policy.policy_verified !== false
  ) {
    throw new TypeError(errorCode);
  }
  exactArray(policy.devices, 0, 0, errorCode);

  const verification = exactObject(manifest.verification, VERIFICATION_KEYS, errorCode);
  requireFalseFlags(verification, VERIFICATION_KEYS, errorCode);

  return Object.freeze({
    schema_id: 'urn:dosai:schema:linux-builder-manifest:1',
    schema_version: 1,
    manifest_id: manifestId,
    builder_set_version: builderSetVersion,
    scope: 'GUEST_BUILD_PREPARATION',
    status: 'DECLARED_UNVERIFIED',
    image_preparation_allowed: false,
    guest_build_allowed: false,
    release_evidence_eligible: false,
    platform: Object.freeze({
      os: 'linux',
      architecture: 'amd64',
      native_execution_required: true,
      emulation_allowed: false,
    }),
    base_image: Object.freeze({
      distribution: 'debian',
      release: 'trixie',
      major_version: 13,
      registry: 'docker.io',
      repository: 'library/debian',
      index_digest: baseIndexDigest,
      amd64_manifest_digest: baseAmd64ManifestDigest,
      config_digest: baseConfigDigest,
      pinned_reference: expectedReference,
      tag_reference_allowed: false,
    }),
    package_snapshot: Object.freeze({
      service: 'snapshot.debian.org',
      timestamp,
      release_file_sha256: digest(snapshot.release_file_sha256, errorCode),
      sources_list_sha256: digest(snapshot.sources_list_sha256, errorCode),
      packages: Object.freeze(packages),
      output_package_manager_network_configured: false,
    }),
    recipe: Object.freeze({
      dockerfile_path: 'guest-build/builder/Dockerfile',
      dockerfile_sha256: digest(recipe.dockerfile_sha256, errorCode),
      build_policy_path: 'guest-build/builder/build-policy.json',
      build_policy_sha256: digest(recipe.build_policy_sha256, errorCode),
      build_context_inventory_sha256: digest(recipe.build_context_inventory_sha256, errorCode),
      source_manifest_schema_id: 'urn:dosai:schema:guest-source-manifest:1',
      source_manifest_sha256: digest(recipe.source_manifest_sha256, errorCode),
    }),
    output: Object.freeze({
      oci_archive_path: 'builder-artifacts/v1/dosai-linux-builder-amd64.oci.tar',
      oci_archive_sha256: digest(output.oci_archive_sha256, errorCode),
      oci_manifest_digest: ociDigest(output.oci_manifest_digest, errorCode),
      sbom_sha256: digest(output.sbom_sha256, errorCode),
      sbom_format: 'SPDX_2_3_JSON',
      provenance_sha256: digest(output.provenance_sha256, errorCode),
      signatures_verified: false,
      vulnerability_review: 'NOT_PERFORMED',
    }),
    execution_policy: Object.freeze({
      pull_policy: 'NEVER',
      network_mode: 'NONE',
      loopback_only: true,
      read_only_root: true,
      all_capabilities_dropped: true,
      no_new_privileges: true,
      host_namespaces: false,
      devices: Object.freeze([]) as readonly [],
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
    }),
    verification: Object.freeze({
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
    }),
  });
}
