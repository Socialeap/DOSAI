import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const builderSchema = Object.freeze({
  name: 'linux-builder-manifest',
  schema_id: 'urn:dosai:schema:linux-builder-manifest:2',
  version: 2,
  owner_phase: 'P3',
  state: 'DEFINED',
  path: 'schemas/v2/linux-builder-manifest.schema.json',
});

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

async function sourceFiles(path) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }
  return files;
}

function builderEntry(registry) {
  return registry.schemas.find(({ name }) => name === 'linux-builder-manifest');
}

function assertAcceptanceBoundary({ acceptanceRecord, v16, v17, v18, plan, remediation, watchdogEvidence }) {
  assert.equal(v16.status, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.equal(v17.status, 'ACCEPTED');
  assert.equal(v18.status, 'ACCEPTED');
  assert.equal(acceptanceRecord.status, 'ACCEPTED');
  assert.equal(acceptanceRecord.declaration.v16_status_remains, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.equal(acceptanceRecord.declaration.v2_contract_status, 'DECLARATION_ONLY');
  assert.equal(acceptanceRecord.declaration.authority_change, 'NONE');
  assert.ok(Object.values(acceptanceRecord.authorities).every((value) => value === false));
  assert.equal(v17.supersedes, v16.registry_id);
  assert.equal(v18.supersedes, v17.registry_id);
  assert.deepEqual(builderEntry(v16), builderSchema);
  assert.deepEqual(builderEntry(v17), builderEntry(v16));
  assert.deepEqual(builderEntry(v18), builderEntry(v16));
  assert.match(
    remediation,
    /does not resolve or download a\npackage closure, verify a signature, prepare an image, or authorize a build\./,
  );
  assert.match(
    remediation,
    /Schema registry v16 is a narrow proposal\.[\s\S]*?non-authorizing v2 declaration\./,
  );
  assert.match(
    watchdogEvidence,
    /Registry v16 and Linux builder manifest v2 remain unchanged and retain their\n  existing owner-review status\./,
  );
  assert.match(
    plan,
    /v16\/v2 declaration acceptance record\.[\s\S]*?retains every builder authority false\./,
  );
}

async function loadBoundary() {
  const [v16Bytes, acceptanceRecord, v16, v17, v18, plan, remediation, watchdogEvidence] = await Promise.all([
    readFile(resolve(root, 'docs/architecture/schema-registry-v16.json')),
    readJson('docs/architecture/p3-linux-builder-v2-acceptance-record.json'),
    readJson('docs/architecture/schema-registry-v16.json'),
    readJson('docs/architecture/schema-registry-v17.json'),
    readJson('docs/architecture/schema-registry-v18.json'),
    readFile(resolve(root, 'docs/development/live-development-plan.md'), 'utf8'),
    readFile(resolve(root, 'docs/development/p3-linux-builder-snapshot-contract-remediation.md'), 'utf8'),
    readFile(resolve(root, 'docs/development/p3-watchdog-control-contract-evidence.md'), 'utf8'),
  ]);
  return {
    v16Bytes,
    acceptanceRecord,
    v16,
    v17,
    v18,
    plan,
    remediation,
    watchdogEvidence,
  };
}

test('later registries preserve v16 while the accepted record governs its declaration-only status', async () => {
  const boundary = await loadBoundary();
  assert.equal(
    createHash('sha256').update(boundary.v16Bytes).digest('hex'),
    '5fe93957da3af2eea4e1bbdd29034ab42dbe57eac747ff3f5e366eb86368144e',
  );
  assertAcceptanceBoundary(boundary);
});

test('builder-acceptance boundary rejects false promotion, acceptance-record regression, and successor mutation', async () => {
  const boundary = await loadBoundary();
  const promoted = structuredClone(boundary);
  promoted.v16.status = 'ACCEPTED';
  assert.throws(() => assertAcceptanceBoundary(promoted), assert.AssertionError);

  const regressedRecord = structuredClone(boundary);
  regressedRecord.acceptanceRecord.status = 'PROPOSED_FOR_OWNER_REVIEW';
  assert.throws(() => assertAcceptanceBoundary(regressedRecord), assert.AssertionError);

  const mutatedSuccessor = structuredClone(boundary);
  builderEntry(mutatedSuccessor.v18).schema_id = 'urn:dosai:schema:linux-builder-manifest:3';
  assert.throws(() => assertAcceptanceBoundary(mutatedSuccessor), assert.AssertionError);
});

test('application-boundary source cannot consume the declaration-only builder contract', async () => {
  const applicationRoots = [
    resolve(root, 'src/main'),
    resolve(root, 'src/preload'),
    resolve(root, 'src/renderer'),
  ];
  const files = (await Promise.all(applicationRoots.map(sourceFiles))).flat();
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /builder-input-v2|linux-builder-manifest/);
  }
});
