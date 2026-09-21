import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { runFixed } from '../tools/dosai-acceptance/src/fixed-process.mjs';

export const preservedV50Package =
  '/private/tmp/dosai-v50-proof/out/DOSAI-darwin-arm64/DOSAI.app';
export const stagedV50Package =
  '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app';
export const expectedV50PackageManifestEntries = 606;
export const expectedV50PackageManifestSha256 =
  '9a842b75f49aaf26c1f58e8fe83f654d1940310afbfe5606b7247a781bdc31e7';

const expectedTeamIdentifier = '3RD3TADLRY';
const codesignEnvironment = Object.freeze({ LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' });

async function computeManifest(root) {
  const rootMetadata = await lstat(root);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error('V50_PACKAGE_ROOT_REJECTED');
  }
  const records = [];
  async function walk(directory) {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) {
        records.push(['L', path, await readlink(absolute)]);
      } else if (metadata.isDirectory()) {
        records.push(['D', path, metadata.mode & 0o7777]);
        await walk(absolute);
      } else if (metadata.isFile()) {
        const bytes = await readFile(absolute);
        records.push([
          'F',
          path,
          metadata.mode & 0o7777,
          bytes.length,
          createHash('sha256').update(bytes).digest('hex'),
        ]);
      } else {
        throw new Error('V50_PACKAGE_ENTRY_REJECTED');
      }
    }
  }
  await walk(root);
  return Object.freeze({
    entries: records.length,
    sha256: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
  });
}

function requireSigningDescription(description, identifier) {
  if (
    !description.includes(`Identifier=${identifier}\n`)
    || !description.includes(`TeamIdentifier=${expectedTeamIdentifier}\n`)
    || description.includes('Signature=adhoc')
  ) {
    throw new Error('V50_PACKAGE_IDENTITY_REJECTED');
  }
}

async function verifyCodeSignature(path, identifier, deep = false) {
  await runFixed('/usr/bin/codesign', [
    '--verify',
    ...(deep ? ['--deep'] : []),
    '--strict',
    '--verbose=2',
    path,
  ], { env: codesignEnvironment, timeout: 30_000 });
  const description = await runFixed(
    '/usr/bin/codesign',
    ['-d', '--verbose=4', path],
    { env: codesignEnvironment, timeout: 30_000 },
  );
  requireSigningDescription(description.stderr, identifier);
}

async function verifyFixedPackage(root, kind) {
  const manifest = await computeManifest(root);
  if (
    manifest.entries !== expectedV50PackageManifestEntries
    || manifest.sha256 !== expectedV50PackageManifestSha256
  ) {
    throw new Error('V50_PACKAGE_MANIFEST_REJECTED');
  }
  await verifyCodeSignature(
    join(root, 'Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture'),
    'com.socialeap.dosai.execution-service-fixture',
  );
  await verifyCodeSignature(
    join(root, 'Contents/Resources/dosai-service-management-lifecycle.node'),
    'com.socialeap.dosai.service-management-lifecycle-addon',
  );
  await verifyCodeSignature(root, 'com.socialeap.dosai', true);
  return Object.freeze({
    identities_verified: true,
    kind,
    manifest_entries: manifest.entries,
    manifest_sha256: manifest.sha256,
    result: 'PASS',
    team_identifier: expectedTeamIdentifier,
  });
}

export async function verifyPreservedV50Package() {
  return verifyFixedPackage(preservedV50Package, 'PRESERVED_SOURCE');
}

export async function verifyStagedV50Package() {
  return verifyFixedPackage(stagedV50Package, 'STAGED_COPY');
}
