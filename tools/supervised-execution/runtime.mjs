import { resolve } from 'node:path';
import { createSchemaValidator } from '../dosai-acceptance/src/schema-validator.mjs';
import { createFixtureExecution } from './engine.ts';

export async function createLocalFixtureSession(databasePath, overrides = {}) {
  const root = resolve(import.meta.dirname, '../..');
  const validator = await createSchemaValidator(root, [
    'common', 'operation', 'resource-precondition', 'action-plan',
    'policy-decision', 'execution-grant', 'local-owner-approval',
  ].map(name => `docs/architecture/schemas/v1/${name}.schema.json`));
  return createFixtureExecution({
    databasePath,
    validate: (id, value) => validator.getSchema(id)?.(value) === true,
    configuration: () => ({ enabled: true, mode: 'FIXTURE_ONLY', generation: '1' }),
    policyContext: ({ actorId, sessionId, resourceId }) => ({
      policyAvailable: true, actorId, actorGeneration: '1', sessionId, resourceId, resourceGeneration: '1',
      actorCapabilities: ['policy.preflight'], ownerCapabilities: ['policy.preflight'],
      policyCapabilities: ['policy.preflight'], capabilityEnvelopeActive: false, capabilityEnvelopeCapabilities: [],
    }),
    ...overrides,
  });
}
