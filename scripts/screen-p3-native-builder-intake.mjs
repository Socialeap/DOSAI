import { parseStrictJsonBytes } from '../src/contracts/strict-json.ts';

const MAX_WORKSHEET_BYTES = 4096;
const REJECTED = 'DOSAI_NATIVE_BUILDER_INTAKE_REJECTED';
const PAIR_REQUIREMENTS = [
  'existing_availability_and_zero_incremental_cost',
  'distinct_hosts',
  'separate_writable_state_and_daemons',
  'accountable_administrator',
];
const HOST_REQUIREMENTS = [
  'fresh_native_linux_x86_64',
  'native_docker_amd64',
  'single_full_root_binfmt_misc_mount',
  'zero_registry_submounts',
  'zero_effective_registrations',
  'effective_registry_namespace_binding',
  'full_interval_writer_exclusion',
  'dosai_registry_mutation_unavailable',
  'deployed_kernel_source_binding',
  'independent_issuer',
];
const HOST_SLOTS = ['host_a', 'host_b'];

function rejectWorksheet() {
  throw new Error(REJECTED);
}

function hasExactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function screenNativeBuilderIntake(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_WORKSHEET_BYTES) rejectWorksheet();

  let worksheet;
  try {
    worksheet = parseStrictJsonBytes(bytes);
  } catch {
    rejectWorksheet();
  }
  if (!hasExactKeys(worksheet, ['version', 'pair', 'hosts']) || worksheet.version !== 1 ||
      !hasExactKeys(worksheet.hosts, HOST_SLOTS)) {
    rejectWorksheet();
  }

  const missing = [];
  const contradicted = [];
  function screenSection(value, section, requirements) {
    if (!hasExactKeys(value, requirements)) rejectWorksheet();
    for (const requirement of requirements) {
      const state = value[requirement];
      if (state === 'UNKNOWN') missing.push(`${section}.${requirement}`);
      else if (state === 'CONTRADICTED') contradicted.push(`${section}.${requirement}`);
      else if (state !== 'DOCUMENTED') rejectWorksheet();
    }
  }

  screenSection(worksheet.pair, 'pair', PAIR_REQUIREMENTS);
  for (const slot of HOST_SLOTS) screenSection(worksheet.hosts[slot], slot, HOST_REQUIREMENTS);

  let status = 'FOR_SOURCE_REVIEW';
  if (contradicted.length > 0) status = 'DOCUMENTATION_CONTRADICTED';
  else if (missing.length > 0) status = 'DOCUMENTATION_INCOMPLETE';

  return {
    status,
    missing,
    contradicted,
    qualifyingBuilderReceiptsAdded: 0,
    qualificationAuthorized: false,
  };
}

async function readWorksheet() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > MAX_WORKSHEET_BYTES) rejectWorksheet();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

if (import.meta.main) {
  try {
    if (process.versions.node !== '24.18.0' || process.argv.length !== 2 || process.stdin.isTTY) {
      rejectWorksheet();
    }
    const screen = screenNativeBuilderIntake(await readWorksheet());
    console.log(JSON.stringify(screen, null, 2));
    process.exitCode = 2;
  } catch {
    console.error(REJECTED);
    process.exitCode = 1;
  }
}
