// Read-only source-byte integrity report. Never runtime admission or test execution.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStrictJson } from '../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '..');
const manifestPath = 'docs/architecture/p3-native-profile-source-integrity-manifest-v1.json';
const manifestDigest = 'feebeb30adea29056704ec1bb111811968747ac8f6387951fe2ae1e8e8429087';
const authorityNames = ['merge', 'provisioning', 'workflow_activation', 'workflow_dispatch',
  'executor', 'host_mutation', 'build', 'guest_execution', 'paid_activity', 'capability_acceptance'];
const reject = () => { throw new Error('NATIVE_PROFILE_SOURCE_INTEGRITY_REJECTED'); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const require = condition => { if (!condition) reject(); };

// The injected loader is for offline tests only; the CLI accepts no root or input paths.
export async function assessNativeProfileSourceIntegrity(readSource = path => readFile(resolve(root, path))) {
  try {
    async function bytes(path) {
      const value = await readSource(path);
      require(Buffer.isBuffer(value) && value.length > 0 && value.length <= 1_048_576);
      return Buffer.from(value);
    }
    const manifestBytes = await bytes(manifestPath);
    // Match pinned source bytes before parsing or following input paths.
    require(hash(manifestBytes) === manifestDigest);
    const manifest = parseStrictJson(manifestBytes);
    require(manifest.record_type === 'DOSAI_NATIVE_PROFILE_SOURCE_INTEGRITY_MANIFEST'
      && manifest.record_version === 1 && manifest.scope === 'OFFLINE_SOURCE_BYTES_ONLY'
      && manifest.runtime_status === 'NO_GO');
    require(manifest.authorities && Object.keys(manifest.authorities).length === authorityNames.length
      && authorityNames.every(name => manifest.authorities[name] === false));
    const entries = Object.entries(manifest.inputs);
    require(entries.length === 35);
    for (const [path, digest] of entries) {
      require(typeof path === 'string' && path.length <= 240
        && path.split('/').every(part => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..')
        && typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest));
      require(hash(await bytes(path)) === digest);
    }
    return Object.freeze({ schema: 'DOSAI_NATIVE_PROFILE_SOURCE_INTEGRITY_REPORT_V1',
      scope: 'OFFLINE_SOURCE_BYTES_ONLY', source_integrity: 'PASS', manifest_sha256: manifestDigest,
      verified_files: entries.length, tests_executed_by_report: 0, runtime_readiness_assessed: false,
      runtime_status: 'NO_GO', ready_for_functional_app_testing: false, builder_receipts: 0,
      authorities: Object.freeze(Object.fromEntries(authorityNames.map(name => [name, false]))) });
  } catch {
    reject();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    require(process.argv.length === 2);
    console.log(JSON.stringify(await assessNativeProfileSourceIntegrity(), null, 2));
  } catch {
    console.error('NATIVE_PROFILE_SOURCE_INTEGRITY_REJECTED');
    process.exitCode = 2;
  }
}
