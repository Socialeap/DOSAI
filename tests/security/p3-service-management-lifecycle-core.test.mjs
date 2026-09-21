import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createServiceManagementLifecycleCore,
  serviceManagementLifecycleResults,
} from '../../src/main/execution/service-management-lifecycle-core.ts';

const sourceUrl = new URL(
  '../../src/main/execution/service-management-lifecycle-core.ts',
  import.meta.url,
);

function binding(statuses, registerResult = true, unregisterResult = true) {
  const calls = [];
  let index = 0;
  return {
    calls,
    value: {
      observe() {
        calls.push(['observe', arguments.length]);
        const status = statuses[Math.min(index, statuses.length - 1)];
        index += 1;
        return status;
      },
      register() {
        calls.push(['register', arguments.length]);
        if (registerResult instanceof Error) throw registerResult;
        return registerResult;
      },
      unregister() {
        calls.push(['unregister', arguments.length]);
        if (unregisterResult instanceof Error) throw unregisterResult;
        return unregisterResult;
      },
    },
  };
}

test('lifecycle core is exact, frozen, single-use, and calls every admitted operation with zero arguments', () => {
  assert.deepEqual([...serviceManagementLifecycleResults], [
    'REGISTERED_AND_CLEANED',
    'REGISTRATION_REJECTED_CLEAN',
    'REGISTRATION_FAILED_RECOVERED',
    'PRECONDITION_FAILED',
    'CLEANUP_UNVERIFIED',
    'BINDING_INVALID',
    'ALREADY_CONSUMED',
  ]);
  assert.ok(Object.isFrozen(serviceManagementLifecycleResults));

  const candidate = binding(['NOT_REGISTERED', 'ENABLED', 'NOT_REGISTERED']);
  const core = createServiceManagementLifecycleCore(candidate.value);
  const result = core.exercise();
  assert.deepEqual(result, {
    result: 'REGISTERED_AND_CLEANED',
    before: 'NOT_REGISTERED',
    after_register: 'ENABLED',
    after_unregister: 'NOT_REGISTERED',
    register_attempts: 1,
    unregister_attempts: 1,
    consumed: true,
  });
  assert.ok(Object.isFrozen(core));
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(candidate.calls, [
    ['observe', 0],
    ['register', 0],
    ['observe', 0],
    ['unregister', 0],
    ['observe', 0],
  ]);

  assert.equal(core.exercise().result, 'ALREADY_CONSUMED');
  assert.equal(candidate.calls.length, 5);
});

test('unclean preconditions cannot register or unregister', () => {
  for (const status of ['ENABLED', 'REQUIRES_APPROVAL']) {
    const candidate = binding([status]);
    const result = createServiceManagementLifecycleCore(candidate.value).exercise();
    assert.deepEqual(result, {
      result: 'PRECONDITION_FAILED',
      before: status,
      after_register: status,
      after_unregister: status,
      register_attempts: 0,
      unregister_attempts: 0,
      consumed: true,
    });
    assert.deepEqual(candidate.calls, [['observe', 0]]);
  }
});

test('first-seen not found receives one bounded registration and exact cleanup', () => {
  const candidate = binding(['NOT_FOUND', 'ENABLED', 'NOT_REGISTERED']);
  const result = createServiceManagementLifecycleCore(candidate.value).exercise();
  assert.deepEqual(result, {
    result: 'REGISTERED_AND_CLEANED',
    before: 'NOT_FOUND',
    after_register: 'ENABLED',
    after_unregister: 'NOT_REGISTERED',
    register_attempts: 1,
    unregister_attempts: 1,
    consumed: true,
  });
  assert.deepEqual(candidate.calls, [
    ['observe', 0],
    ['register', 0],
    ['observe', 0],
    ['unregister', 0],
    ['observe', 0],
  ]);
});

test('registration rejection stays clean only when the post-status is exactly not registered', () => {
  const clean = binding(['NOT_REGISTERED', 'NOT_REGISTERED'], false);
  assert.equal(
    createServiceManagementLifecycleCore(clean.value).exercise().result,
    'REGISTRATION_REJECTED_CLEAN',
  );
  assert.deepEqual(clean.calls, [
    ['observe', 0],
    ['register', 0],
    ['observe', 0],
  ]);

  for (const after of ['NOT_FOUND', 'unknown']) {
    const uncertain = binding(['NOT_REGISTERED', after], new Error('register failed'));
    const result = createServiceManagementLifecycleCore(uncertain.value).exercise();
    assert.equal(result.result, 'CLEANUP_UNVERIFIED');
    assert.equal(result.register_attempts, 1);
    assert.equal(result.unregister_attempts, 0);
  }

  const firstSeenRejected = binding(['NOT_FOUND', 'NOT_FOUND'], false);
  const firstSeenResult = createServiceManagementLifecycleCore(
    firstSeenRejected.value,
  ).exercise();
  assert.equal(firstSeenResult.result, 'CLEANUP_UNVERIFIED');
  assert.equal(firstSeenResult.register_attempts, 1);
  assert.equal(firstSeenResult.unregister_attempts, 0);
});

test('partial registration receives one cleanup attempt and never retries', () => {
  const recovered = binding(
    ['NOT_REGISTERED', 'REQUIRES_APPROVAL', 'NOT_REGISTERED'],
    false,
    true,
  );
  assert.equal(
    createServiceManagementLifecycleCore(recovered.value).exercise().result,
    'REGISTRATION_FAILED_RECOVERED',
  );
  assert.equal(recovered.calls.filter(([name]) => name === 'register').length, 1);
  assert.equal(recovered.calls.filter(([name]) => name === 'unregister').length, 1);

  for (const [unregisterResult, finalStatus] of [
    [false, 'REQUIRES_APPROVAL'],
    [new Error('cleanup failed'), 'ENABLED'],
    [true, 'NOT_FOUND'],
  ]) {
    const uncertain = binding(
      ['NOT_REGISTERED', 'ENABLED', finalStatus],
      true,
      unregisterResult,
    );
    const result = createServiceManagementLifecycleCore(uncertain.value).exercise();
    assert.equal(result.result, 'CLEANUP_UNVERIFIED');
    assert.equal(result.register_attempts, 1);
    assert.equal(result.unregister_attempts, 1);
    assert.equal(uncertain.calls.filter(([name]) => name === 'register').length, 1);
    assert.equal(uncertain.calls.filter(([name]) => name === 'unregister').length, 1);
  }
});

test('malformed bindings and descriptor traps fail closed without invoking attacker code', () => {
  for (const candidate of [undefined, null, true, {}, [], { observe() {}, register() {} }]) {
    const result = createServiceManagementLifecycleCore(candidate).exercise();
    assert.equal(result.result, 'BINDING_INVALID');
    assert.equal(result.register_attempts, 0);
    assert.equal(result.unregister_attempts, 0);
  }

  let accessorInvoked = false;
  const accessor = { register() {}, unregister() {} };
  Object.defineProperty(accessor, 'observe', {
    enumerable: true,
    get() {
      accessorInvoked = true;
      return () => 'NOT_REGISTERED';
    },
  });
  assert.equal(createServiceManagementLifecycleCore(accessor).exercise().result, 'BINDING_INVALID');
  assert.equal(accessorInvoked, false);

  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error('hostile keys');
    },
  });
  assert.equal(createServiceManagementLifecycleCore(hostile).exercise().result, 'BINDING_INVALID');

  const hostilePrototype = new Proxy({}, {
    getPrototypeOf() {
      throw new Error('hostile prototype');
    },
  });
  assert.equal(
    createServiceManagementLifecycleCore(hostilePrototype).exercise().result,
    'BINDING_INVALID',
  );

  let functionPropertyRead = false;
  let observations = 0;
  const hostileFunction = new Proxy(function observe() {}, {
    get() {
      functionPropertyRead = true;
      throw new Error('hostile function property');
    },
    apply() {
      observations += 1;
      return 'NOT_REGISTERED';
    },
  });
  const callable = {
    observe: hostileFunction,
    register: () => false,
    unregister: () => true,
  };
  assert.equal(
    createServiceManagementLifecycleCore(callable).exercise().result,
    'REGISTRATION_REJECTED_CLEAN',
  );
  assert.equal(observations, 2);
  assert.equal(functionPropertyRead, false);
});

test('source remains injection-only and unreachable from application entrypoints', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(
    source,
    /from ['"](?:electron|node:child_process|node:fs|node:net|node:dgram|node:http|node:https)['"]/,
  );
  assert.doesNotMatch(
    source,
    /SMAppService|launchctl|registerAndReturnError|unregisterAndReturnError/,
  );
  assert.doesNotMatch(source, /require\s*\(|process\.dlopen|\.node\b|ipcMain|ipcRenderer|contextBridge/);

  for (const entry of [
    '../../src/main/index.ts',
    '../../src/preload/index.ts',
    '../../scripts/package.mjs',
  ]) {
    const entrySource = await readFile(new URL(entry, import.meta.url), 'utf8');
    assert.equal(entrySource.includes('service-management-lifecycle-core'), false, entry);
  }
});
