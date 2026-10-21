import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('corrected Debian recommendation binds separate references by key purpose', async () => {
  const record = parseStrictJson(await readFile(resolve(
    root,
    'docs/architecture/p3-debian-archive-trust-root-source-recommendation-v2.json',
  )));
  assert.equal(record.status, 'OWNER_AUTHORIZED_OBSERVATION_PENDING');
  assert.equal(record.supersedes.sha256, '006b60c83a6404b18ff4c5463d26f9d126d28efd74b97add9f2e5be40b82a266');
  assert.equal(
    sha256(await readFile(resolve(root, record.supersedes.path))),
    record.supersedes.sha256,
  );
  assert.equal(record.key_material_sources.length, 3);
  assert.deepEqual(record.independent_references.map(reference => reference.covers_purposes), [
    ['DEBIAN_13_ARCHIVE_AUTOMATIC', 'DEBIAN_13_SECURITY_ARCHIVE_AUTOMATIC'],
    ['DEBIAN_13_STABLE_RELEASE'],
  ]);
  assert.equal(record.independent_references[1].source_package, 'debian-archive-keyring');
  assert.equal(record.independent_references[1].source_package_version, '2025.1');
  assert.equal(record.observation_contract.retry_allowed, false);
  assert.ok(Object.values(record.authorities).every(value => value === false));
});

test('manual host workflow has two standard zero-authority observation jobs only', async () => {
  const source = await readFile(resolve(
    root,
    '.github/workflows/p3-native-builder-host-feasibility.yml',
  ), 'utf8');
  assert.match(source, /^name: P3 native builder host feasibility$/m);
  assert.match(source, /^  workflow_dispatch:$/m);
  assert.match(source, /^permissions: \{\}$/m);
  assert.equal((source.match(/runs-on: ubuntu-24\.04/g) ?? []).length, 2);
  assert.equal((source.match(/name: BUILDER_HOST_[AB]/g) ?? []).length, 2);
  assert.equal((source.match(/DOSAI_HOST_OBSERVATION_V1:/g) ?? []).length, 2);
  assert.equal((source.match(/DOSAI_HOST_OBSERVATION_FAILURE_V1:/g) ?? []).length, 2);
  assert.equal((source.match(/docker version --format/g) ?? []).length, 2);
  assert.equal((source.match(/dmi\/id\/product_uuid/g) ?? []).length, 4);
  assert.equal((source.match(/\/proc\/sys\/fs\/binfmt_misc/g) ?? []).length, 4);
  for (const code of [
    'RUNNER_ENVIRONMENT_MISMATCH',
    'RUNNER_OS_MISMATCH',
    'RUNNER_ARCH_MISMATCH',
    'UNAME_MACHINE_MISMATCH',
    'IMAGE_OS_MISSING',
    'IMAGE_VERSION_MISSING',
    'DMI_UUID_UNREADABLE',
    'DMI_UUID_READ_FAILED',
    'DMI_UUID_EMPTY',
    'DOCKER_ARCH_QUERY_FAILED',
    'DOCKER_ARCH_MISMATCH',
    'BINFMT_MISC_DIRECTORY_MISSING',
    'BINFMT_MISC_SCAN_FAILED',
    'BINFMT_MISC_INTERPRETER_ACTIVE',
    'RECEIPT_EMISSION_FAILED',
  ]) {
    assert.equal((source.match(new RegExp(`\\|\\| fail ${code}\\b`, 'g')) ?? []).length, 2, code);
  }
  assert.doesNotMatch(source, /\buses:|checkout|upload-artifact|cache|pull_request|push:|schedule:|secret/i);
});
