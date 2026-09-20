import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createServiceManagementStatusAdapter,
  serviceManagementStatusObservations,
} from '../../src/main/execution/service-management-status-adapter.ts';

const nativeSourceUrl = new URL(
  '../../native-helpers/service-management-status-addon/service-management-status-addon.mm',
  import.meta.url,
);
const mainSourceUrl = new URL(
  '../../src/main/execution/service-management-status-adapter.ts',
  import.meta.url,
);

test('Main adapter admits exactly four observations through a zero-argument call', () => {
  assert.deepEqual([...serviceManagementStatusObservations], [
    'NOT_REGISTERED',
    'ENABLED',
    'REQUIRES_APPROVAL',
    'NOT_FOUND',
  ]);
  assert.ok(Object.isFrozen(serviceManagementStatusObservations));

  for (const observation of serviceManagementStatusObservations) {
    let argumentCount = -1;
    const adapter = createServiceManagementStatusAdapter({
      observe() {
        argumentCount = arguments.length;
        return observation;
      },
    });
    assert.equal(adapter.observe(), observation);
    assert.equal(argumentCount, 0);
    assert.ok(Object.isFrozen(adapter));
    assert.deepEqual(Reflect.ownKeys(adapter), ['observe']);
  }
});

test('Main adapter maps malformed results, errors, and malformed bindings to NOT_FOUND', () => {
  for (const value of [undefined, null, true, 0, '', 'enabled', 'UNKNOWN', {}, []]) {
    assert.equal(createServiceManagementStatusAdapter({ observe: () => value }).observe(), 'NOT_FOUND');
  }
  assert.equal(
    createServiceManagementStatusAdapter({
      observe() {
        throw new Error('native failure');
      },
    }).observe(),
    'NOT_FOUND',
  );
  for (const binding of [undefined, null, true, {}, { observe: 'ENABLED' }]) {
    assert.equal(createServiceManagementStatusAdapter(binding).observe(), 'NOT_FOUND');
  }
});

test('Main adapter does not invoke accessors or trust hostile descriptor traps', () => {
  let accessorInvoked = false;
  const accessorBinding = {};
  Object.defineProperty(accessorBinding, 'observe', {
    get() {
      accessorInvoked = true;
      return () => 'ENABLED';
    },
  });
  assert.equal(createServiceManagementStatusAdapter(accessorBinding).observe(), 'NOT_FOUND');
  assert.equal(accessorInvoked, false);

  const hostileBinding = new Proxy({}, {
    getOwnPropertyDescriptor() {
      throw new Error('hostile descriptor trap');
    },
  });
  assert.equal(createServiceManagementStatusAdapter(hostileBinding).observe(), 'NOT_FOUND');
});

test('native source fixes the plist and maps only the accepted SMAppService status cases', async () => {
  const source = await readFile(nativeSourceUrl, 'utf8');
  assert.match(source, /#import <ServiceManagement\/ServiceManagement\.h>/);
  assert.match(source, /#include <node_api\.h>/);
  assert.match(
    source,
    /agentServiceWithPlistName:@"com\.socialeap\.dosai\.execution-service-fixture\.plist"/,
  );
  assert.match(source, /if \(service == nil\) \{\s*return kNotFound;/);
  for (const [platform, observation] of [
    ['SMAppServiceStatusNotRegistered', 'NOT_REGISTERED'],
    ['SMAppServiceStatusEnabled', 'ENABLED'],
    ['SMAppServiceStatusRequiresApproval', 'REQUIRES_APPROVAL'],
    ['SMAppServiceStatusNotFound', 'NOT_FOUND'],
  ]) {
    assert.match(source, new RegExp(`case ${platform}:[\\s\\S]*?return k${observation
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/(?:^| )([a-z])/g, (_, letter) => letter.toUpperCase())
      .replaceAll(' ', '')};`));
  }
  assert.match(source, /default:\s*return kNotFound;/);
  assert.match(source, /@catch \(__unused NSException\* exception\) \{\s*return kNotFound;/);
  assert.match(source, /argument_count != 0[\s\S]*?return MakeObservation\(env, kNotFound\);/);
  assert.equal((source.match(/napi_set_named_property/g) ?? []).length, 1);
  assert.match(source, /napi_set_named_property\(env, exports, "observe", observe\)/);
});

test('native source contains no lifecycle, dispatch, process, filesystem, network, or XPC authority', async () => {
  const source = await readFile(nativeSourceUrl, 'utf8');
  assert.doesNotMatch(
    source,
    /registerAndReturnError|registerWithCompletionHandler|unregisterAndReturnError|unregisterWithCompletionHandler|openSystemSettingsLoginItems/,
  );
  assert.doesNotMatch(
    source,
    /daemonServiceWithPlistName|loginItemServiceWithIdentifier|mainAppService|statusForLegacyURL/,
  );
  assert.doesNotMatch(source, /launchctl|xpc_|Virtualization|Security|NSTask|posix_spawn|execv|fork\s*\(/);
  assert.doesNotMatch(source, /NSFileManager|NSURLSession|socket\s*\(|connect\s*\(|dispatch_source/);
  assert.doesNotMatch(source, /napi_get_named_property|napi_call_function|dlsym|dlopen/);
});

test('Main source is injection-only and has no native loading or cross-boundary exposure', async () => {
  const source = await readFile(mainSourceUrl, 'utf8');
  assert.doesNotMatch(
    source,
    /from ['"](?:electron|node:child_process|node:fs|node:net|node:dgram|node:http|node:https)['"]/,
  );
  assert.doesNotMatch(source, /require\s*\(|import\s*\(|\.node\b|process\.dlopen|SMAppService|launchctl/);
  assert.doesNotMatch(source, /ipcMain|ipcRenderer|contextBridge|preload|renderer/);
});
