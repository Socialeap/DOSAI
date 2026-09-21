export const GUEST_SOURCE_ROLES = Object.freeze([
  'BUILD_SYSTEM',
  'TOOLCHAIN_BOOTSTRAP',
  'TOOLCHAIN_FINAL',
  'KERNEL',
  'ROOT_FILESYSTEM_PACKAGE',
  'GUEST_AGENT_DEPENDENCY',
] as const);

type GuestSourceRole = (typeof GUEST_SOURCE_ROLES)[number];
type SignatureAvailability = 'REQUIRED' | 'NOT_PUBLISHED';
type PatchKind = 'DOSAI_LOCAL' | 'UPSTREAM_BACKPORT';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL_SEQUENCE = /^(0|[1-9][0-9]*)$/;
const NORMALIZED_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ARCHIVE_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}\.(?:tar\.(?:gz|xz|bz2)|tgz|zip)$/;
const SAFE_PATH = /^[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*(?:\/[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*)*$/;
const PATCH_PATH = /^guest-build\/patches\/[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*\/[0-9]{4}-[a-z0-9][a-z0-9.-]{0,95}\.patch$/;
const LICENSE_EXPRESSION = /^[A-Za-z0-9][A-Za-z0-9 .()+-]{0,127}$/;
const FINGERPRINT = /^(?:[0-9A-F]{40}|[0-9A-F]{64})$/;

type ParsedUrl = Readonly<{
  protocol: string;
  username: string;
  password: string;
  port: string;
  search: string;
  hash: string;
  pathname: string;
  href: string;
}>;
type UrlConstructor = new (input: string) => ParsedUrl;
const STANDARD_URL = Reflect.get(globalThis, 'URL') as UrlConstructor | undefined;

const MANIFEST_KEYS = Object.freeze([
  'schema_id', 'schema_version', 'manifest_id', 'source_set_version', 'scope', 'status',
  'build_allowed', 'runtime_eligible', 'sources', 'patches', 'toolchain', 'closure',
] as const);
const SOURCE_KEYS = Object.freeze([
  'source_id', 'role', 'component', 'version', 'archive_name', 'canonical_url', 'sha256',
  'size_bytes', 'license_expression', 'license_files', 'signature',
] as const);
const SIGNATURE_KEYS = Object.freeze([
  'availability', 'signature_url', 'signer_fingerprint', 'mathematical_verification',
  'trust_verification',
] as const);
const PATCH_KEYS = Object.freeze([
  'patch_id', 'target_source_id', 'apply_order', 'kind', 'repository_path', 'sha256',
  'expected_touched_paths', 'application',
] as const);
const APPLICATION_KEYS = Object.freeze([
  'verifier', 'strip_components', 'fuzz_allowed', 'offsets_allowed',
  'backup_files_allowed', 'reject_files_allowed', 'verified',
] as const);
const TOOLCHAIN_KEYS = Object.freeze([
  'build_system_source_id', 'build_system_version', 'build_system_sha256',
  'bootstrap_source_ids', 'stage5_source_id', 'stage5_version', 'stage5_sha256',
  'final_source_id', 'final_version', 'final_sha256', 'accepted_patch_id',
  'required_provider', 'prebuilt_provider_allowed', 'provider_configuration_verified',
  'target_os', 'target_arch', 'cgo_enabled', 'build_environment',
] as const);
const ENVIRONMENT_KEYS = Object.freeze([
  'GOFLAGS', 'GOPROXY', 'GOSUMDB', 'GOTOOLCHAIN', 'GOWORK',
] as const);
const CLOSURE_KEYS = Object.freeze([
  'sealed_bundle_path', 'sealed_bundle_sha256', 'sealed_bundle_size_bytes',
  'canonical_inventory_sha256', 'declared_source_count', 'declared_patch_count',
  'source_digests_verified', 'upstream_signatures_verified', 'signer_trust_verified',
  'patches_verified', 'provider_verified', 'network_during_build', 'shared_cache', 'complete',
] as const);

const BOOTSTRAP_SOURCE_IDS = Object.freeze([
  'go-bootstrap-stage1',
  'go-bootstrap-stage2',
  'go-bootstrap-stage3',
  'go-bootstrap-stage4',
  'go-bootstrap-stage5',
] as const);

const BOOTSTRAP_SOURCES = Object.freeze([
  Object.freeze({
    sourceId: 'go-bootstrap-stage1',
    version: '1.4-bootstrap-20171003',
    archiveName: 'go1.4-bootstrap-20171003.tar.gz',
    canonicalUrl: 'https://dl.google.com/go/go1.4-bootstrap-20171003.tar.gz',
    sha256: 'f4ff5b5eb3a3cae1c993723f3eab519c5bae18866b5e5f96fe1102f0cb5c3e52',
  }),
  Object.freeze({
    sourceId: 'go-bootstrap-stage2',
    version: '1.19.13',
    archiveName: 'go1.19.13.src.tar.gz',
    canonicalUrl: 'https://go.dev/dl/go1.19.13.src.tar.gz',
    sha256: 'ccf36b53fb0024a017353c3ddb22c1f00bc7a8073c6aac79042da24ee34434d3',
  }),
  Object.freeze({
    sourceId: 'go-bootstrap-stage3',
    version: '1.21.8',
    archiveName: 'go1.21.8.src.tar.gz',
    canonicalUrl: 'https://go.dev/dl/go1.21.8.src.tar.gz',
    sha256: 'dc806cf75a87e1414b5b4c3dcb9dd3e9cc98f4cfccec42b7af617d5a658a3c43',
  }),
  Object.freeze({
    sourceId: 'go-bootstrap-stage4',
    version: '1.23.12',
    archiveName: 'go1.23.12.src.tar.gz',
    canonicalUrl: 'https://go.dev/dl/go1.23.12.src.tar.gz',
    sha256: 'e1cce9379a24e895714a412c7ddd157d2614d9edbe83a84449b6e1840b4f1226',
  }),
  Object.freeze({
    sourceId: 'go-bootstrap-stage5',
    version: '1.25.12',
    archiveName: 'go1.25.12.src.tar.gz',
    canonicalUrl: 'https://go.dev/dl/go1.25.12.src.tar.gz',
    sha256: 'f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932',
  }),
] as const);

type GuestSource = Readonly<{
  source_id: string;
  role: GuestSourceRole;
  component: string;
  version: string;
  archive_name: string;
  canonical_url: string;
  sha256: string;
  size_bytes: number;
  license_expression: string;
  license_files: readonly string[];
  signature: Readonly<{
    availability: SignatureAvailability;
    signature_url: string;
    signer_fingerprint: string;
    mathematical_verification: false;
    trust_verification: false;
  }>;
}>;

type GuestPatch = Readonly<{
  patch_id: string;
  target_source_id: string;
  apply_order: number;
  kind: PatchKind;
  repository_path: string;
  sha256: string;
  expected_touched_paths: readonly string[];
  application: Readonly<{
    verifier: 'GIT_APPLY_CHECK';
    strip_components: 1;
    fuzz_allowed: 0;
    offsets_allowed: false;
    backup_files_allowed: false;
    reject_files_allowed: false;
    verified: false;
  }>;
}>;

export type GuestSourceManifest = Readonly<{
  schema_id: 'urn:dosai:schema:guest-source-manifest:1';
  schema_version: 1;
  manifest_id: string;
  source_set_version: string;
  scope: 'FULL_GUEST_BUILD';
  status: 'DECLARED_UNVERIFIED';
  build_allowed: false;
  runtime_eligible: false;
  sources: readonly GuestSource[];
  patches: readonly GuestPatch[];
  toolchain: Readonly<{
    build_system_source_id: 'buildroot';
    build_system_version: '2025.02.16';
    build_system_sha256: '15305e3d366eeaf4a5ecaf2ed42f685fd6af7fe5dbf1f62e1de5f46ee83225e2';
    bootstrap_source_ids: typeof BOOTSTRAP_SOURCE_IDS;
    stage5_source_id: 'go-bootstrap-stage5';
    stage5_version: '1.25.12';
    stage5_sha256: 'f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932';
    final_source_id: 'go-final';
    final_version: '1.26.5';
    final_sha256: '495be4bc87176ac567392e5b4116abd98466d33d7b49d41e764ccc6976b2dc42';
    accepted_patch_id: 'buildroot-go-security-1.26.5';
    required_provider: 'BUILDROOT_HOST_GO_SRC';
    prebuilt_provider_allowed: false;
    provider_configuration_verified: false;
    target_os: 'linux';
    target_arch: 'arm64';
    cgo_enabled: false;
    build_environment: Readonly<{
      GOFLAGS: '-mod=vendor';
      GOPROXY: 'off';
      GOSUMDB: 'off';
      GOTOOLCHAIN: 'local';
      GOWORK: 'off';
    }>;
  }>;
  closure: Readonly<{
    sealed_bundle_path: string;
    sealed_bundle_sha256: string;
    sealed_bundle_size_bytes: number;
    canonical_inventory_sha256: string;
    declared_source_count: number;
    declared_patch_count: number;
    source_digests_verified: false;
    upstream_signatures_verified: false;
    signer_trust_verified: false;
    patches_verified: false;
    provider_verified: false;
    network_during_build: false;
    shared_cache: false;
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
  value: unknown,
  minimum: number,
  maximum: number,
  errorCode: string,
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new TypeError(errorCode);
  }
  const expectedKeys = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length'];
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key === 'symbol') ||
    ownKeys.map(String).sort().join('\0') !== expectedKeys.sort().join('\0')
  ) {
    throw new TypeError(errorCode);
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(errorCode);
    }
    return descriptor.value;
  });
}

function stringMatching(
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
  return stringMatching(value, SHA256, 64, errorCode);
}

function boundedInteger(value: unknown, minimum: number, maximum: number, errorCode: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new TypeError(errorCode);
  }
  return value;
}

function canonicalHttpsUrl(value: unknown, allowEmpty: boolean, errorCode: string): string {
  if (allowEmpty && value === '') return '';
  if (typeof value !== 'string' || value.length > 2048 || value.includes('%')) {
    throw new TypeError(errorCode);
  }
  if (typeof STANDARD_URL !== 'function') throw new TypeError(errorCode);
  let parsed: ParsedUrl;
  try {
    parsed = new STANDARD_URL(value);
  } catch {
    throw new TypeError(errorCode);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.pathname === '/' ||
    parsed.href !== value
  ) {
    throw new TypeError(errorCode);
  }
  return value;
}

function sortedUniqueStrings(
  value: unknown,
  minimum: number,
  maximum: number,
  pattern: RegExp,
  maximumLength: number,
  errorCode: string,
): readonly string[] {
  const result = exactArray(value, minimum, maximum, errorCode).map((item) =>
    stringMatching(item, pattern, maximumLength, errorCode));
  if (new Set(result).size !== result.length || result.some((item, index) => index > 0 && result[index - 1]! >= item)) {
    throw new TypeError(errorCode);
  }
  return Object.freeze(result);
}

function admitSignature(candidate: unknown): GuestSource['signature'] {
  const signature = exactObject(candidate, SIGNATURE_KEYS, 'DOSAI_GUEST_SOURCE_SIGNATURE_0001');
  const availability = signature.availability;
  if (availability !== 'REQUIRED' && availability !== 'NOT_PUBLISHED') {
    throw new TypeError('DOSAI_GUEST_SOURCE_SIGNATURE_0001');
  }
  const signatureUrl = canonicalHttpsUrl(
    signature.signature_url,
    availability === 'NOT_PUBLISHED',
    'DOSAI_GUEST_SOURCE_SIGNATURE_0001',
  );
  const fingerprint = signature.signer_fingerprint;
  if (
    (availability === 'REQUIRED' &&
      (typeof fingerprint !== 'string' || !FINGERPRINT.test(fingerprint))) ||
    (availability === 'NOT_PUBLISHED' && (signatureUrl !== '' || fingerprint !== '')) ||
    signature.mathematical_verification !== false ||
    signature.trust_verification !== false
  ) {
    throw new TypeError('DOSAI_GUEST_SOURCE_SIGNATURE_0001');
  }
  return Object.freeze({
    availability,
    signature_url: signatureUrl,
    signer_fingerprint: fingerprint as string,
    mathematical_verification: false,
    trust_verification: false,
  });
}

function admitSource(candidate: unknown): GuestSource {
  const source = exactObject(candidate, SOURCE_KEYS, 'DOSAI_GUEST_SOURCE_SCHEMA_0001');
  const role = source.role;
  if (typeof role !== 'string' || !GUEST_SOURCE_ROLES.includes(role as GuestSourceRole)) {
    throw new TypeError('DOSAI_GUEST_SOURCE_SCHEMA_0001');
  }
  return Object.freeze({
    source_id: stringMatching(source.source_id, NORMALIZED_ID, 96, 'DOSAI_GUEST_SOURCE_SCHEMA_0001'),
    role: role as GuestSourceRole,
    component: stringMatching(source.component, NORMALIZED_ID, 96, 'DOSAI_GUEST_SOURCE_SCHEMA_0001'),
    version: stringMatching(source.version, VERSION, 64, 'DOSAI_GUEST_SOURCE_SCHEMA_0001'),
    archive_name: stringMatching(source.archive_name, ARCHIVE_NAME, 140, 'DOSAI_GUEST_SOURCE_SCHEMA_0001'),
    canonical_url: canonicalHttpsUrl(source.canonical_url, false, 'DOSAI_GUEST_SOURCE_SCHEMA_0001'),
    sha256: digest(source.sha256, 'DOSAI_GUEST_SOURCE_SCHEMA_0001'),
    size_bytes: boundedInteger(source.size_bytes, 1, 8_589_934_592, 'DOSAI_GUEST_SOURCE_SCHEMA_0001'),
    license_expression: stringMatching(
      source.license_expression,
      LICENSE_EXPRESSION,
      128,
      'DOSAI_GUEST_SOURCE_SCHEMA_0001',
    ),
    license_files: sortedUniqueStrings(
      source.license_files,
      1,
      16,
      SAFE_PATH,
      256,
      'DOSAI_GUEST_SOURCE_SCHEMA_0001',
    ),
    signature: admitSignature(source.signature),
  });
}

function admitPatch(candidate: unknown): GuestPatch {
  const patch = exactObject(candidate, PATCH_KEYS, 'DOSAI_GUEST_PATCH_SCHEMA_0001');
  const application = exactObject(
    patch.application,
    APPLICATION_KEYS,
    'DOSAI_GUEST_PATCH_APPLICATION_0001',
  );
  const kind = patch.kind;
  if (
    (kind !== 'DOSAI_LOCAL' && kind !== 'UPSTREAM_BACKPORT') ||
    application.verifier !== 'GIT_APPLY_CHECK' ||
    application.strip_components !== 1 ||
    application.fuzz_allowed !== 0 ||
    application.offsets_allowed !== false ||
    application.backup_files_allowed !== false ||
    application.reject_files_allowed !== false ||
    application.verified !== false
  ) {
    throw new TypeError('DOSAI_GUEST_PATCH_APPLICATION_0001');
  }
  return Object.freeze({
    patch_id: stringMatching(patch.patch_id, NORMALIZED_ID, 96, 'DOSAI_GUEST_PATCH_SCHEMA_0001'),
    target_source_id: stringMatching(
      patch.target_source_id,
      NORMALIZED_ID,
      96,
      'DOSAI_GUEST_PATCH_SCHEMA_0001',
    ),
    apply_order: boundedInteger(patch.apply_order, 1, 128, 'DOSAI_GUEST_PATCH_SCHEMA_0001'),
    kind,
    repository_path: stringMatching(
      patch.repository_path,
      PATCH_PATH,
      256,
      'DOSAI_GUEST_PATCH_SCHEMA_0001',
    ),
    sha256: digest(patch.sha256, 'DOSAI_GUEST_PATCH_SCHEMA_0001'),
    expected_touched_paths: sortedUniqueStrings(
      patch.expected_touched_paths,
      1,
      32,
      SAFE_PATH,
      256,
      'DOSAI_GUEST_PATCH_SCHEMA_0001',
    ),
    application: Object.freeze({
      verifier: 'GIT_APPLY_CHECK',
      strip_components: 1,
      fuzz_allowed: 0,
      offsets_allowed: false,
      backup_files_allowed: false,
      reject_files_allowed: false,
      verified: false,
    }),
  });
}

function admitToolchain(candidate: unknown): GuestSourceManifest['toolchain'] {
  const toolchain = exactObject(candidate, TOOLCHAIN_KEYS, 'DOSAI_GUEST_TOOLCHAIN_SCHEMA_0001');
  const bootstrapIds = exactArray(
    toolchain.bootstrap_source_ids,
    BOOTSTRAP_SOURCE_IDS.length,
    BOOTSTRAP_SOURCE_IDS.length,
    'DOSAI_GUEST_TOOLCHAIN_SCHEMA_0001',
  );
  const environment = exactObject(
    toolchain.build_environment,
    ENVIRONMENT_KEYS,
    'DOSAI_GUEST_TOOLCHAIN_ENVIRONMENT_0001',
  );
  if (
    bootstrapIds.some((value, index) => value !== BOOTSTRAP_SOURCE_IDS[index]) ||
    toolchain.build_system_source_id !== 'buildroot' ||
    toolchain.build_system_version !== '2025.02.16' ||
    toolchain.build_system_sha256 !== '15305e3d366eeaf4a5ecaf2ed42f685fd6af7fe5dbf1f62e1de5f46ee83225e2' ||
    toolchain.stage5_source_id !== 'go-bootstrap-stage5' ||
    toolchain.stage5_version !== '1.25.12' ||
    toolchain.stage5_sha256 !== 'f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932' ||
    toolchain.final_source_id !== 'go-final' ||
    toolchain.final_version !== '1.26.5' ||
    toolchain.final_sha256 !== '495be4bc87176ac567392e5b4116abd98466d33d7b49d41e764ccc6976b2dc42' ||
    toolchain.accepted_patch_id !== 'buildroot-go-security-1.26.5' ||
    toolchain.required_provider !== 'BUILDROOT_HOST_GO_SRC' ||
    toolchain.prebuilt_provider_allowed !== false ||
    toolchain.provider_configuration_verified !== false ||
    toolchain.target_os !== 'linux' ||
    toolchain.target_arch !== 'arm64' ||
    toolchain.cgo_enabled !== false ||
    environment.GOFLAGS !== '-mod=vendor' ||
    environment.GOPROXY !== 'off' ||
    environment.GOSUMDB !== 'off' ||
    environment.GOTOOLCHAIN !== 'local' ||
    environment.GOWORK !== 'off'
  ) {
    throw new TypeError('DOSAI_GUEST_TOOLCHAIN_SCHEMA_0001');
  }
  return Object.freeze({
    build_system_source_id: 'buildroot',
    build_system_version: '2025.02.16',
    build_system_sha256: '15305e3d366eeaf4a5ecaf2ed42f685fd6af7fe5dbf1f62e1de5f46ee83225e2',
    bootstrap_source_ids: BOOTSTRAP_SOURCE_IDS,
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
    build_environment: Object.freeze({
      GOFLAGS: '-mod=vendor',
      GOPROXY: 'off',
      GOSUMDB: 'off',
      GOTOOLCHAIN: 'local',
      GOWORK: 'off',
    }),
  });
}

function admitClosure(candidate: unknown): GuestSourceManifest['closure'] {
  const closure = exactObject(candidate, CLOSURE_KEYS, 'DOSAI_GUEST_CLOSURE_SCHEMA_0001');
  if (
    closure.source_digests_verified !== false ||
    closure.upstream_signatures_verified !== false ||
    closure.signer_trust_verified !== false ||
    closure.patches_verified !== false ||
    closure.provider_verified !== false ||
    closure.network_during_build !== false ||
    closure.shared_cache !== false ||
    closure.complete !== false
  ) {
    throw new TypeError('DOSAI_GUEST_CLOSURE_SCHEMA_0001');
  }
  return Object.freeze({
    sealed_bundle_path: stringMatching(
      closure.sealed_bundle_path,
      /^guest-sources\/v1\/[a-z0-9][a-z0-9._-]{0,127}\.tar\.zst$/,
      160,
      'DOSAI_GUEST_CLOSURE_SCHEMA_0001',
    ),
    sealed_bundle_sha256: digest(closure.sealed_bundle_sha256, 'DOSAI_GUEST_CLOSURE_SCHEMA_0001'),
    sealed_bundle_size_bytes: boundedInteger(
      closure.sealed_bundle_size_bytes,
      1,
      17_179_869_184,
      'DOSAI_GUEST_CLOSURE_SCHEMA_0001',
    ),
    canonical_inventory_sha256: digest(
      closure.canonical_inventory_sha256,
      'DOSAI_GUEST_CLOSURE_SCHEMA_0001',
    ),
    declared_source_count: boundedInteger(
      closure.declared_source_count,
      9,
      1024,
      'DOSAI_GUEST_CLOSURE_SCHEMA_0001',
    ),
    declared_patch_count: boundedInteger(
      closure.declared_patch_count,
      1,
      128,
      'DOSAI_GUEST_CLOSURE_SCHEMA_0001',
    ),
    source_digests_verified: false,
    upstream_signatures_verified: false,
    signer_trust_verified: false,
    patches_verified: false,
    provider_verified: false,
    network_during_build: false,
    shared_cache: false,
    complete: false,
  });
}

function requireSource(
  sourcesById: ReadonlyMap<string, GuestSource>,
  sourceId: string,
  role: GuestSourceRole,
  component: string,
  version: string,
  archiveName: string,
  canonicalUrl: string,
  sha256: string,
): void {
  const source = sourcesById.get(sourceId);
  if (
    source?.role !== role ||
    source.component !== component ||
    source.version !== version ||
    source.archive_name !== archiveName ||
    source.canonical_url !== canonicalUrl ||
    source.sha256 !== sha256
  ) {
    throw new TypeError('DOSAI_GUEST_SOURCE_RELATION_0001');
  }
}

export function admitGuestSourceManifest(candidate: unknown): GuestSourceManifest {
  const manifest = exactObject(candidate, MANIFEST_KEYS, 'DOSAI_GUEST_SOURCE_SCHEMA_0001');
  const manifestId = stringMatching(manifest.manifest_id, UUID_V4, 36, 'DOSAI_GUEST_SOURCE_SCHEMA_0001');
  const sourceSetVersion = stringMatching(
    manifest.source_set_version,
    DECIMAL_SEQUENCE,
    32,
    'DOSAI_GUEST_SOURCE_SCHEMA_0001',
  );
  if (
    manifest.schema_id !== 'urn:dosai:schema:guest-source-manifest:1' ||
    manifest.schema_version !== 1 ||
    manifest.scope !== 'FULL_GUEST_BUILD' ||
    manifest.status !== 'DECLARED_UNVERIFIED' ||
    manifest.build_allowed !== false ||
    manifest.runtime_eligible !== false
  ) {
    throw new TypeError('DOSAI_GUEST_SOURCE_SCHEMA_0001');
  }

  const sources = exactArray(manifest.sources, 9, 1024, 'DOSAI_GUEST_SOURCE_SCHEMA_0001')
    .map(admitSource);
  const sourceIds = sources.map(({ source_id }) => source_id);
  if (
    new Set(sourceIds).size !== sourceIds.length ||
    new Set(sources.map(({ archive_name }) => archive_name)).size !== sources.length ||
    sourceIds.some((sourceId, index) => index > 0 && sourceIds[index - 1]! >= sourceId)
  ) {
    throw new TypeError('DOSAI_GUEST_SOURCE_RELATION_0001');
  }
  const roleCount = (role: GuestSourceRole): number => sources.filter((source) => source.role === role).length;
  if (
    roleCount('BUILD_SYSTEM') !== 1 ||
    roleCount('TOOLCHAIN_BOOTSTRAP') !== 5 ||
    roleCount('TOOLCHAIN_FINAL') !== 1 ||
    roleCount('KERNEL') < 1 ||
    roleCount('ROOT_FILESYSTEM_PACKAGE') < 1
  ) {
    throw new TypeError('DOSAI_GUEST_SOURCE_RELATION_0001');
  }

  const patches = exactArray(manifest.patches, 1, 128, 'DOSAI_GUEST_PATCH_SCHEMA_0001')
    .map(admitPatch);
  const patchIds = patches.map(({ patch_id }) => patch_id);
  if (
    new Set(patchIds).size !== patchIds.length ||
    new Set(patches.map(({ repository_path }) => repository_path)).size !== patches.length ||
    patches.some(({ apply_order }, index) => apply_order !== index + 1)
  ) {
    throw new TypeError('DOSAI_GUEST_PATCH_RELATION_0001');
  }

  const toolchain = admitToolchain(manifest.toolchain);
  const closure = admitClosure(manifest.closure);
  const sourcesById = new Map(sources.map((source) => [source.source_id, source] as const));
  const patchesById = new Map(patches.map((patch) => [patch.patch_id, patch] as const));
  if (
    patches.some((patch) => !sourcesById.has(patch.target_source_id)) ||
    closure.declared_source_count !== sources.length ||
    closure.declared_patch_count !== patches.length
  ) {
    throw new TypeError('DOSAI_GUEST_CLOSURE_RELATION_0001');
  }

  requireSource(
    sourcesById,
    toolchain.build_system_source_id,
    'BUILD_SYSTEM',
    'buildroot',
    toolchain.build_system_version,
    'buildroot-2025.02.16.tar.xz',
    'https://buildroot.org/downloads/buildroot-2025.02.16.tar.xz',
    toolchain.build_system_sha256,
  );
  const buildSystemSignature = sourcesById.get(toolchain.build_system_source_id)?.signature;
  if (
    buildSystemSignature?.availability !== 'REQUIRED' ||
    buildSystemSignature.signature_url !==
      'https://buildroot.org/downloads/buildroot-2025.02.16.tar.xz.sign' ||
    buildSystemSignature.signer_fingerprint !== '18C7DF2819C1733D822D599EA500D6EE9CB0E540'
  ) {
    throw new TypeError('DOSAI_GUEST_SOURCE_SIGNATURE_0001');
  }
  for (const source of BOOTSTRAP_SOURCES) {
    requireSource(
      sourcesById,
      source.sourceId,
      'TOOLCHAIN_BOOTSTRAP',
      'go',
      source.version,
      source.archiveName,
      source.canonicalUrl,
      source.sha256,
    );
  }
  requireSource(
    sourcesById,
    toolchain.stage5_source_id,
    'TOOLCHAIN_BOOTSTRAP',
    'go',
    toolchain.stage5_version,
    'go1.25.12.src.tar.gz',
    'https://go.dev/dl/go1.25.12.src.tar.gz',
    toolchain.stage5_sha256,
  );
  requireSource(
    sourcesById,
    toolchain.final_source_id,
    'TOOLCHAIN_FINAL',
    'go',
    toolchain.final_version,
    'go1.26.5.src.tar.gz',
    'https://go.dev/dl/go1.26.5.src.tar.gz',
    toolchain.final_sha256,
  );
  const acceptedPatch = patchesById.get(toolchain.accepted_patch_id);
  if (
    acceptedPatch?.target_source_id !== toolchain.build_system_source_id ||
    acceptedPatch.sha256 !== '038704e622a717b0eab302e6c223174d24a77e3e6798dab710f1ad9ab0f7275d'
  ) {
    throw new TypeError('DOSAI_GUEST_PATCH_RELATION_0001');
  }

  return Object.freeze({
    schema_id: 'urn:dosai:schema:guest-source-manifest:1',
    schema_version: 1,
    manifest_id: manifestId,
    source_set_version: sourceSetVersion,
    scope: 'FULL_GUEST_BUILD',
    status: 'DECLARED_UNVERIFIED',
    build_allowed: false,
    runtime_eligible: false,
    sources: Object.freeze(sources),
    patches: Object.freeze(patches),
    toolchain,
    closure,
  });
}
