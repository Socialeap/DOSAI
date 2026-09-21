import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { createSchemaValidator, requireValid } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const v8Path = resolve(root, 'docs/architecture/process-ownership-v8.json');
const v9Path = resolve(root, 'docs/architecture/process-ownership-v9.json');
const v17Path = resolve(root, 'docs/architecture/schema-registry-v17.json');
const v18Path = resolve(root, 'docs/architecture/schema-registry-v18.json');
const validator = await createSchemaValidator(root, [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v1/watchdog-control-session.schema.json',
  'docs/architecture/schemas/v1/watchdog-control-request.schema.json',
  'docs/architecture/schemas/v1/watchdog-control-response.schema.json',
]);

const ids = Object.freeze({
  boot: randomUUID(),
  capsule: randomUUID(),
  coordinator: randomUUID(),
  request: randomUUID(),
  response: randomUUID(),
  session: randomUUID(),
});

function session(overrides = {}) {
  return {
    schema_id: 'urn:dosai:schema:watchdog-control-session:1',
    schema_version: 1,
    service_boot_id: ids.boot,
    service_generation: '1',
    session_id: ids.session,
    coordinator_instance_id: ids.coordinator,
    protocol: 'DOSAI_WATCHDOG_XPC_V1',
    peer_assurance: 'XPC_MUTUAL_CODE_REQUIREMENT',
    mode: 'INERT_TEST_FIXTURE',
    sequence_start: '1',
    limits: {
      max_frame_bytes: 4096,
      max_cached_responses: 64,
      max_inspect_pending: 8,
      max_stop_one_pending: 16,
      reserved_stop_all_slots: 1,
      response_timeout_ms: 1000,
    },
    disconnect_behavior: 'STOP_ALL',
    authorization: 'NO_EFFECT_TEST_ONLY',
    ...overrides,
  };
}

function request(operation = 'STOP_ONE', overrides = {}) {
  const candidate = {
    schema_id: 'urn:dosai:schema:watchdog-control-request:1',
    schema_version: 1,
    request_id: ids.request,
    session_id: ids.session,
    service_boot_id: ids.boot,
    service_generation: '1',
    sequence: '1',
    operation,
    supervisor_generation: '7',
    authorization: 'NO_EFFECT_TEST_ONLY',
  };
  if (operation === 'STOP_ONE') {
    Object.assign(candidate, { capsule_id: ids.capsule, reason: 'OWNER_REQUEST' });
  } else if (operation === 'STOP_ALL') {
    Object.assign(candidate, { reason: 'COORDINATOR_DISCONNECT' });
  }
  return { ...candidate, ...overrides };
}

function response(overrides = {}) {
  return {
    schema_id: 'urn:dosai:schema:watchdog-control-response:1',
    schema_version: 1,
    response_id: ids.response,
    request_id: ids.request,
    session_id: ids.session,
    service_boot_id: ids.boot,
    service_generation: '1',
    sequence: '1',
    operation: 'STOP_ONE',
    result: {
      kind: 'STOP_RESULT',
      scope: 'ONE',
      disposition: 'STOPPED',
      capsule_ids: [ids.capsule],
    },
    ...overrides,
  };
}

test('accepted process ownership v9 is bounded over immutable accepted v8', async () => {
  const v8Bytes = await readFile(v8Path);
  const v8 = JSON.parse(v8Bytes);
  const v9 = JSON.parse(await readFile(v9Path, 'utf8'));
  const digest = createHash('sha256').update(v8Bytes).digest('hex');
  assert.equal(digest, '00b8b078ad0186497063660f90c320b807e2d7b3991eb7be8f4d05cb8a7f730d');
  assert.equal(v9.schema_version, 9);
  assert.equal(v9.status, 'ACCEPTED');
  assert.deepEqual(v9.supersedes, {
    path: 'docs/architecture/process-ownership-v8.json',
    sha256: digest,
  });
  assert.equal(
    v9.accepted_adrs.at(-1),
    'docs/decisions/0020-per-user-execution-service-watchdog-control-lane.md',
  );

  assert.deepEqual(
    v9.source_boundaries.filter(({ id }) => id !== 'main'),
    v8.source_boundaries.filter(({ id }) => id !== 'main'),
  );
  const main = v9.source_boundaries.find(({ id }) => id === 'main');
  const oldMain = v8.source_boundaries.find(({ id }) => id === 'main');
  assert.equal(main.may_hold_authority, false);
  assert.deepEqual(main.allowed_first_party_imports, oldMain.allowed_first_party_imports);
  assert.deepEqual(main.allowed_external_imports, oldMain.allowed_external_imports);
  assert.equal(main.watchdog_client_contract, 'TYPED_UNCOMPOSED_TEST_FIXTURE_ONLY');
  assert.equal(main.watchdog_service_configuration_authority, false);
  assert.equal(main.watchdog_peer_requirement_authority, false);

  assert.deepEqual(
    v9.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v8.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const service = v9.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.application_reachable, false);
  assert.equal(service.authority, 'TEST_ONLY_INERT_CAPSULE_REDUCE_ONLY_CONTROL');
  assert.deepEqual(service.control_operations, ['INSPECT', 'STOP_ONE', 'STOP_ALL']);
  for (const field of [
    'production_registration_authority',
    'generic_payload_authority',
    'pid_targeting_authority',
    'ownership_release_authority',
    'reconciliation_authority',
    'journal_authority',
    'vm_creation_authority',
    'vm_start_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('accepted schema registry v18 changes only the three watchdog contracts over immutable v17', async () => {
  const v17Bytes = await readFile(v17Path);
  const v17 = JSON.parse(v17Bytes);
  const v18 = JSON.parse(await readFile(v18Path, 'utf8'));
  assert.equal(
    createHash('sha256').update(v17Bytes).digest('hex'),
    'c927e8675bfe4f71adf153d9ca73ea92fa27025f25776231b3d1980160e56e12',
  );
  assert.equal(v18.registry_version, 18);
  assert.equal(v18.supersedes, v17.registry_id);
  assert.equal(v18.status, 'ACCEPTED');
  const addedNames = new Set([
    'watchdog-control-session',
    'watchdog-control-request',
    'watchdog-control-response',
  ]);
  assert.deepEqual(
    v18.schemas.filter(({ name }) => !addedNames.has(name)),
    v17.schemas,
  );
  assert.deepEqual(
    v18.schemas.filter(({ name }) => addedNames.has(name)).map(({ name }) => name),
    [...addedNames],
  );
});

test('watchdog schemas admit only fixed test sessions and reduce-only operations', () => {
  requireValid(validator, session().schema_id, session());
  requireValid(validator, request('INSPECT').schema_id, request('INSPECT'));
  requireValid(validator, request('STOP_ONE').schema_id, request('STOP_ONE'));
  requireValid(validator, request('STOP_ALL').schema_id, request('STOP_ALL'));
  requireValid(validator, response().schema_id, response());

  const invalidSessions = [
    session({ mode: 'PRODUCTION' }),
    session({ authorization: 'EXECUTION_ALLOWED' }),
    session({ disconnect_behavior: 'KEEP_RUNNING' }),
    session({ limits: { ...session().limits, reserved_stop_all_slots: 0 } }),
    { ...session(), credential: 'not-allowed' },
  ];
  for (const candidate of invalidSessions) {
    assert.equal(validator.getSchema(candidate.schema_id)?.(candidate), false);
  }

  const invalidRequests = [
    request('START'),
    request('STOP_ONE', { sequence: '0' }),
    request('STOP_ONE', { capsule_id: undefined }),
    request('STOP_ONE', { pid: 123 }),
    request('STOP_ALL', { path: '/tmp/capsule' }),
    request('STOP_ALL', { executable: '/bin/kill' }),
    request('STOP_ALL', { payload: {} }),
    request('STOP_ALL', { authorization: 'EXECUTION_ALLOWED' }),
  ];
  for (const candidate of invalidRequests) {
    assert.equal(validator.getSchema(candidate.schema_id)?.(candidate), false);
  }

  const invalidResponses = [
    response({ result: { ...response().result, pid: 123 } }),
    response({ result: { kind: 'STOP_RESULT', scope: 'ONE', disposition: 'RUNNING', capsule_ids: [] } }),
    response({ operation: 'INSPECT' }),
    response({ operation: 'STOP_ALL' }),
    response({ result: { kind: 'REJECTED', code: 'DOSAI_UNKNOWN_0001', safe_message: 'no', retry_disposition: 'NEVER' } }),
    { ...response(), path: '/tmp/capsule' },
  ];
  for (const candidate of invalidResponses) {
    assert.equal(validator.getSchema(candidate.schema_id)?.(candidate), false);
  }
});

test('accepted boundary chain admits only the exact inert execution-service source set', async () => {
  const serviceRoot = resolve(root, 'native-helpers/execution-service');
  const entries = await readdir(serviceRoot, { recursive: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
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
