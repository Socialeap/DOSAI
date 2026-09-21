export const GUEST_ARTIFACT_ROLES = Object.freeze([
  'KERNEL',
  'INITRAMFS',
  'ROOT_FILESYSTEM',
  'GUEST_AGENT',
] as const);

export type GuestArtifactRole = (typeof GUEST_ARTIFACT_ROLES)[number];

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL_SEQUENCE = /^(0|[1-9][0-9]*)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PACKAGE_PATH = /^guest-artifacts\/v1\/[a-z0-9][a-z0-9._-]{0,127}$/;

const MANIFEST_KEYS = Object.freeze([
  'schema_id',
  'schema_version',
  'manifest_id',
  'artifact_set_version',
  'architecture',
  'boot_protocol',
  'release_status',
  'runtime_eligible',
  'artifacts',
  'supply_chain',
] as const);
const ARTIFACT_KEYS = Object.freeze([
  'role',
  'package_path',
  'sha256',
  'size_bytes',
  'media_type',
  'read_only',
] as const);
const SUPPLY_CHAIN_KEYS = Object.freeze([
  'build_recipe_sha256',
  'source_manifest_sha256',
  'sbom_sha256',
  'sbom_format',
  'license_manifest_sha256',
  'clean_room_rebuild',
  'vulnerability_review',
  'signatures_verified',
] as const);
const PROFILE_KEYS = Object.freeze([
  'schema_id',
  'schema_version',
  'profile_id',
  'capsule_id',
  'generation',
  'guest_manifest_sha256',
  'validation_level',
  'runtime_eligible',
  'cpu_count',
  'memory_size_bytes',
  'immutable_root_filesystem',
  'writable_disk_size_bytes',
  'writable_state_reuse',
  'network_devices',
  'shares',
  'guest_identity',
  'integrations',
  'lifecycle',
] as const);
const SHARE_KEYS = Object.freeze([
  'purpose',
  'lease_id',
  'source_reference_kind',
  'guest_path',
  'access',
] as const);
const IDENTITY_KEYS = Object.freeze([
  'uid',
  'gid',
  'working_directory',
  'interactive_shell',
  'login_enabled',
  'environment',
] as const);
const INTEGRATION_KEYS = Object.freeze([
  'audio',
  'clipboard',
  'graphics',
  'keyboard',
  'pointing',
  'usb',
] as const);
const LIFECYCLE_KEYS = Object.freeze([
  'fresh_vm',
  'destructive_stop_required',
  'cleanup_verification_required',
] as const);

const MEDIA_TYPES: Readonly<Record<GuestArtifactRole, string>> = Object.freeze({
  KERNEL: 'application/vnd.linux.kernel',
  INITRAMFS: 'application/vnd.linux.initramfs',
  ROOT_FILESYSTEM: 'application/vnd.dosai.squashfs',
  GUEST_AGENT: 'application/vnd.dosai.guest-agent',
});

export type GuestArtifact = Readonly<{
  readonly role: GuestArtifactRole;
  readonly package_path: string;
  readonly sha256: string;
  readonly size_bytes: number;
  readonly media_type: string;
  readonly read_only: true;
}>;

export type GuestArtifactManifest = Readonly<{
  readonly schema_id: 'urn:dosai:schema:guest-artifact-manifest:1';
  readonly schema_version: 1;
  readonly manifest_id: string;
  readonly artifact_set_version: string;
  readonly architecture: 'arm64';
  readonly boot_protocol: 'LINUX_DIRECT_BOOT';
  readonly release_status: 'CANDIDATE_UNVERIFIED';
  readonly runtime_eligible: false;
  readonly artifacts: readonly GuestArtifact[];
  readonly supply_chain: Readonly<{
    readonly build_recipe_sha256: string;
    readonly source_manifest_sha256: string;
    readonly sbom_sha256: string;
    readonly sbom_format: 'SPDX_2_3_JSON';
    readonly license_manifest_sha256: string;
    readonly clean_room_rebuild: 'NOT_PROVEN';
    readonly vulnerability_review: 'NOT_PERFORMED';
    readonly signatures_verified: false;
  }>;
}>;

export type StructuralMicroVMProfile = Readonly<{
  readonly schema_id: 'urn:dosai:schema:microvm-profile:1';
  readonly schema_version: 1;
  readonly profile_id: string;
  readonly capsule_id: string;
  readonly generation: string;
  readonly guest_manifest_sha256: string;
  readonly validation_level: 'STRUCTURAL_ONLY_NO_BOOT_ARTIFACTS';
  readonly runtime_eligible: false;
  readonly cpu_count: 1;
  readonly memory_size_bytes: 536870912;
  readonly immutable_root_filesystem: true;
  readonly writable_disk_size_bytes: 1073741824;
  readonly writable_state_reuse: false;
  readonly network_devices: readonly [];
  readonly shares: readonly [Readonly<{
    readonly purpose: 'LEASED_WORKTREE';
    readonly lease_id: string;
    readonly source_reference_kind: 'OPAQUE_LEASE_ID';
    readonly guest_path: '/workspace';
    readonly access: 'READ_WRITE';
  }>];
  readonly guest_identity: Readonly<{
    readonly uid: 1000;
    readonly gid: 1000;
    readonly working_directory: '/workspace';
    readonly interactive_shell: false;
    readonly login_enabled: false;
    readonly environment: Readonly<Record<string, never>>;
  }>;
  readonly integrations: Readonly<{
    readonly audio: false;
    readonly clipboard: false;
    readonly graphics: false;
    readonly keyboard: false;
    readonly pointing: false;
    readonly usb: false;
  }>;
  readonly lifecycle: Readonly<{
    readonly fresh_vm: true;
    readonly destructive_stop_required: true;
    readonly cleanup_verification_required: true;
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
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(errorCode);
  }
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

function exactArray(value: unknown, length: number, errorCode: string): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !== length
  ) {
    throw new TypeError(errorCode);
  }
  const expectedKeys = [...Array.from({ length }, (_, index) => String(index)), 'length'];
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key === 'symbol') ||
    ownKeys.map(String).sort().join('\0') !== expectedKeys.sort().join('\0')
  ) {
    throw new TypeError(errorCode);
  }
  const admitted: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(errorCode);
    }
    admitted.push(descriptor.value);
  }
  return admitted;
}

function digest(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new TypeError(errorCode);
  }
  return value;
}

function uuid(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !UUID_V4.test(value)) {
    throw new TypeError(errorCode);
  }
  return value;
}

export function admitGuestArtifactManifest(candidate: unknown): GuestArtifactManifest {
  const errorCode = 'DOSAI_GUEST_ARTIFACT_SCHEMA_0001';
  const manifest = exactObject(candidate, MANIFEST_KEYS, errorCode);
  if (
    manifest.schema_id !== 'urn:dosai:schema:guest-artifact-manifest:1' ||
    manifest.schema_version !== 1 ||
    manifest.architecture !== 'arm64' ||
    manifest.boot_protocol !== 'LINUX_DIRECT_BOOT' ||
    manifest.release_status !== 'CANDIDATE_UNVERIFIED' ||
    manifest.runtime_eligible !== false ||
    typeof manifest.artifact_set_version !== 'string' ||
    !DECIMAL_SEQUENCE.test(manifest.artifact_set_version)
  ) {
    throw new TypeError(errorCode);
  }

  const artifacts = exactArray(manifest.artifacts, GUEST_ARTIFACT_ROLES.length, errorCode)
    .map((candidateArtifact, index): GuestArtifact => {
      const artifact = exactObject(candidateArtifact, ARTIFACT_KEYS, errorCode);
      const expectedRole = GUEST_ARTIFACT_ROLES[index];
      if (
        expectedRole === undefined ||
        artifact.role !== expectedRole ||
        typeof artifact.package_path !== 'string' ||
        !PACKAGE_PATH.test(artifact.package_path) ||
        typeof artifact.size_bytes !== 'number' ||
        !Number.isSafeInteger(artifact.size_bytes) ||
        artifact.size_bytes < 1 ||
        artifact.size_bytes > 4_294_967_296 ||
        artifact.media_type !== MEDIA_TYPES[expectedRole] ||
        artifact.read_only !== true
      ) {
        throw new TypeError('DOSAI_GUEST_ARTIFACT_RELATION_0001');
      }
      return Object.freeze({
        role: expectedRole,
        package_path: artifact.package_path,
        sha256: digest(artifact.sha256, errorCode),
        size_bytes: artifact.size_bytes,
        media_type: artifact.media_type,
        read_only: true,
      });
    });
  if (new Set(artifacts.map(({ package_path }) => package_path)).size !== artifacts.length) {
    throw new TypeError('DOSAI_GUEST_ARTIFACT_RELATION_0001');
  }

  const supplyChain = exactObject(manifest.supply_chain, SUPPLY_CHAIN_KEYS, errorCode);
  if (
    supplyChain.sbom_format !== 'SPDX_2_3_JSON' ||
    supplyChain.clean_room_rebuild !== 'NOT_PROVEN' ||
    supplyChain.vulnerability_review !== 'NOT_PERFORMED' ||
    supplyChain.signatures_verified !== false
  ) {
    throw new TypeError(errorCode);
  }
  const admittedSupplyChain = Object.freeze({
    build_recipe_sha256: digest(supplyChain.build_recipe_sha256, errorCode),
    source_manifest_sha256: digest(supplyChain.source_manifest_sha256, errorCode),
    sbom_sha256: digest(supplyChain.sbom_sha256, errorCode),
    sbom_format: 'SPDX_2_3_JSON' as const,
    license_manifest_sha256: digest(supplyChain.license_manifest_sha256, errorCode),
    clean_room_rebuild: 'NOT_PROVEN' as const,
    vulnerability_review: 'NOT_PERFORMED' as const,
    signatures_verified: false as const,
  });

  return Object.freeze({
    schema_id: 'urn:dosai:schema:guest-artifact-manifest:1',
    schema_version: 1,
    manifest_id: uuid(manifest.manifest_id, errorCode),
    artifact_set_version: manifest.artifact_set_version,
    architecture: 'arm64',
    boot_protocol: 'LINUX_DIRECT_BOOT',
    release_status: 'CANDIDATE_UNVERIFIED',
    runtime_eligible: false,
    artifacts: Object.freeze(artifacts),
    supply_chain: admittedSupplyChain,
  });
}

export function admitStructuralMicroVMProfile(candidate: unknown): StructuralMicroVMProfile {
  const errorCode = 'DOSAI_MICROVM_PROFILE_SCHEMA_0001';
  const profile = exactObject(candidate, PROFILE_KEYS, errorCode);
  if (
    profile.schema_id !== 'urn:dosai:schema:microvm-profile:1' ||
    profile.schema_version !== 1 ||
    typeof profile.generation !== 'string' ||
    !DECIMAL_SEQUENCE.test(profile.generation) ||
    profile.validation_level !== 'STRUCTURAL_ONLY_NO_BOOT_ARTIFACTS' ||
    profile.runtime_eligible !== false ||
    profile.cpu_count !== 1 ||
    profile.memory_size_bytes !== 536_870_912 ||
    profile.immutable_root_filesystem !== true ||
    profile.writable_disk_size_bytes !== 1_073_741_824 ||
    profile.writable_state_reuse !== false
  ) {
    throw new TypeError(errorCode);
  }
  exactArray(profile.network_devices, 0, errorCode);

  const shareCandidate = exactArray(profile.shares, 1, errorCode)[0];
  const share = exactObject(shareCandidate, SHARE_KEYS, errorCode);
  if (
    share.purpose !== 'LEASED_WORKTREE' ||
    share.source_reference_kind !== 'OPAQUE_LEASE_ID' ||
    share.guest_path !== '/workspace' ||
    share.access !== 'READ_WRITE'
  ) {
    throw new TypeError('DOSAI_MICROVM_PROFILE_RELATION_0001');
  }
  const admittedShare = Object.freeze({
    purpose: 'LEASED_WORKTREE' as const,
    lease_id: uuid(share.lease_id, errorCode),
    source_reference_kind: 'OPAQUE_LEASE_ID' as const,
    guest_path: '/workspace' as const,
    access: 'READ_WRITE' as const,
  });

  const identity = exactObject(profile.guest_identity, IDENTITY_KEYS, errorCode);
  const environment = exactObject(identity.environment, [], errorCode);
  if (
    identity.uid !== 1000 ||
    identity.gid !== 1000 ||
    identity.working_directory !== '/workspace' ||
    identity.interactive_shell !== false ||
    identity.login_enabled !== false
  ) {
    throw new TypeError(errorCode);
  }

  const integrations = exactObject(profile.integrations, INTEGRATION_KEYS, errorCode);
  if (INTEGRATION_KEYS.some((key) => integrations[key] !== false)) {
    throw new TypeError(errorCode);
  }
  const lifecycle = exactObject(profile.lifecycle, LIFECYCLE_KEYS, errorCode);
  if (
    lifecycle.fresh_vm !== true ||
    lifecycle.destructive_stop_required !== true ||
    lifecycle.cleanup_verification_required !== true
  ) {
    throw new TypeError(errorCode);
  }

  return Object.freeze({
    schema_id: 'urn:dosai:schema:microvm-profile:1',
    schema_version: 1,
    profile_id: uuid(profile.profile_id, errorCode),
    capsule_id: uuid(profile.capsule_id, errorCode),
    generation: profile.generation,
    guest_manifest_sha256: digest(profile.guest_manifest_sha256, errorCode),
    validation_level: 'STRUCTURAL_ONLY_NO_BOOT_ARTIFACTS',
    runtime_eligible: false,
    cpu_count: 1,
    memory_size_bytes: 536_870_912,
    immutable_root_filesystem: true,
    writable_disk_size_bytes: 1_073_741_824,
    writable_state_reuse: false,
    network_devices: Object.freeze([]) as readonly [],
    shares: Object.freeze([admittedShare]) as StructuralMicroVMProfile['shares'],
    guest_identity: Object.freeze({
      uid: 1000,
      gid: 1000,
      working_directory: '/workspace' as const,
      interactive_shell: false as const,
      login_enabled: false as const,
      environment: Object.freeze(environment) as Readonly<Record<string, never>>,
    }),
    integrations: Object.freeze({
      audio: false,
      clipboard: false,
      graphics: false,
      keyboard: false,
      pointing: false,
      usb: false,
    }),
    lifecycle: Object.freeze({
      fresh_vm: true,
      destructive_stop_required: true,
      cleanup_verification_required: true,
    }),
  });
}
