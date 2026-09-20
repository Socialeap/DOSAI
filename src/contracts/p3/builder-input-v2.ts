import {
  admitLinuxBuilderManifest,
  type LinuxBuilderManifest,
} from './builder-input.ts';

const SHA256 = /^[0-9a-f]{64}$/;
const PACKAGE_NAME = /^[a-z0-9][a-z0-9+.-]{0,95}$/;
const PACKAGE_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+:~_-]{0,127}$/;
const SNAPSHOT_TIMESTAMP = /^[0-9]{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]Z$/;
const POOL_PATH = /^pool\/(?:updates\/)?main\/[a-z0-9+.-]+\/[a-z0-9+.-]+\/[0-9A-Za-z+._%~:-]+_(?:amd64|all)\.deb$/;

const MANIFEST_KEYS = Object.freeze([
  'schema_id', 'schema_version', 'manifest_id', 'builder_set_version', 'scope', 'status',
  'image_preparation_allowed', 'guest_build_allowed', 'release_evidence_eligible',
  'platform', 'base_image', 'package_snapshot', 'recipe', 'output', 'execution_policy',
  'verification',
] as const);
const SNAPSHOT_KEYS = Object.freeze([
  'service', 'timestamp', 'sources_list_sha256', 'archive_keyring_sha256',
  'base_package_manifest_sha256', 'direct_package_intent_sha256', 'release_files',
  'package_indexes', 'packages', 'resolution_report_sha256', 'installed_inventory_sha256',
  'output_package_manager_network_configured', 'release_signatures_verified',
  'indexes_verified', 'closure_complete',
] as const);
const RELEASE_KEYS = Object.freeze([
  'archive', 'suite', 'path', 'snapshot_uri', 'sha256', 'size_bytes',
] as const);
const INDEX_KEYS = Object.freeze([
  'archive', 'suite', 'component', 'architecture', 'path', 'snapshot_uri', 'sha256',
  'size_bytes', 'release_file_sha256',
] as const);
const PACKAGE_KEYS = Object.freeze([
  'name', 'version', 'architecture', 'archive', 'pool_path', 'size_bytes', 'deb_sha256',
  'source_name', 'source_version',
] as const);

const SNAPSHOT_LAYOUT = Object.freeze([
  Object.freeze({ archive: 'debian', suite: 'trixie' }),
  Object.freeze({ archive: 'debian', suite: 'trixie-updates' }),
  Object.freeze({ archive: 'debian-security', suite: 'trixie-security' }),
] as const);

type SnapshotArchive = 'debian' | 'debian-security';
type SnapshotSuite = 'trixie' | 'trixie-updates' | 'trixie-security';

type ReleaseFile = Readonly<{
  archive: SnapshotArchive;
  suite: SnapshotSuite;
  path: string;
  snapshot_uri: string;
  sha256: string;
  size_bytes: number;
}>;

type PackageIndex = Readonly<{
  archive: SnapshotArchive;
  suite: SnapshotSuite;
  component: 'main';
  architecture: 'amd64';
  path: string;
  snapshot_uri: string;
  sha256: string;
  size_bytes: number;
  release_file_sha256: string;
}>;

type BuilderPackageV2 = Readonly<{
  name: string;
  version: string;
  architecture: 'amd64' | 'all';
  archive: SnapshotArchive;
  pool_path: string;
  size_bytes: number;
  deb_sha256: string;
  source_name: string;
  source_version: string;
}>;

export type LinuxBuilderManifestV2 = Readonly<{
  schema_id: 'urn:dosai:schema:linux-builder-manifest:2';
  schema_version: 2;
  manifest_id: string;
  builder_set_version: string;
  scope: LinuxBuilderManifest['scope'];
  status: LinuxBuilderManifest['status'];
  image_preparation_allowed: false;
  guest_build_allowed: false;
  release_evidence_eligible: false;
  platform: LinuxBuilderManifest['platform'];
  base_image: LinuxBuilderManifest['base_image'];
  package_snapshot: Readonly<{
    service: 'snapshot.debian.org';
    timestamp: string;
    sources_list_sha256: string;
    archive_keyring_sha256: string;
    base_package_manifest_sha256: string;
    direct_package_intent_sha256: string;
    release_files: readonly ReleaseFile[];
    package_indexes: readonly PackageIndex[];
    packages: readonly BuilderPackageV2[];
    resolution_report_sha256: string;
    installed_inventory_sha256: string;
    output_package_manager_network_configured: false;
    release_signatures_verified: false;
    indexes_verified: false;
    closure_complete: false;
  }>;
  recipe: LinuxBuilderManifest['recipe'];
  output: LinuxBuilderManifest['output'];
  execution_policy: LinuxBuilderManifest['execution_policy'];
  verification: LinuxBuilderManifest['verification'];
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

function boundedInteger(value: unknown, maximum: number, errorCode: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new TypeError(errorCode);
  }
  return value as number;
}

function snapshotUri(
  archive: SnapshotArchive,
  timestamp: string,
  path: string,
): string {
  return `https://snapshot.debian.org/archive/${archive}/${timestamp}/${path}`;
}

export function admitLinuxBuilderManifestV2(candidate: unknown): LinuxBuilderManifestV2 {
  const errorCode = 'DOSAI_LINUX_BUILDER_SCHEMA_0002';
  const relationError = 'DOSAI_LINUX_BUILDER_RELATION_0002';
  const manifest = exactObject(candidate, MANIFEST_KEYS, errorCode);
  if (
    manifest.schema_id !== 'urn:dosai:schema:linux-builder-manifest:2' ||
    manifest.schema_version !== 2
  ) {
    throw new TypeError(errorCode);
  }

  const snapshot = exactObject(manifest.package_snapshot, SNAPSHOT_KEYS, errorCode);
  if (
    snapshot.service !== 'snapshot.debian.org' ||
    snapshot.output_package_manager_network_configured !== false ||
    snapshot.release_signatures_verified !== false ||
    snapshot.indexes_verified !== false ||
    snapshot.closure_complete !== false
  ) {
    throw new TypeError(errorCode);
  }
  const timestamp = matchingString(snapshot.timestamp, SNAPSHOT_TIMESTAMP, 16, errorCode);

  const legacy = admitLinuxBuilderManifest({
    ...manifest,
    schema_id: 'urn:dosai:schema:linux-builder-manifest:1',
    schema_version: 1,
    package_snapshot: {
      service: 'snapshot.debian.org',
      timestamp,
      release_file_sha256: '0'.repeat(64),
      sources_list_sha256: digest(snapshot.sources_list_sha256, errorCode),
      packages: [{
        name: 'placeholder',
        version: '1',
        architecture: 'amd64',
        deb_sha256: '0'.repeat(64),
      }],
      output_package_manager_network_configured: false,
    },
  });

  const releaseCandidates = exactArray(snapshot.release_files, 3, 3, errorCode);
  const releaseFiles = releaseCandidates.map((candidateRelease, index): ReleaseFile => {
    const release = exactObject(candidateRelease, RELEASE_KEYS, errorCode);
    const expected = SNAPSHOT_LAYOUT[index];
    if (expected === undefined || release.archive !== expected.archive || release.suite !== expected.suite) {
      throw new TypeError(relationError);
    }
    const path = `dists/${expected.suite}/InRelease`;
    if (release.path !== path || release.snapshot_uri !== snapshotUri(expected.archive, timestamp, path)) {
      throw new TypeError(relationError);
    }
    return Object.freeze({
      archive: expected.archive,
      suite: expected.suite,
      path,
      snapshot_uri: snapshotUri(expected.archive, timestamp, path),
      sha256: digest(release.sha256, errorCode),
      size_bytes: boundedInteger(release.size_bytes, 16_777_216, errorCode),
    });
  });

  const indexCandidates = exactArray(snapshot.package_indexes, 3, 3, errorCode);
  const packageIndexes = indexCandidates.map((candidateIndex, index): PackageIndex => {
    const packageIndex = exactObject(candidateIndex, INDEX_KEYS, errorCode);
    const expected = SNAPSHOT_LAYOUT[index];
    const release = releaseFiles[index];
    if (
      expected === undefined ||
      release === undefined ||
      packageIndex.archive !== expected.archive ||
      packageIndex.suite !== expected.suite ||
      packageIndex.component !== 'main' ||
      packageIndex.architecture !== 'amd64' ||
      packageIndex.release_file_sha256 !== release.sha256
    ) {
      throw new TypeError(relationError);
    }
    const path = `dists/${expected.suite}/main/binary-amd64/Packages.xz`;
    if (
      packageIndex.path !== path ||
      packageIndex.snapshot_uri !== snapshotUri(expected.archive, timestamp, path)
    ) {
      throw new TypeError(relationError);
    }
    return Object.freeze({
      archive: expected.archive,
      suite: expected.suite,
      component: 'main',
      architecture: 'amd64',
      path,
      snapshot_uri: snapshotUri(expected.archive, timestamp, path),
      sha256: digest(packageIndex.sha256, errorCode),
      size_bytes: boundedInteger(packageIndex.size_bytes, 268_435_456, errorCode),
      release_file_sha256: release.sha256,
    });
  });

  const packageCandidates = exactArray(snapshot.packages, 1, 256, errorCode);
  const packages = packageCandidates.map((candidatePackage): BuilderPackageV2 => {
    const packageRecord = exactObject(candidatePackage, PACKAGE_KEYS, errorCode);
    const architecture = packageRecord.architecture;
    const archive = packageRecord.archive;
    if (
      (architecture !== 'amd64' && architecture !== 'all') ||
      (archive !== 'debian' && archive !== 'debian-security')
    ) {
      throw new TypeError(errorCode);
    }
    const poolPath = matchingString(packageRecord.pool_path, POOL_PATH, 512, errorCode);
    if (!poolPath.endsWith(`_${architecture}.deb`)) throw new TypeError(relationError);
    return Object.freeze({
      name: matchingString(packageRecord.name, PACKAGE_NAME, 96, errorCode),
      version: matchingString(packageRecord.version, PACKAGE_VERSION, 128, errorCode),
      architecture,
      archive,
      pool_path: poolPath,
      size_bytes: boundedInteger(packageRecord.size_bytes, 1_073_741_824, errorCode),
      deb_sha256: digest(packageRecord.deb_sha256, errorCode),
      source_name: matchingString(packageRecord.source_name, PACKAGE_NAME, 96, errorCode),
      source_version: matchingString(packageRecord.source_version, PACKAGE_VERSION, 128, errorCode),
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

  return Object.freeze({
    schema_id: 'urn:dosai:schema:linux-builder-manifest:2',
    schema_version: 2,
    manifest_id: legacy.manifest_id,
    builder_set_version: legacy.builder_set_version,
    scope: legacy.scope,
    status: legacy.status,
    image_preparation_allowed: false,
    guest_build_allowed: false,
    release_evidence_eligible: false,
    platform: legacy.platform,
    base_image: legacy.base_image,
    package_snapshot: Object.freeze({
      service: 'snapshot.debian.org',
      timestamp,
      sources_list_sha256: digest(snapshot.sources_list_sha256, errorCode),
      archive_keyring_sha256: digest(snapshot.archive_keyring_sha256, errorCode),
      base_package_manifest_sha256: digest(snapshot.base_package_manifest_sha256, errorCode),
      direct_package_intent_sha256: digest(snapshot.direct_package_intent_sha256, errorCode),
      release_files: Object.freeze(releaseFiles),
      package_indexes: Object.freeze(packageIndexes),
      packages: Object.freeze(packages),
      resolution_report_sha256: digest(snapshot.resolution_report_sha256, errorCode),
      installed_inventory_sha256: digest(snapshot.installed_inventory_sha256, errorCode),
      output_package_manager_network_configured: false,
      release_signatures_verified: false,
      indexes_verified: false,
      closure_complete: false,
    }),
    recipe: legacy.recipe,
    output: legacy.output,
    execution_policy: legacy.execution_policy,
    verification: legacy.verification,
  });
}
