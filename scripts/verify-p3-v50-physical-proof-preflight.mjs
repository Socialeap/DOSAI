import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { runFixed } from '../tools/dosai-acceptance/src/fixed-process.mjs';

export const v50SubjectCommit = 'bcb69f9c7662b9b507ab1ce01c2956bf8a47d2bc';
export const preservedV49Application =
  '/private/tmp/dosai-v49-proof/out/DOSAI-darwin-arm64/DOSAI.app';
export const stagedV50Application =
  '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app';

const root = resolve(import.meta.dirname, '..');
const electronArchiveName = 'electron-v43.2.0-darwin-arm64.zip';
const resultPrefix = 'DOSAI_V50_PHYSICAL_PREFLIGHT_V1:';

async function requireDirectory(path) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('PREFLIGHT_DIRECTORY_REJECTED');
  }
}

async function requireAbsent(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('PREFLIGHT_STAGING_TARGET_PRESENT');
}

async function requireCachedElectronArchive() {
  const checksums = JSON.parse(await readFile(
    resolve(root, 'node_modules/electron/checksums.json'),
    'utf8',
  ));
  const expected = checksums[electronArchiveName];
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new Error('PREFLIGHT_ELECTRON_CHECKSUM_REJECTED');
  }
  const cacheRoot = join(homedir(), 'Library/Caches/electron');
  const entries = (await readdir(cacheRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const candidate = join(cacheRoot, entry.name, electronArchiveName);
    try {
      const bytes = await readFile(candidate);
      if (createHash('sha256').update(bytes).digest('hex') === expected) return;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('PREFLIGHT_ELECTRON_ARCHIVE_MISSING');
}

export async function verifyV50PhysicalProofPreflight() {
  await runFixed('/usr/bin/git', ['cat-file', '-e', `${v50SubjectCommit}^{commit}`], {
    cwd: root,
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
    timeout: 30_000,
  });
  await requireDirectory(preservedV49Application);
  await requireDirectory(resolve(root, 'node_modules'));
  await requireDirectory(resolve(root, 'tools/dosai-acceptance/node_modules'));
  await requireAbsent(stagedV50Application);
  await requireCachedElectronArchive();
  return Object.freeze({
    cached_electron_archive_verified: true,
    governed_dependencies_present: true,
    preserved_v49_package_present: true,
    result: 'PASS',
    staged_v50_application_absent: true,
    subject_commit: v50SubjectCommit,
  });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.argv.length !== 2) {
    console.error('DOSAI_V50_PHYSICAL_PREFLIGHT_ARGUMENTS_REJECTED');
    process.exitCode = 2;
  } else {
    try {
      const result = await verifyV50PhysicalProofPreflight();
      process.stdout.write(`${resultPrefix}${JSON.stringify(result)}\n`);
    } catch {
      console.error('DOSAI_V50_PHYSICAL_PREFLIGHT_FAILED');
      process.exitCode = 1;
    }
  }
}
