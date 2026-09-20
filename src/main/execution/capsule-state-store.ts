import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import {
  admitCapsuleRegistryDocument,
  serializeCapsuleRegistryDocument,
  type CapsuleRegistryDocument,
} from '../../contracts/p3/persistence.ts';
import { parseStrictJsonBytes } from '../../contracts/strict-json.ts';

const MAXIMUM_REGISTRY_BYTES = 1_048_576;
const STATE_FILE_NAME = 'capsule-registry.json';
const OWNERSHIP_FILE_NAME = '.capsule-registry.owner';
const OWNERSHIP_FILE_CONTENT = 'DOSAI_CAPSULE_STORE_OWNER_V1\n';
const MAXIMUM_READ_ATTEMPTS = 3;

function errno(error: unknown, code: string): boolean {
  return error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === code;
}

async function assertPrivateDirectory(directory: string): Promise<void> {
  const metadata = await stat(directory);
  if (!metadata.isDirectory() || (metadata.mode & 0o077) !== 0) {
    throw new Error('DOSAI_CAPSULE_STORE_DIRECTORY_0001');
  }
}

async function stateFileMetadata(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
      throw new Error('DOSAI_CAPSULE_STORE_FILE_0001');
    }
    if (metadata.size > MAXIMUM_REGISTRY_BYTES) {
      throw new Error('DOSAI_CAPSULE_STORE_SIZE_0001');
    }
    return metadata;
  } catch (error) {
    if (errno(error, 'ENOENT')) return null;
    throw error;
  }
}

function sameFile(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function loadStateDocument(statePath: string): Promise<CapsuleRegistryDocument | null> {
  for (let attempt = 0; attempt < MAXIMUM_READ_ATTEMPTS; attempt += 1) {
    const initial = await stateFileMetadata(statePath);
    if (initial === null) return null;
    let file: Awaited<ReturnType<typeof open>>;
    try {
      file = await open(statePath, 'r');
    } catch (error) {
      if (errno(error, 'ENOENT')) continue;
      throw error;
    }
    try {
      const opened = await file.stat();
      if (!opened.isFile() || (opened.mode & 0o077) !== 0) {
        throw new Error('DOSAI_CAPSULE_STORE_FILE_0001');
      }
      const current = await stateFileMetadata(statePath);
      if (current === null || !sameFile(opened, current)) continue;
      const bytes = await file.readFile();
      const after = await file.stat();
      if (
        !sameFile(opened, after) ||
        bytes.byteLength !== opened.size ||
        bytes.byteLength !== after.size ||
        bytes.byteLength > MAXIMUM_REGISTRY_BYTES
      ) {
        throw new Error('DOSAI_CAPSULE_STORE_SIZE_0001');
      }
      return admitCapsuleRegistryDocument(parseStrictJsonBytes(bytes));
    } finally {
      await file.close();
    }
  }
  throw new Error('DOSAI_CAPSULE_STORE_SNAPSHOT_0001');
}

export type CapsuleStateReader = Readonly<{
  readonly directory: string;
  readonly statePath: string;
  readonly load: () => Promise<CapsuleRegistryDocument | null>;
}>;

export async function openCapsuleStateReader(directory: string): Promise<CapsuleStateReader> {
  if (!isAbsolute(directory)) {
    throw new Error('DOSAI_CAPSULE_STORE_DIRECTORY_0001');
  }
  const canonicalDirectory = await realpath(directory);
  if (canonicalDirectory !== resolve(directory)) {
    throw new Error('DOSAI_CAPSULE_STORE_DIRECTORY_0001');
  }
  await assertPrivateDirectory(canonicalDirectory);
  const statePath = join(canonicalDirectory, STATE_FILE_NAME);
  return Object.freeze({
    directory: canonicalDirectory,
    statePath,
    load: () => loadStateDocument(statePath),
  });
}

export type CapsuleStateStore = Readonly<{
  readonly directory: string;
  readonly statePath: string;
  readonly ownershipPath: string;
  readonly load: () => Promise<CapsuleRegistryDocument | null>;
  readonly save: (candidate: unknown) => Promise<CapsuleRegistryDocument>;
  readonly close: () => Promise<void>;
}>;

export async function openCapsuleStateStore(directory: string): Promise<CapsuleStateStore> {
  if (!isAbsolute(directory)) {
    throw new Error('DOSAI_CAPSULE_STORE_DIRECTORY_0001');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const canonicalDirectory = await realpath(directory);
  if (canonicalDirectory !== resolve(directory)) {
    throw new Error('DOSAI_CAPSULE_STORE_DIRECTORY_0001');
  }
  await assertPrivateDirectory(canonicalDirectory);
  const statePath = join(canonicalDirectory, STATE_FILE_NAME);
  const ownershipPath = join(canonicalDirectory, OWNERSHIP_FILE_NAME);
  let ownershipFile: Awaited<ReturnType<typeof open>>;
  try {
    ownershipFile = await open(ownershipPath, 'wx', 0o600);
  } catch (error) {
    if (errno(error, 'EEXIST')) {
      throw new Error('DOSAI_CAPSULE_STORE_OWNED_0001');
    }
    throw error;
  }
  let ownershipIdentity: Awaited<ReturnType<typeof ownershipFile.stat>>;
  try {
    await ownershipFile.writeFile(OWNERSHIP_FILE_CONTENT);
    await ownershipFile.sync();
    ownershipIdentity = await ownershipFile.stat();
    const directoryHandle = await open(canonicalDirectory, 'r');
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await ownershipFile.close().catch(() => undefined);
    await unlink(ownershipPath).catch(() => undefined);
    throw error;
  }
  let writing = false;
  let closed = false;

  const assertOwned = async (): Promise<void> => {
    if (closed) throw new Error('DOSAI_CAPSULE_STORE_CLOSED_0001');
    let current: Awaited<ReturnType<typeof lstat>>;
    try {
      current = await lstat(ownershipPath);
    } catch {
      throw new Error('DOSAI_CAPSULE_STORE_OWNERSHIP_0001');
    }
    if (
      !current.isFile() ||
      current.isSymbolicLink() ||
      (current.mode & 0o077) !== 0 ||
      current.dev !== ownershipIdentity.dev ||
      current.ino !== ownershipIdentity.ino
    ) {
      throw new Error('DOSAI_CAPSULE_STORE_OWNERSHIP_0001');
    }
  };

  const load = async (): Promise<CapsuleRegistryDocument | null> => {
    await assertOwned();
    const document = await loadStateDocument(statePath);
    await assertOwned();
    return document;
  };

  const save = async (candidate: unknown): Promise<CapsuleRegistryDocument> => {
    if (writing) throw new Error('DOSAI_CAPSULE_STORE_BUSY_0001');
    writing = true;
    let temporaryPath: string | undefined;
    let temporaryExists = false;
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await assertOwned();
      const document = admitCapsuleRegistryDocument(candidate);
      const bytes = serializeCapsuleRegistryDocument(document);
      if (bytes.byteLength > MAXIMUM_REGISTRY_BYTES) {
        throw new Error('DOSAI_CAPSULE_STORE_SIZE_0001');
      }
      temporaryPath = join(
        canonicalDirectory,
        `.${STATE_FILE_NAME}.${document.supervisor_generation}.${document.revision}.tmp`,
      );
      const current = await load();
      if (current !== null && BigInt(document.revision) <= BigInt(current.revision)) {
        throw new Error('DOSAI_CAPSULE_STORE_REVISION_0001');
      }
      file = await open(temporaryPath, 'wx', 0o600);
      temporaryExists = true;
      await file.writeFile(bytes);
      await file.sync();
      await file.close();
      file = undefined;
      await assertOwned();
      await stateFileMetadata(statePath);
      await rename(temporaryPath, statePath);
      temporaryExists = false;
      const directoryHandle = await open(canonicalDirectory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
      await stateFileMetadata(statePath);
      await assertOwned();
      return document;
    } finally {
      if (file !== undefined) await file.close().catch(() => undefined);
      if (temporaryExists && temporaryPath !== undefined) {
        await unlink(temporaryPath).catch(() => undefined);
      }
      writing = false;
    }
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    if (writing) throw new Error('DOSAI_CAPSULE_STORE_BUSY_0001');
    let ownershipError: unknown;
    try {
      await assertOwned();
    } catch (error) {
      ownershipError = error;
    }
    closed = true;
    await ownershipFile.close();
    if (ownershipError !== undefined) throw ownershipError;
    await unlink(ownershipPath);
    const directoryHandle = await open(canonicalDirectory, 'r');
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  };

  return Object.freeze({
    directory: canonicalDirectory,
    statePath,
    ownershipPath,
    load,
    save,
    close,
  });
}
