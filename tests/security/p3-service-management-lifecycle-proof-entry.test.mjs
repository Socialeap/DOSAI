import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { build } from 'vite';

const root = nodePath.resolve(import.meta.dirname, '../..');
const entryPath = nodePath.resolve(
  root,
  'src/main/execution/service-management-lifecycle-proof-entry.ts',
);
const entrySource = await readFile(entryPath, 'utf8');
const resultPrefix = 'DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:';
const receiptKeys = [
  'after_register',
  'after_unregister',
  'before',
  'consumed',
  'observe_attempts',
  'observe_completions',
  'register_attempts',
  'register_completions',
  'result',
  'unregister_attempts',
  'unregister_completions',
].sort();

function statusSequence(values, calls, mutation = {}) {
  let index = 0;
  return {
    observe(...arguments_) {
      calls.push(['observe', arguments_.length]);
      const value = values[Math.min(index, values.length - 1)];
      index += 1;
      if (value instanceof Error) throw value;
      return value;
    },
    register(...arguments_) {
      calls.push(['register', arguments_.length]);
      if (mutation.register instanceof Error) throw mutation.register;
      return mutation.register ?? true;
    },
    unregister(...arguments_) {
      calls.push(['unregister', arguments_.length]);
      if (mutation.unregister instanceof Error) throw mutation.unregister;
      return mutation.unregister ?? true;
    },
  };
}

async function buildProofBundle() {
  const directory = await mkdtemp(nodePath.join(tmpdir(), 'dosai-lifecycle-proof-entry-'));
  await build({
    build: {
      emptyOutDir: true,
      lib: {
        entry: entryPath,
        fileName: () => 'index.cjs',
        formats: ['cjs'],
      },
      minify: false,
      outDir: directory,
      rollupOptions: {
        external: [/^electron(?:\/.*)?$/, /^node:/],
      },
      sourcemap: false,
      target: 'node24',
    },
    configFile: false,
    logLevel: 'silent',
  });
  return {
    bundlePath: nodePath.join(directory, 'index.cjs'),
    directory,
  };
}

async function evaluateBundle(bundlePath, { load, ready = true }) {
  const bundleSource = await readFile(bundlePath, 'utf8');
  const writes = [];
  const exits = [];
  const loads = [];
  const app = Object.freeze({
    exit(code) {
      exits.push(code);
    },
    whenReady() {
      return ready ? Promise.resolve() : Promise.reject(new Error('inert readiness failure'));
    },
  });
  const resourcesPath = '/inert/dosai/resources';
  const requireStub = identifier => {
    if (identifier === 'electron') return { app };
    if (identifier === 'node:path') return nodePath;
    if (identifier === 'node:module') {
      return {
        createRequire(filename) {
          assert.equal(filename, bundlePath);
          return path => {
            loads.push(path);
            return load();
          };
        },
      };
    }
    throw new Error(`Unexpected bundled require: ${identifier}`);
  };
  const moduleStub = {
    exports: {},
  };
  const processStub = Object.freeze({
    resourcesPath,
    stdout: Object.freeze({
      write(value) {
        writes.push(value);
        return true;
      },
    }),
  });
  const wrapper = vm.runInNewContext(
    `(function (require, module, exports, __filename, __dirname, process) {${bundleSource}\n})`,
    Object.create(null),
  );
  wrapper(
    requireStub,
    moduleStub,
    moduleStub.exports,
    bundlePath,
    nodePath.dirname(bundlePath),
    processStub,
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  assert.match(writes[0], new RegExp(`^${resultPrefix.replaceAll('_', '\\_')}\\{.*\\}\\n$`));
  const receipt = JSON.parse(writes[0].slice(resultPrefix.length));
  assert.deepEqual(Object.keys(receipt).sort(), receiptKeys);
  return { exits, loads, receipt, writes };
}

test('lifecycle proof entry is fixed, one-shot, and limited to dedicated proof selectors', async () => {
  assert.match(entrySource, /^import \{ app \} from 'electron';$/m);
  assert.match(entrySource, /^import \{ createRequire \} from 'node:module';$/m);
  assert.match(entrySource, /^import \{ join \} from 'node:path';$/m);
  assert.match(entrySource, /createRequire\(__filename\)/);
  assert.match(
    entrySource,
    /requireFromProofEntry\(join\(process\.resourcesPath, lifecycleAddonName\)\)/,
  );
  assert.match(entrySource, /dosai-service-management-lifecycle\.node/);
  assert.match(entrySource, /createServiceManagementLifecycleCore\(monitoredBinding\)\.exercise\(\)/);
  assert.match(
    entrySource,
    /function uncertainLifecycleFailure\(\)[\s\S]*observe_attempts: 3,[\s\S]*register_attempts: 1,[\s\S]*unregister_attempts: 1,[\s\S]*consumed: true/,
  );
  assert.equal((entrySource.match(/process\.stdout\.write/g) ?? []).length, 1);
  assert.equal((entrySource.match(/app\.exit\(0\)/g) ?? []).length, 1);
  assert.equal((entrySource.match(/app\.exit\(1\)/g) ?? []).length, 1);
  assert.doesNotMatch(
    entrySource,
    /BrowserWindow|webContents|ipcMain|ipcRenderer|contextBridge|preload|renderer|process\.argv|process\.env|child_process|node:fs|node:net|node:http|node:https|launchctl|SMAppService|setInterval|setTimeout|retry/i,
  );

  for (const path of [
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/renderer/App.tsx',
  ]) {
    assert.equal(
      (await readFile(nodePath.resolve(root, path), 'utf8'))
        .includes('service-management-lifecycle-proof-entry'),
      false,
      path,
    );
  }
  assert.match(
    await readFile(nodePath.resolve(root, 'vite.main.config.ts'), 'utf8'),
    /service-management-lifecycle-proof-entry\.ts/,
  );
  assert.match(
    await readFile(nodePath.resolve(root, 'scripts/build.mjs'), 'utf8'),
    /service-management-lifecycle-proof/,
  );
  assert.match(
    await readFile(nodePath.resolve(root, 'scripts/package.mjs'), 'utf8'),
    /--signed-app-service-management-lifecycle-proof-fixture/,
  );
});

test('inert bundle performs one clean lifecycle sequence with exact zero-argument calls', async () => {
  const { bundlePath, directory } = await buildProofBundle();
  const calls = [];
  try {
    const result = await evaluateBundle(bundlePath, {
      load: () => statusSequence(['NOT_REGISTERED', 'ENABLED', 'NOT_REGISTERED'], calls),
    });
    assert.deepEqual(result.loads, [
      nodePath.join('/inert/dosai/resources', 'dosai-service-management-lifecycle.node'),
    ]);
    assert.deepEqual(calls, [
      ['observe', 0],
      ['register', 0],
      ['observe', 0],
      ['unregister', 0],
      ['observe', 0],
    ]);
    assert.deepEqual(result.receipt, {
      result: 'REGISTERED_AND_CLEANED',
      before: 'NOT_REGISTERED',
      after_register: 'ENABLED',
      after_unregister: 'NOT_REGISTERED',
      observe_attempts: 3,
      register_attempts: 1,
      unregister_attempts: 1,
      observe_completions: 3,
      register_completions: 1,
      unregister_completions: 1,
      consumed: true,
    });
    assert.deepEqual(result.exits, [0]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('inert bundle refuses dirty preconditions and handles clean registration rejection', async () => {
  const { bundlePath, directory } = await buildProofBundle();
  try {
    const dirtyCalls = [];
    const dirty = await evaluateBundle(bundlePath, {
      load: () => statusSequence(['ENABLED'], dirtyCalls),
    });
    assert.equal(dirty.receipt.result, 'PRECONDITION_FAILED');
    assert.deepEqual(dirtyCalls, [['observe', 0]]);
    assert.equal(dirty.receipt.register_attempts, 0);
    assert.equal(dirty.receipt.unregister_attempts, 0);

    const rejectedCalls = [];
    const rejected = await evaluateBundle(bundlePath, {
      load: () => statusSequence(
        ['NOT_REGISTERED', 'NOT_REGISTERED'],
        rejectedCalls,
        { register: false },
      ),
    });
    assert.equal(rejected.receipt.result, 'REGISTRATION_REJECTED_CLEAN');
    assert.deepEqual(rejectedCalls, [
      ['observe', 0],
      ['register', 0],
      ['observe', 0],
    ]);
    assert.equal(rejected.receipt.unregister_attempts, 0);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('inert bundle attempts cleanup once and reports uncertain or failed native calls closed', async () => {
  const { bundlePath, directory } = await buildProofBundle();
  try {
    const cleanupCalls = [];
    const cleanup = await evaluateBundle(bundlePath, {
      load: () => statusSequence(
        ['NOT_REGISTERED', 'ENABLED', 'ENABLED'],
        cleanupCalls,
        { unregister: false },
      ),
    });
    assert.equal(cleanup.receipt.result, 'CLEANUP_UNVERIFIED');
    assert.equal(cleanup.receipt.register_attempts, 1);
    assert.equal(cleanup.receipt.unregister_attempts, 1);

    const thrownCalls = [];
    const thrown = await evaluateBundle(bundlePath, {
      load: () => statusSequence(
        ['NOT_REGISTERED', 'NOT_REGISTERED'],
        thrownCalls,
        { register: new Error('inert native failure') },
      ),
    });
    assert.equal(thrown.receipt.result, 'NATIVE_CALL_CONTRACT_FAILED');
    assert.equal(thrown.receipt.register_attempts, 1);
    assert.equal(thrown.receipt.register_completions, 0);
    assert.equal(thrown.receipt.unregister_attempts, 0);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('inert bundle distinguishes load, binding, and Electron readiness failures', async () => {
  const { bundlePath, directory } = await buildProofBundle();
  try {
    const loadFailure = await evaluateBundle(bundlePath, {
      load() {
        throw new Error('inert load failure');
      },
    });
    assert.equal(loadFailure.receipt.result, 'NATIVE_ADDON_LOAD_FAILED');
    assert.equal(loadFailure.receipt.consumed, false);

    const bindingFailure = await evaluateBundle(bundlePath, {
      load: () => ({ observe() {}, register() {} }),
    });
    assert.equal(bindingFailure.receipt.result, 'BINDING_INVALID');
    assert.equal(bindingFailure.receipt.consumed, true);

    let accessorInvoked = false;
    const accessorBinding = { register() {}, unregister() {} };
    Object.defineProperty(accessorBinding, 'observe', {
      enumerable: true,
      get() {
        accessorInvoked = true;
        return () => 'NOT_REGISTERED';
      },
    });
    const accessorFailure = await evaluateBundle(bundlePath, {
      load: () => accessorBinding,
    });
    assert.equal(accessorFailure.receipt.result, 'BINDING_INVALID');
    assert.equal(accessorInvoked, false);

    const hostileFailure = await evaluateBundle(bundlePath, {
      load: () => new Proxy({}, {
        ownKeys() {
          throw new Error('hostile keys');
        },
      }),
    });
    assert.equal(hostileFailure.receipt.result, 'BINDING_INVALID');

    const readinessFailure = await evaluateBundle(bundlePath, {
      ready: false,
      load() {
        throw new Error('load must remain unreachable');
      },
    });
    assert.equal(readinessFailure.loads.length, 0);
    assert.equal(readinessFailure.receipt.result, 'ELECTRON_READINESS_FAILED');
    assert.equal(readinessFailure.receipt.consumed, false);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
