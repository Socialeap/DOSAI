import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  admitWatchdogControlRequest,
  admitWatchdogControlResponse,
  admitWatchdogControlSession,
} from '../../src/contracts/p3/watchdog-control.ts';
import { WatchdogControlClient } from '../../src/main/execution/watchdog-control-client.ts';

const session = Object.freeze({
  schema_id: 'urn:dosai:schema:watchdog-control-session:1',
  schema_version: 1,
  service_boot_id: '11111111-1111-4111-8111-111111111111',
  service_generation: '1',
  session_id: '22222222-2222-4222-8222-222222222222',
  coordinator_instance_id: '33333333-3333-4333-8333-333333333333',
  protocol: 'DOSAI_WATCHDOG_XPC_V1',
  peer_assurance: 'XPC_MUTUAL_CODE_REQUIREMENT',
  mode: 'INERT_TEST_FIXTURE',
  sequence_start: '1',
  limits: Object.freeze({
    max_frame_bytes: 4096,
    max_cached_responses: 64,
    max_inspect_pending: 8,
    max_stop_one_pending: 16,
    reserved_stop_all_slots: 1,
    response_timeout_ms: 1000,
  }),
  disconnect_behavior: 'STOP_ALL',
  authorization: 'NO_EFFECT_TEST_ONLY',
});

const requestIds = [
  '44444444-4444-4444-8444-444444444441',
  '44444444-4444-4444-8444-444444444442',
  '44444444-4444-4444-8444-444444444443',
  '44444444-4444-4444-8444-444444444444',
];

function responseFor(request, result, responseId = '55555555-5555-4555-8555-555555555555') {
  return {
    schema_id: 'urn:dosai:schema:watchdog-control-response:1',
    schema_version: 1,
    response_id: responseId,
    request_id: request.request_id,
    session_id: request.session_id,
    service_boot_id: request.service_boot_id,
    service_generation: request.service_generation,
    sequence: request.sequence,
    operation: request.operation,
    result,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return Object.freeze({ promise, resolve });
}

test('watchdog runtime admission is exact, detached, frozen, and accessor-safe', () => {
  const admittedSession = admitWatchdogControlSession(session);
  assert.notEqual(admittedSession, session);
  assert.ok(Object.isFrozen(admittedSession));
  assert.ok(Object.isFrozen(admittedSession.limits));

  const inspect = {
    schema_id: 'urn:dosai:schema:watchdog-control-request:1',
    schema_version: 1,
    request_id: requestIds[0],
    session_id: session.session_id,
    service_boot_id: session.service_boot_id,
    service_generation: '1',
    sequence: '1',
    operation: 'INSPECT',
    supervisor_generation: '7',
    authorization: 'NO_EFFECT_TEST_ONLY',
  };
  assert.deepEqual(admitWatchdogControlRequest(inspect), inspect);
  assert.throws(() => admitWatchdogControlRequest({ ...inspect, path: '/tmp/unsafe' }), /SCHEMA/);
  assert.throws(() => admitWatchdogControlRequest({ ...inspect, operation: 'START' }), /SCHEMA/);
  assert.throws(() => admitWatchdogControlRequest({ ...inspect, sequence: '0' }), /SCHEMA/);

  let invoked = false;
  const hostile = { ...inspect };
  Object.defineProperty(hostile, 'operation', {
    enumerable: true,
    get() {
      invoked = true;
      return 'INSPECT';
    },
  });
  assert.throws(() => admitWatchdogControlRequest(hostile), /SCHEMA/);
  assert.equal(invoked, false);
});

test('typed client emits only sequential bound requests through its injected transport', async () => {
  const observed = [];
  let idIndex = 0;
  const transport = Object.freeze({
    async exchange(request) {
      observed.push(request);
      if (request.operation === 'INSPECT') {
        return responseFor(request, {
          kind: 'INSPECTION',
          capsules: [
            {
              capsule_id: '66666666-6666-4666-8666-666666666661',
              supervisor_generation: '7',
              state: 'FAILED',
            },
            {
              capsule_id: '66666666-6666-4666-8666-666666666662',
              supervisor_generation: '7',
              state: 'QUARANTINED',
            },
          ],
        });
      }
      return responseFor(request, {
        kind: 'STOP_RESULT',
        scope: request.operation === 'STOP_ONE' ? 'ONE' : 'ALL',
        disposition: request.operation === 'STOP_ONE' ? 'STOPPED' : 'QUARANTINED',
        capsule_ids: request.operation === 'STOP_ONE' ? [request.capsule_id] : [],
      });
    },
  });
  const client = new WatchdogControlClient(session, transport, () => requestIds[idIndex++]);
  const inspected = await client.inspect('7');
  const stopped = await client.stopOne(
    '7',
    '66666666-6666-4666-8666-666666666661',
    'OWNER_REQUEST',
  );
  const stoppedAll = await client.stopAll('7', 'EMERGENCY_STOP');

  assert.deepEqual(observed.map(({ operation, sequence }) => [operation, sequence]), [
    ['INSPECT', '1'],
    ['STOP_ONE', '2'],
    ['STOP_ALL', '3'],
  ]);
  assert.deepEqual(inspected.result.capsules.map(({ state }) => state), ['FAILED', 'QUARANTINED']);
  assert.equal(stopped.result.disposition, 'STOPPED');
  assert.equal(stoppedAll.result.disposition, 'QUARANTINED');
  assert.ok(observed.every(Object.isFrozen));
});

test('concurrent ordinary requests never overlap injected transport dispatch', async () => {
  const observed = [];
  const replies = [];
  let idIndex = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const client = new WatchdogControlClient(
    session,
    Object.freeze({
      exchange(request) {
        observed.push(request);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const reply = deferred();
        replies.push({
          request,
          resolve(result) {
            inFlight -= 1;
            reply.resolve(result);
          },
        });
        return reply.promise;
      },
    }),
    () => requestIds[idIndex++],
  );

  const first = client.inspect('7');
  const second = client.stopOne(
    '7',
    '66666666-6666-4666-8666-666666666661',
    'OWNER_REQUEST',
  );
  const third = client.inspect('7');
  assert.deepEqual(observed.map(({ operation, sequence }) => [operation, sequence]), [
    ['INSPECT', '1'],
  ]);

  replies.shift().resolve(responseFor(observed[0], { kind: 'INSPECTION', capsules: [] }));
  await first;
  assert.deepEqual(observed.map(({ operation, sequence }) => [operation, sequence]), [
    ['INSPECT', '1'],
    ['STOP_ONE', '2'],
  ]);
  replies.shift().resolve(responseFor(observed[1], {
    kind: 'STOP_RESULT',
    scope: 'ONE',
    disposition: 'STOPPED',
    capsule_ids: ['66666666-6666-4666-8666-666666666661'],
  }));
  await second;
  replies.shift().resolve(responseFor(observed[2], { kind: 'INSPECTION', capsules: [] }));
  await third;

  assert.equal(maxInFlight, 1);
  assert.equal(idIndex, 3);
});

test('an emergency stop-all precedes every unissued ordinary request and receives the next sequence', async () => {
  const observed = [];
  const replies = [];
  let idIndex = 0;
  const client = new WatchdogControlClient(
    session,
    Object.freeze({
      exchange(request) {
        observed.push(request);
        const reply = deferred();
        replies.push({ request, resolve: reply.resolve });
        return reply.promise;
      },
    }),
    () => requestIds[idIndex++],
  );

  const first = client.inspect('7');
  const ordinary = client.stopOne(
    '7',
    '66666666-6666-4666-8666-666666666661',
    'OWNER_REQUEST',
  );
  const emergency = client.stopAll('7', 'EMERGENCY_STOP');
  replies.shift().resolve(responseFor(observed[0], { kind: 'INSPECTION', capsules: [] }));
  await first;

  assert.deepEqual(observed.map(({ operation, sequence }) => [operation, sequence]), [
    ['INSPECT', '1'],
    ['STOP_ALL', '2'],
  ]);
  replies.shift().resolve(responseFor(observed[1], {
    kind: 'STOP_RESULT',
    scope: 'ALL',
    disposition: 'QUARANTINED',
    capsule_ids: [],
  }));
  await emergency;
  assert.deepEqual(observed.map(({ operation, sequence }) => [operation, sequence]), [
    ['INSPECT', '1'],
    ['STOP_ALL', '2'],
    ['STOP_ONE', '3'],
  ]);
  replies.shift().resolve(responseFor(observed[2], {
    kind: 'STOP_RESULT',
    scope: 'ONE',
    disposition: 'STOPPED',
    capsule_ids: ['66666666-6666-4666-8666-666666666661'],
  }));
  await ordinary;
});

test('timeout or invalid response closes the client and rejects queued work before dispatch', async () => {
  let timeoutIdIndex = 0;
  const timeoutObserved = [];
  const timeoutClient = new WatchdogControlClient(
    session,
    Object.freeze({
      exchange(request) {
        timeoutObserved.push(request);
        return new Promise(() => {});
      },
    }),
    () => requestIds[timeoutIdIndex++],
  );
  const timeoutFirst = timeoutClient.inspect('7');
  const timeoutQueued = timeoutClient.stopAll('7', 'OWNER_REQUEST');
  await Promise.all([
    assert.rejects(timeoutFirst, /TIMEOUT/),
    assert.rejects(timeoutQueued, /TIMEOUT/),
  ]);
  assert.equal(timeoutObserved.length, 1);

  let invalidIdIndex = 0;
  const invalidObserved = [];
  const invalidClient = new WatchdogControlClient(
    session,
    Object.freeze({
      async exchange(request) {
        invalidObserved.push(request);
        return { ...responseFor(request, { kind: 'INSPECTION', capsules: [] }), sequence: '2' };
      },
    }),
    () => requestIds[invalidIdIndex++],
  );
  const invalidFirst = invalidClient.inspect('7');
  const invalidQueued = invalidClient.stopAll('7', 'OWNER_REQUEST');
  await Promise.all([
    assert.rejects(invalidFirst, /BINDING/),
    assert.rejects(invalidQueued, /BINDING/),
  ]);
  assert.equal(invalidObserved.length, 1);
});

test('queued capacity is bounded and rejected intents consume no injected transport identity or sequence', async () => {
  const observed = [];
  let generated = 0;
  const client = new WatchdogControlClient(
    session,
    Object.freeze({
      exchange(request) {
        observed.push(request);
        return new Promise(() => {});
      },
    }),
    () => {
      generated += 1;
      return `77777777-7777-4777-8777-${generated.toString(16).padStart(12, '0')}`;
    },
  );

  const accepted = Array.from({ length: 64 }, () => client.inspect('7'));
  const acceptedRejections = accepted.map((request) => request.then(
    () => 'resolved',
    (error) => error,
  ));
  await assert.rejects(() => client.inspect('7'), /SESSION_LIMIT/);
  const rejected = await Promise.all(acceptedRejections);

  assert.ok(rejected.every((error) => error instanceof Error && /SESSION_LIMIT/.test(error.message)));
  assert.equal(generated, 1);
  assert.deepEqual(observed.map(({ sequence }) => sequence), ['1']);
});

test('queued dispatch retains strict response binding', async () => {
  const observed = [];
  const replies = [];
  let idIndex = 0;
  const client = new WatchdogControlClient(
    session,
    Object.freeze({
      exchange(request) {
        observed.push(request);
        const reply = deferred();
        replies.push({ request, resolve: reply.resolve });
        return reply.promise;
      },
    }),
    () => requestIds[idIndex++],
  );

  const first = client.inspect('7');
  const queued = client.stopOne(
    '7',
    '66666666-6666-4666-8666-666666666661',
    'OWNER_REQUEST',
  );
  const queuedRejection = assert.rejects(queued, /BINDING/);
  replies.shift().resolve(responseFor(observed[0], { kind: 'INSPECTION', capsules: [] }));
  await first;
  replies.shift().resolve({
    ...responseFor(observed[1], {
      kind: 'STOP_RESULT',
      scope: 'ONE',
      disposition: 'STOPPED',
      capsule_ids: ['66666666-6666-4666-8666-666666666661'],
    }),
    request_id: requestIds[0],
  });
  await queuedRejection;
  assert.equal(observed.length, 2);
});

test('typed client closes on malformed, oversized, or identity-rebound responses', async () => {
  for (const mutate of [
    (response) => ({ ...response, request_id: requestIds[3] }),
    (response) => ({ ...response, executable: '/bin/sh' }),
    (response) => ({
      ...response,
      result: {
        kind: 'REJECTED',
        code: 'DOSAI_WATCHDOG_SCHEMA_0001',
        safe_message: 'x'.repeat(161),
        retry_disposition: 'NEVER',
      },
    }),
  ]) {
    const client = new WatchdogControlClient(
      session,
      Object.freeze({
        async exchange(request) {
          return mutate(responseFor(request, { kind: 'INSPECTION', capsules: [] }));
        },
      }),
      () => requestIds[0],
    );
    await assert.rejects(() => client.inspect('7'));
    await assert.rejects(() => client.inspect('7'), /CLOSED/);
  }
});

test('typed client bounds the response-cache session and rejects duplicate request identity', async () => {
  const transport = Object.freeze({
    async exchange(request) {
      return responseFor(request, { kind: 'INSPECTION', capsules: [] });
    },
  });
  const duplicate = new WatchdogControlClient(session, transport, () => requestIds[0]);
  await duplicate.inspect('7');
  await assert.rejects(() => duplicate.inspect('7'), /REQUEST_ID/);
  await assert.rejects(() => duplicate.inspect('7'), /CLOSED/);

  let generated = 0;
  let exchanged = 0;
  const bounded = new WatchdogControlClient(
    session,
    Object.freeze({
      async exchange(request) {
        exchanged += 1;
        return responseFor(request, { kind: 'INSPECTION', capsules: [] });
      },
    }),
    () => {
      generated += 1;
      return `77777777-7777-4777-8777-${generated.toString(16).padStart(12, '0')}`;
    },
  );
  for (let index = 0; index < 64; index += 1) await bounded.inspect('7');
  await assert.rejects(() => bounded.inspect('7'), /SESSION_LIMIT/);
  assert.equal(generated, 64);
  assert.equal(exchanged, 64);
});

test('response admission rejects scope confusion and preserves failed versus quarantined', () => {
  const request = admitWatchdogControlRequest({
    schema_id: 'urn:dosai:schema:watchdog-control-request:1',
    schema_version: 1,
    request_id: requestIds[0],
    session_id: session.session_id,
    service_boot_id: session.service_boot_id,
    service_generation: '1',
    sequence: '1',
    operation: 'INSPECT',
    supervisor_generation: '7',
    authorization: 'NO_EFFECT_TEST_ONLY',
  });
  const response = responseFor(request, {
    kind: 'INSPECTION',
    capsules: [
      {
        capsule_id: '66666666-6666-4666-8666-666666666661',
        supervisor_generation: '7',
        state: 'FAILED',
      },
      {
        capsule_id: '66666666-6666-4666-8666-666666666662',
        supervisor_generation: '7',
        state: 'QUARANTINED',
      },
    ],
  });
  const admitted = admitWatchdogControlResponse(response);
  assert.deepEqual(admitted.result.capsules.map(({ state }) => state), ['FAILED', 'QUARANTINED']);
  assert.throws(() => admitWatchdogControlResponse({
    ...response,
    result: {
      kind: 'STOP_RESULT',
      scope: 'ALL',
      disposition: 'STOPPED',
      capsule_ids: [],
    },
  }), /RESPONSE_SCHEMA/);
});

test('typed client source has no XPC, service, process, filesystem, or network authority', async () => {
  const source = await readFile(
    new URL('../../src/main/execution/watchdog-control-client.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /from ['"](?:electron|node:child_process|node:fs|node:net|node:dgram|node:http|node:https)['"]/);
  assert.doesNotMatch(source, /XPC|SMAppService|spawn|execFile|Process|FileManager|fetch\s*\(/);
});
