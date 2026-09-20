export const GUEST_COMPOSITION_ARTIFACT_ROLES = Object.freeze([
  'KERNEL',
  'INITRAMFS',
  'ROOT_FILESYSTEM',
  'GUEST_AGENT',
] as const);

type ArtifactRole = (typeof GUEST_COMPOSITION_ARTIFACT_ROLES)[number];
type FilesystemRole = 'INITRAMFS' | 'ROOT_FILESYSTEM';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL_SEQUENCE = /^(0|[1-9][0-9]*)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PACKAGE_PATH = /^guest-artifacts\/v2\/[a-z0-9][a-z0-9._-]{0,127}$/;

const MANIFEST_KEYS = Object.freeze([
  'schema_id', 'schema_version', 'manifest_id', 'artifact_set_version', 'architecture',
  'boot_protocol', 'release_status', 'runtime_eligible', 'artifacts', 'supply_chain',
  'composition',
] as const);
const ARTIFACT_KEYS = Object.freeze([
  'role', 'package_path', 'sha256', 'size_bytes', 'media_type', 'read_only',
] as const);
const SUPPLY_CHAIN_KEYS = Object.freeze([
  'build_recipe_sha256', 'source_manifest_sha256', 'sbom_sha256', 'sbom_format',
  'license_manifest_sha256', 'clean_room_rebuild', 'vulnerability_review',
  'signatures_verified',
] as const);
const COMPOSITION_KEYS = Object.freeze([
  'verification_status', 'kernel_command_line', 'kernel_config', 'filesystem_inventories',
  'boot_chain', 'embedded_guest_agent', 'verification',
] as const);
const EVIDENCE_FILE_KEYS = Object.freeze([
  'package_path', 'sha256', 'size_bytes', 'media_type',
] as const);
const KERNEL_CONFIG_KEYS = Object.freeze([
  'package_path', 'sha256', 'size_bytes', 'media_type', 'loadable_modules',
  'module_loading', 'debug_interfaces', 'network_stack', 'interactive_console',
] as const);
const INVENTORY_KEYS = Object.freeze([
  'filesystem_role', 'package_path', 'sha256', 'size_bytes', 'media_type', 'format',
  'entry_count',
] as const);
const BOOT_CHAIN_KEYS = Object.freeze([
  'initramfs_entry_path', 'immutable_root_device', 'immutable_root_filesystem',
  'immutable_root_read_only', 'guest_agent_path', 'alternate_init_allowed',
  'rescue_shell_allowed', 'login_allowed',
] as const);
const EMBEDDED_AGENT_KEYS = Object.freeze(['filesystem_role', 'path', 'sha256'] as const);
const VERIFICATION_KEYS = Object.freeze([
  'kernel_command_line_reviewed', 'kernel_config_reviewed', 'inventories_verified',
  'embedded_agent_digest_matched', 'boot_chain_verified',
] as const);

const MEDIA_TYPES: Readonly<Record<ArtifactRole, string>> = Object.freeze({
  KERNEL: 'application/vnd.linux.kernel',
  INITRAMFS: 'application/vnd.linux.initramfs',
  ROOT_FILESYSTEM: 'application/vnd.dosai.squashfs',
  GUEST_AGENT: 'application/vnd.dosai.guest-agent',
});

type Artifact = Readonly<{
  role: ArtifactRole;
  package_path: string;
  sha256: string;
  size_bytes: number;
  media_type: string;
  read_only: true;
}>;

type EvidenceFile = Readonly<{
  package_path: string;
  sha256: string;
  size_bytes: number;
  media_type: 'text/plain; charset=us-ascii';
}>;

type FilesystemInventory = Readonly<{
  filesystem_role: FilesystemRole;
  package_path: string;
  sha256: string;
  size_bytes: number;
  media_type: 'application/vnd.dosai.fs-inventory+json';
  format: 'DOSAI_FS_INVENTORY_V1';
  entry_count: number;
}>;

export type GuestCompositionManifest = Readonly<{
  schema_id: 'urn:dosai:schema:guest-artifact-manifest:2';
  schema_version: 2;
  manifest_id: string;
  artifact_set_version: string;
  architecture: 'arm64';
  boot_protocol: 'LINUX_DIRECT_BOOT';
  release_status: 'COMPOSITION_DECLARED_UNVERIFIED';
  runtime_eligible: false;
  artifacts: readonly Artifact[];
  supply_chain: Readonly<{
    build_recipe_sha256: string;
    source_manifest_sha256: string;
    sbom_sha256: string;
    sbom_format: 'SPDX_2_3_JSON';
    license_manifest_sha256: string;
    clean_room_rebuild: 'NOT_PROVEN';
    vulnerability_review: 'NOT_PERFORMED';
    signatures_verified: false;
  }>;
  composition: Readonly<{
    verification_status: 'NOT_PERFORMED';
    kernel_command_line: EvidenceFile;
    kernel_config: Readonly<{
      package_path: string;
      sha256: string;
      size_bytes: number;
      media_type: 'text/plain; charset=us-ascii';
      loadable_modules: false;
      module_loading: false;
      debug_interfaces: false;
      network_stack: false;
      interactive_console: false;
    }>;
    filesystem_inventories: readonly [FilesystemInventory, FilesystemInventory];
    boot_chain: Readonly<{
      initramfs_entry_path: '/init';
      immutable_root_device: '/dev/vda';
      immutable_root_filesystem: 'squashfs';
      immutable_root_read_only: true;
      guest_agent_path: '/sbin/dosai-guest-agent';
      alternate_init_allowed: false;
      rescue_shell_allowed: false;
      login_allowed: false;
    }>;
    embedded_guest_agent: Readonly<{
      filesystem_role: 'ROOT_FILESYSTEM';
      path: '/sbin/dosai-guest-agent';
      sha256: string;
    }>;
    verification: Readonly<{
      kernel_command_line_reviewed: false;
      kernel_config_reviewed: false;
      inventories_verified: false;
      embedded_agent_digest_matched: false;
      boot_chain_verified: false;
    }>;
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
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== length) {
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
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(errorCode);
  return value;
}

function packagePath(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !PACKAGE_PATH.test(value)) throw new TypeError(errorCode);
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, errorCode: string): number {
  if (
    typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum
  ) {
    throw new TypeError(errorCode);
  }
  return value;
}

function evidenceFile(candidate: unknown, errorCode: string): EvidenceFile {
  const value = exactObject(candidate, EVIDENCE_FILE_KEYS, errorCode);
  if (value.media_type !== 'text/plain; charset=us-ascii') throw new TypeError(errorCode);
  return Object.freeze({
    package_path: packagePath(value.package_path, errorCode),
    sha256: digest(value.sha256, errorCode),
    size_bytes: boundedInteger(value.size_bytes, 1, 4_096, errorCode),
    media_type: 'text/plain; charset=us-ascii',
  });
}

export function admitGuestCompositionManifest(candidate: unknown): GuestCompositionManifest {
  const errorCode = 'DOSAI_GUEST_COMPOSITION_SCHEMA_0001';
  const relationError = 'DOSAI_GUEST_COMPOSITION_RELATION_0001';
  const manifest = exactObject(candidate, MANIFEST_KEYS, errorCode);
  if (
    manifest.schema_id !== 'urn:dosai:schema:guest-artifact-manifest:2' ||
    manifest.schema_version !== 2 ||
    typeof manifest.manifest_id !== 'string' || !UUID_V4.test(manifest.manifest_id) ||
    typeof manifest.artifact_set_version !== 'string' ||
    !DECIMAL_SEQUENCE.test(manifest.artifact_set_version) ||
    manifest.architecture !== 'arm64' ||
    manifest.boot_protocol !== 'LINUX_DIRECT_BOOT' ||
    manifest.release_status !== 'COMPOSITION_DECLARED_UNVERIFIED' ||
    manifest.runtime_eligible !== false
  ) {
    throw new TypeError(errorCode);
  }

  const artifacts = exactArray(manifest.artifacts, 4, errorCode).map((candidateArtifact, index) => {
    const artifact = exactObject(candidateArtifact, ARTIFACT_KEYS, errorCode);
    const role = GUEST_COMPOSITION_ARTIFACT_ROLES[index];
    if (
      role === undefined || artifact.role !== role ||
      typeof artifact.size_bytes !== 'number' || !Number.isSafeInteger(artifact.size_bytes) ||
      artifact.size_bytes < 1 || artifact.size_bytes > 4_294_967_296 ||
      artifact.media_type !== MEDIA_TYPES[role] || artifact.read_only !== true
    ) {
      throw new TypeError(relationError);
    }
    return Object.freeze({
      role,
      package_path: packagePath(artifact.package_path, errorCode),
      sha256: digest(artifact.sha256, errorCode),
      size_bytes: artifact.size_bytes,
      media_type: artifact.media_type,
      read_only: true as const,
    });
  });

  const supplyChain = exactObject(manifest.supply_chain, SUPPLY_CHAIN_KEYS, errorCode);
  if (
    supplyChain.sbom_format !== 'SPDX_2_3_JSON' ||
    supplyChain.clean_room_rebuild !== 'NOT_PROVEN' ||
    supplyChain.vulnerability_review !== 'NOT_PERFORMED' ||
    supplyChain.signatures_verified !== false
  ) {
    throw new TypeError(errorCode);
  }

  const composition = exactObject(manifest.composition, COMPOSITION_KEYS, errorCode);
  if (composition.verification_status !== 'NOT_PERFORMED') throw new TypeError(errorCode);
  const kernelCommandLine = evidenceFile(composition.kernel_command_line, errorCode);

  const kernelConfigCandidate = exactObject(composition.kernel_config, KERNEL_CONFIG_KEYS, errorCode);
  if (
    kernelConfigCandidate.loadable_modules !== false ||
    kernelConfigCandidate.module_loading !== false ||
    kernelConfigCandidate.debug_interfaces !== false ||
    kernelConfigCandidate.network_stack !== false ||
    kernelConfigCandidate.interactive_console !== false ||
    kernelConfigCandidate.media_type !== 'text/plain; charset=us-ascii'
  ) {
    throw new TypeError(errorCode);
  }
  const kernelConfig = Object.freeze({
    package_path: packagePath(kernelConfigCandidate.package_path, errorCode),
    sha256: digest(kernelConfigCandidate.sha256, errorCode),
    size_bytes: boundedInteger(kernelConfigCandidate.size_bytes, 1, 1_048_576, errorCode),
    media_type: 'text/plain; charset=us-ascii' as const,
    loadable_modules: false as const,
    module_loading: false as const,
    debug_interfaces: false as const,
    network_stack: false as const,
    interactive_console: false as const,
  });

  const filesystemRoles = ['INITRAMFS', 'ROOT_FILESYSTEM'] as const;
  const inventories = exactArray(composition.filesystem_inventories, 2, errorCode)
    .map((candidateInventory, index): FilesystemInventory => {
      const inventory = exactObject(candidateInventory, INVENTORY_KEYS, errorCode);
      const filesystemRole = filesystemRoles[index];
      if (
        filesystemRole === undefined || inventory.filesystem_role !== filesystemRole ||
        inventory.format !== 'DOSAI_FS_INVENTORY_V1' ||
        inventory.media_type !== 'application/vnd.dosai.fs-inventory+json' ||
        typeof inventory.entry_count !== 'number' || !Number.isSafeInteger(inventory.entry_count) ||
        inventory.entry_count < 1 || inventory.entry_count > 65_536
      ) {
        throw new TypeError(relationError);
      }
      return Object.freeze({
        filesystem_role: filesystemRole,
        package_path: packagePath(inventory.package_path, errorCode),
        sha256: digest(inventory.sha256, errorCode),
        size_bytes: boundedInteger(inventory.size_bytes, 2, 16_777_216, errorCode),
        media_type: 'application/vnd.dosai.fs-inventory+json',
        format: 'DOSAI_FS_INVENTORY_V1',
        entry_count: inventory.entry_count,
      });
    });

  const bootChain = exactObject(composition.boot_chain, BOOT_CHAIN_KEYS, errorCode);
  if (
    bootChain.initramfs_entry_path !== '/init' ||
    bootChain.immutable_root_device !== '/dev/vda' ||
    bootChain.immutable_root_filesystem !== 'squashfs' ||
    bootChain.immutable_root_read_only !== true ||
    bootChain.guest_agent_path !== '/sbin/dosai-guest-agent' ||
    bootChain.alternate_init_allowed !== false ||
    bootChain.rescue_shell_allowed !== false ||
    bootChain.login_allowed !== false
  ) {
    throw new TypeError(errorCode);
  }

  const embeddedAgent = exactObject(composition.embedded_guest_agent, EMBEDDED_AGENT_KEYS, errorCode);
  const embeddedAgentDigest = digest(embeddedAgent.sha256, errorCode);
  const guestAgentArtifact = artifacts[3];
  if (
    embeddedAgent.filesystem_role !== 'ROOT_FILESYSTEM' ||
    embeddedAgent.path !== '/sbin/dosai-guest-agent' ||
    guestAgentArtifact === undefined || embeddedAgentDigest !== guestAgentArtifact.sha256
  ) {
    throw new TypeError(relationError);
  }

  const verification = exactObject(composition.verification, VERIFICATION_KEYS, errorCode);
  if (VERIFICATION_KEYS.some((key) => verification[key] !== false)) throw new TypeError(errorCode);

  const packagePaths = [
    ...artifacts.map(({ package_path }) => package_path),
    kernelCommandLine.package_path,
    kernelConfig.package_path,
    ...inventories.map(({ package_path }) => package_path),
  ];
  if (new Set(packagePaths).size !== packagePaths.length) throw new TypeError(relationError);

  return Object.freeze({
    schema_id: 'urn:dosai:schema:guest-artifact-manifest:2',
    schema_version: 2,
    manifest_id: manifest.manifest_id,
    artifact_set_version: manifest.artifact_set_version,
    architecture: 'arm64',
    boot_protocol: 'LINUX_DIRECT_BOOT',
    release_status: 'COMPOSITION_DECLARED_UNVERIFIED',
    runtime_eligible: false,
    artifacts: Object.freeze(artifacts),
    supply_chain: Object.freeze({
      build_recipe_sha256: digest(supplyChain.build_recipe_sha256, errorCode),
      source_manifest_sha256: digest(supplyChain.source_manifest_sha256, errorCode),
      sbom_sha256: digest(supplyChain.sbom_sha256, errorCode),
      sbom_format: 'SPDX_2_3_JSON',
      license_manifest_sha256: digest(supplyChain.license_manifest_sha256, errorCode),
      clean_room_rebuild: 'NOT_PROVEN',
      vulnerability_review: 'NOT_PERFORMED',
      signatures_verified: false,
    }),
    composition: Object.freeze({
      verification_status: 'NOT_PERFORMED',
      kernel_command_line: kernelCommandLine,
      kernel_config: kernelConfig,
      filesystem_inventories: Object.freeze(inventories) as GuestCompositionManifest['composition']['filesystem_inventories'],
      boot_chain: Object.freeze({
        initramfs_entry_path: '/init',
        immutable_root_device: '/dev/vda',
        immutable_root_filesystem: 'squashfs',
        immutable_root_read_only: true,
        guest_agent_path: '/sbin/dosai-guest-agent',
        alternate_init_allowed: false,
        rescue_shell_allowed: false,
        login_allowed: false,
      }),
      embedded_guest_agent: Object.freeze({
        filesystem_role: 'ROOT_FILESYSTEM',
        path: '/sbin/dosai-guest-agent',
        sha256: embeddedAgentDigest,
      }),
      verification: Object.freeze({
        kernel_command_line_reviewed: false,
        kernel_config_reviewed: false,
        inventories_verified: false,
        embedded_agent_digest_matched: false,
        boot_chain_verified: false,
      }),
    }),
  });
}
