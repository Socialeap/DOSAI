import { open, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { canonicalJson, digestObject } from './canonical-json.mjs';

function isWithin(parent, candidate) {
  const child = relative(parent, candidate);
  return child !== '' && !child.startsWith('..') && !isAbsolute(child);
}

async function writeExclusive(path, bytes) {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureDirectory(path) {
  try {
    const stats = await lstat(path);
    if (
      !stats.isDirectory() ||
      stats.isSymbolicLink() ||
      (stats.mode & 0o077) !== 0
    ) {
      throw new Error('EVIDENCE_ROOT_TYPE_REJECTED');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    await mkdir(path, { mode: 0o700 });
  }
}

export function prepareArtifact(artifactClass, artifactId, value) {
  const bytes = canonicalJson(value);
  return Object.freeze({
    bytes,
    descriptor: {
      artifact_id: artifactId,
      artifact_class: artifactClass,
      availability: 'AVAILABLE',
      byte_length: Buffer.byteLength(bytes),
      data_class: 'D2',
      manifest_digest: digestObject(bytes),
      media_type: 'application/json',
      retention_profile: 'R3_EVIDENCE_STANDARD',
    },
  });
}

export async function createEvidenceStore(root, configuredPath, suiteId, runId) {
  const realRoot = await realpath(root);
  const managedRoot = join(realRoot, 'evidence');
  const acceptedRoot = join(managedRoot, 'acceptance');
  if (resolve(configuredPath) !== acceptedRoot) {
    throw new Error('EVIDENCE_ROOT_REJECTED');
  }

  await ensureDirectory(managedRoot);
  await ensureDirectory(acceptedRoot);
  const [managedStats, acceptedStats] = await Promise.all([
    lstat(managedRoot),
    lstat(acceptedRoot),
  ]);
  if (
    !managedStats.isDirectory() ||
    managedStats.isSymbolicLink() ||
    (managedStats.mode & 0o077) !== 0 ||
    !acceptedStats.isDirectory() ||
    acceptedStats.isSymbolicLink() ||
    (acceptedStats.mode & 0o077) !== 0
  ) {
    throw new Error('EVIDENCE_ROOT_TYPE_REJECTED');
  }
  const [realManagedRoot, realAcceptedRoot] = await Promise.all([
    realpath(managedRoot),
    realpath(acceptedRoot),
  ]);
  if (!isWithin(realRoot, realManagedRoot) || !isWithin(realManagedRoot, realAcceptedRoot)) {
    throw new Error('EVIDENCE_ROOT_ESCAPE');
  }

  const runDirectory = join(realAcceptedRoot, `${suiteId.toLowerCase()}-${runId}`);
  await mkdir(runDirectory, { mode: 0o700 });
  await syncDirectory(realAcceptedRoot);

  return Object.freeze({
    async discard() {
      await rm(runDirectory, { force: true, recursive: true });
      await syncDirectory(realAcceptedRoot);
    },

    async writeArtifact(prepared) {
      const { artifact_id: artifactId } = prepared.descriptor;
      await writeExclusive(join(runDirectory, `${artifactId}.json`), prepared.bytes);
      await syncDirectory(runDirectory);
      return prepared.descriptor;
    },

    async writeReport(report) {
      const bytes = canonicalJson(report);
      await writeExclusive(join(runDirectory, 'report.json'), bytes);
      await syncDirectory(runDirectory);
      return digestObject(bytes);
    },
  });
}
