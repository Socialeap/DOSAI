import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');

test('accepted guest supply-chain decision remains execution-ineligible', async () => {
  const [decision, evidence, registry] = await Promise.all([
    readFile(
      resolve(root, 'docs/decisions/0015-reproducible-linux-guest-supply-chain.md'),
      'utf8',
    ),
    readFile(resolve(root, 'docs/development/p3-guest-supply-chain-evaluation.md'), 'utf8'),
    readFile(resolve(root, 'docs/architecture/schema-registry-v12.json'), 'utf8').then(JSON.parse),
  ]);

  assert.match(decision, /\*\*Status:\*\* Accepted/);
  assert.match(decision, /Buildroot `2025\.02\.x` long-term-support series/);
  assert.match(decision, /Linux `6\.12` longterm series/);
  assert.match(decision, /Two independent clean Linux builders/);
  assert.match(decision, /CycloneDX output alone does not satisfy this requirement/);
  assert.match(decision, /successor contract must\s+bind what boots/);
  assert.match(decision, /No execution capability changes with this ADR/);
  assert.match(evidence, /\*\*Status:\*\* `ACCEPTED`/);
  assert.equal(registry.status, 'ACCEPTED');

  const guestSchema = registry.schemas.find(({ name }) => name === 'guest-artifact-manifest');
  assert.equal(guestSchema?.schema_id, 'urn:dosai:schema:guest-artifact-manifest:1');

  const executionService = resolve(root, 'native-helpers/execution-service');
  const entries = await readdir(executionService).catch((error) => {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  assert.deepEqual(entries.sort(), [
    'WatchdogControlCore.swift',
    'WatchdogLaunchAgentStatusCandidate.swift',
    'WatchdogNamedListenerCandidate.swift',
    'WatchdogNamedListenerTransportCandidate.swift',
    'WatchdogNamedServiceFixtureMain.swift',
    'WatchdogXPCFixtureMain.swift',
    'WatchdogXPCTransport.swift',
    'com.socialeap.dosai.execution-service-fixture.plist',
    'main.swift',
  ]);
});
