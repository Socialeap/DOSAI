import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REQUESTED_CONFIG = `BR2_DOSAI_CONFIG_PROOF_ONLY=y
BR2_aarch64=y
BR2_TOOLCHAIN_BUILDROOT_MUSL=y
BR2_STATIC_LIBS=y
BR2_PACKAGE_HOST_GO=y
BR2_PACKAGE_HOST_GO_SRC=y
# BR2_PACKAGE_HOST_GO_BIN is not set
`;

const REQUIRED_RESOLUTION = Object.freeze({
  BR2_ARCH: '"aarch64"',
  BR2_DOSAI_CONFIG_PROOF_ONLY: 'y',
  BR2_NORMALIZED_ARCH: '"arm64"',
  BR2_PACKAGE_HOST_GO: 'y',
  BR2_PACKAGE_HOST_GO_BIN: 'n',
  BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE1_ARCH_SUPPORTS: 'y',
  BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE2_ARCH_SUPPORTS: 'y',
  BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE3_ARCH_SUPPORTS: 'y',
  BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE4_ARCH_SUPPORTS: 'y',
  BR2_PACKAGE_HOST_GO_BOOTSTRAP_STAGE5_ARCH_SUPPORTS: 'y',
  BR2_PACKAGE_HOST_GO_SRC: 'y',
  BR2_PACKAGE_PROVIDES_HOST_GO: '"host-go-src"',
  BR2_STATIC_LIBS: 'y',
  BR2_TOOLCHAIN_BUILDROOT_MUSL: 'y',
  BR2_TOOLCHAIN_USES_MUSL: 'y',
  BR2_aarch64: 'y',
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function canonicalInput(value, maximumBytes, errorCode) {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > maximumBytes ||
    value.includes('\r') ||
    value.includes('\0') ||
    !value.endsWith('\n')
  ) {
    throw new TypeError(errorCode);
  }
  return value;
}

function parseKconfig(value) {
  const entries = new Map();
  for (const line of value.split('\n')) {
    let key;
    let selected;
    const assignment = /^(BR2_[A-Za-z0-9_]+)=(.+)$/.exec(line);
    const unset = /^# (BR2_[A-Za-z0-9_]+) is not set$/.exec(line);
    if (assignment !== null) {
      [, key, selected] = assignment;
    } else if (unset !== null) {
      [, key] = unset;
      selected = 'n';
    } else {
      continue;
    }
    if (entries.has(key)) throw new TypeError('DOSAI_BUILDROOT_CONFIG_DUPLICATE_0001');
    entries.set(key, selected);
  }
  return entries;
}

export function verifyBuildrootToolchainConfig({
  requestedConfig,
  resolvedConfig,
  evaluationHostOs,
  kconfigHostArchitecture,
}) {
  const requested = canonicalInput(
    requestedConfig,
    16_384,
    'DOSAI_BUILDROOT_REQUESTED_CONFIG_0001',
  );
  const resolved = canonicalInput(
    resolvedConfig,
    2_097_152,
    'DOSAI_BUILDROOT_RESOLVED_CONFIG_0001',
  );
  if (
    requested !== REQUESTED_CONFIG ||
    evaluationHostOs !== 'darwin' ||
    kconfigHostArchitecture !== 'x86_64' ||
    !resolved.startsWith(
      '#\n# Automatically generated file; DO NOT EDIT.\n# Buildroot 2025.02.16 Configuration\n#\n',
    )
  ) {
    throw new TypeError('DOSAI_BUILDROOT_CONFIG_CONTEXT_0001');
  }

  const entries = parseKconfig(resolved);
  for (const [key, expected] of Object.entries(REQUIRED_RESOLUTION)) {
    if (entries.get(key) !== expected) {
      throw new TypeError('DOSAI_BUILDROOT_CONFIG_RESOLUTION_0001');
    }
  }

  const semanticProjection = Object.freeze({ ...REQUIRED_RESOLUTION });
  const semanticBytes = `${JSON.stringify(semanticProjection)}\n`;
  return Object.freeze({
    schema_id: 'urn:dosai:evidence:buildroot-toolchain-config-proof:1',
    schema_version: 1,
    status: 'SIMULATED_KCONFIG_RESOLUTION',
    buildroot_version: '2025.02.16',
    buildroot_archive_sha256:
      '15305e3d366eeaf4a5ecaf2ed42f685fd6af7fe5dbf1f62e1de5f46ee83225e2',
    accepted_patch_sha256:
      '038704e622a717b0eab302e6c223174d24a77e3e6798dab710f1ad9ab0f7275d',
    evaluation_host_os: 'darwin',
    kconfig_host_architecture: 'x86_64',
    physical_linux_builder_verified: false,
    requested_defconfig_sha256: sha256(requested),
    resolved_config_sha256: sha256(resolved),
    semantic_projection_sha256: sha256(semanticBytes),
    semantic_projection: semanticProjection,
    source_downloaded: false,
    compiler_built: false,
    artifact_created: false,
    build_allowed: false,
    runtime_eligible: false,
  });
}

function exactArguments(argv) {
  if (
    argv.length !== 6 ||
    argv[0] !== '--requested' ||
    argv[2] !== '--resolved' ||
    argv[4] !== '--evaluation-host-os' ||
    argv[5] !== 'darwin'
  ) {
    throw new TypeError(
      'usage: verify-buildroot-toolchain-config.mjs --requested <path> --resolved <path> --evaluation-host-os darwin',
    );
  }
  return { requestedPath: argv[1], resolvedPath: argv[3] };
}

async function main(argv) {
  const { requestedPath, resolvedPath } = exactArguments(argv);
  const [requestedConfig, resolvedConfig] = await Promise.all([
    readFile(requestedPath, 'utf8'),
    readFile(resolvedPath, 'utf8'),
  ]);
  const result = verifyBuildrootToolchainConfig({
    requestedConfig,
    resolvedConfig,
    evaluationHostOs: 'darwin',
    kconfigHostArchitecture: 'x86_64',
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.argv.slice(2));
}
