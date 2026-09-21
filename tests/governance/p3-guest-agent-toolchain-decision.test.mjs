import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const acceptedV13Digest = 'b57a67eadec3245d96cb21d765b3a728788a1c3f3c59917e26cd121fadf0e642';

test('accepted guest-agent toolchain remains source-only and execution-ineligible', async () => {
  const [decision, evidence, registryText, compositionEvidence] = await Promise.all([
    readFile(resolve(root, 'docs/decisions/0016-guest-agent-language-and-toolchain.md'), 'utf8'),
    readFile(resolve(root, 'docs/development/p3-guest-agent-toolchain-evaluation.md'), 'utf8'),
    readFile(resolve(root, 'docs/architecture/schema-registry-v13.json'), 'utf8'),
    readFile(resolve(root, 'docs/development/p3-guest-composition-contract-evidence.md'), 'utf8'),
  ]);
  const registry = JSON.parse(registryText);

  assert.match(decision, /\*\*Status:\*\* Accepted/);
  assert.match(decision, /Go `1\.25\.12`/);
  assert.match(decision, /f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932/);
  assert.match(decision, /Go `1\.23\.12`.*stopped receiving\s+security fixes/s);
  assert.match(decision, /`host-go-bin`.*forbidden/s);
  assert.match(decision, /GOTOOLCHAIN=local/);
  assert.match(decision, /GOPROXY=off/);
  assert.match(decision, /GOSUMDB=off/);
  assert.match(decision, /-mod=vendor/);
  assert.match(decision, /two independent clean\s+builders/);
  assert.match(decision, /This ADR adds no guest source/);
  assert.match(evidence, /\*\*Status:\*\* `ACCEPTED`/);
  assert.match(evidence, /No guest source, dependency, source archive, compiler/);

  assert.equal(registry.status, 'ACCEPTED');
  assert.equal(createHash('sha256').update(registryText).digest('hex'), acceptedV13Digest);
  assert.match(compositionEvidence, new RegExp(acceptedV13Digest));
  const guestSchema = registry.schemas.find(({ name }) => name === 'guest-artifact-manifest');
  assert.equal(guestSchema?.schema_id, 'urn:dosai:schema:guest-artifact-manifest:2');

  const forbiddenRoots = ['guest', 'guest-agent', 'br2-external'];
  for (const path of forbiddenRoots) {
    const entries = await readdir(resolve(root, path)).catch((error) => {
      if (error?.code === 'ENOENT') {
        return [];
      }
      throw error;
    });
    assert.deepEqual(entries, [], `${path} must remain absent or empty`);
  }
  assert.deepEqual(
    (await readdir(resolve(root, 'native-helpers/execution-service'))).sort(),
    [
      'WatchdogControlCore.swift',
      'WatchdogLaunchAgentStatusCandidate.swift',
      'WatchdogNamedListenerCandidate.swift',
      'WatchdogNamedListenerTransportCandidate.swift',
      'WatchdogNamedServiceFixtureMain.swift',
      'WatchdogXPCFixtureMain.swift',
      'WatchdogXPCTransport.swift',
      'com.socialeap.dosai.execution-service-fixture.plist',
      'main.swift',
    ],
  );
});
