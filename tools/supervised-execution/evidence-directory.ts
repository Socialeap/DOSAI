import { lstat, mkdir, mkdtemp, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

type EvidencePrefix = 'supervised-fixture-' | 'execution-benchmark-';

// Both developer runners use this gate before creating a session or opening a journal.
export async function createEvidenceDirectory(repositoryRoot: string, prefix: EvidencePrefix): Promise<string> {
  try {
    if (prefix !== 'supervised-fixture-' && prefix !== 'execution-benchmark-') throw new Error();
    const root = await realpath(repositoryRoot);
    if (!(await lstat(root)).isDirectory()) throw new Error();
    const evidence = join(root, 'evidence');

    async function checkedRoot() {
      const stat = await lstat(evidence);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error();
      const canonical = await realpath(evidence);
      if (canonical !== evidence || relative(root, canonical) !== 'evidence') throw new Error();
      return stat;
    }

    // Inspect before mkdir: recursive mkdir would follow an existing directory symlink.
    try {
      await lstat(evidence);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      // Exclusive, nonrecursive creation. A concurrent creator is checked below.
      try { await mkdir(evidence, { mode: 0o700 }); }
      catch (creationError) {
        if (!(creationError instanceof Error) || !('code' in creationError) || creationError.code !== 'EEXIST') throw creationError;
      }
    }
    const before = await checkedRoot();
    const candidate = await mkdtemp(join(evidence, prefix));
    const after = await checkedRoot();
    const stat = await lstat(candidate);
    const directory = await realpath(candidate);
    const child = relative(evidence, directory);
    if (before.dev !== after.dev || before.ino !== after.ino || stat.isSymbolicLink() || !stat.isDirectory() ||
        directory !== resolve(candidate) || !child.startsWith(prefix) || child.includes(sep)) throw new Error();
    return directory;
  } catch {
    // Never follow an uncertain path for cleanup, and never echo filesystem exception data.
    throw new Error('EVIDENCE_ROOT_REJECTED');
  }
}
