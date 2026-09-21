import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseStrictJsonBytes } from '../../src/contracts/strict-json.ts';
import {
  openCapsuleStateReader,
  openCapsuleStateStore,
} from '../../src/main/execution/capsule-state-store.ts';
import { CapsuleSupervisor } from '../../src/main/execution/capsule-supervisor.ts';

function request() {
  return {
    schema_id: 'urn:dosai:schema:capsule-request:1',
    schema_version: 1,
    capsule_id: randomUUID(),
    operation_id: randomUUID(),
    generation: '1',
    operation_kind: 'SAFE_TEST',
    executable: '/usr/bin/sleep',
    arguments: ['0.01'],
    environment: {},
    limits: { wall_time_ms: 1000, max_output_bytes: 0 },
    authorization: 'NO_EFFECT_TEST_ONLY',
  };
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dosai-capsule-store-test-')));
  const store = await openCapsuleStateStore(join(root, 'state'));
  return { root, store };
}

async function cleanup(root) {
  await rm(root, { recursive: true, force: true });
}

test('capsule state is atomically durable and active crash records restore quarantined', async () => {
  const { root, store } = await fixture();
  try {
    const supervisor = new CapsuleSupervisor();
    const candidate = request();
    supervisor.register(candidate, 100);
    supervisor.begin(candidate.capsule_id, candidate.generation);
    const first = supervisor.exportRegistry('1', '1', 101);
    const initialSave = store.save(first);
    await assert.rejects(
      () => store.save(supervisor.exportRegistry('1', '2', 102)),
      /DOSAI_CAPSULE_STORE_BUSY_0001/,
    );
    await initialSave;
    assert.deepEqual(await store.load(), first);
    assert.equal((await stat(store.statePath)).mode & 0o077, 0);

    const restored = CapsuleSupervisor.restoreFromRegistry(await store.load(), '2', 200);
    assert.throws(
      () => CapsuleSupervisor.restoreFromRegistry(first, '1', 200),
      /DOSAI_CAPSULE_REGISTRY_GENERATION_0001/,
    );
    assert.deepEqual(restored.quarantinedCapsuleIds, [candidate.capsule_id]);
    assert.equal(restored.registry.revision, '2');
    assert.equal(restored.registry.supervisor_generation, '2');
    assert.deepEqual(restored.supervisor.snapshot(candidate.capsule_id), {
      request: first.records[0].request,
      state: 'QUARANTINED',
      registeredAt: 100,
      deadlineAt: 1100,
      outputBytes: 0,
      processAttached: false,
      lastCancellationReason: 'SUPERVISOR_CRASH',
    });
    await store.save(restored.registry);
    assert.deepEqual(await store.load(), restored.registry);
    await assert.rejects(() => store.save(restored.registry), /DOSAI_CAPSULE_STORE_REVISION_0001/);
    assert.deepEqual(
      await readdir(store.directory),
      ['.capsule-registry.owner', 'capsule-registry.json'],
    );
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('strict registry loading rejects duplicate keys, truncation, BOM, and unsafe permissions', async () => {
  const { root, store } = await fixture();
  try {
    const supervisor = new CapsuleSupervisor();
    supervisor.register(request(), 100);
    await store.save(supervisor.exportRegistry('1', '1', 101));
    const original = await readFile(store.statePath);
    const duplicate = Buffer.from(
      original.toString('utf8').replace(
        '{',
        '{"schema_id":"urn:dosai:schema:capsule-registry:1",',
      ),
    );
    await writeFile(store.statePath, duplicate, { mode: 0o600 });
    await assert.rejects(() => store.load(), /DOSAI_JSON_DUPLICATE_KEY_0001/);
    await writeFile(store.statePath, original.subarray(0, original.length - 4), { mode: 0o600 });
    await assert.rejects(() => store.load());
    await writeFile(store.statePath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]), { mode: 0o600 });
    await assert.rejects(() => store.load(), /DOSAI_JSON_BOM_0001/);
    await writeFile(store.statePath, original, { mode: 0o600 });
    await chmod(store.statePath, 0o644);
    await assert.rejects(() => store.load(), /DOSAI_CAPSULE_STORE_FILE_0001/);
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('state-file symlinks fail closed without changing their target', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dosai-capsule-link-test-')));
  let store;
  try {
    store = await openCapsuleStateStore(join(root, 'state'));
    const target = join(root, 'unrelated.txt');
    await writeFile(target, 'UNCHANGED', { mode: 0o600 });
    await symlink(target, store.statePath);
    await assert.rejects(() => store.load(), /DOSAI_CAPSULE_STORE_FILE_0001/);
    const reader = await openCapsuleStateReader(store.directory);
    await assert.rejects(() => reader.load(), /DOSAI_CAPSULE_STORE_FILE_0001/);
    const supervisor = new CapsuleSupervisor();
    supervisor.register(request(), 100);
    await assert.rejects(
      () => store.save(supervisor.exportRegistry('1', '1', 101)),
      /DOSAI_CAPSULE_STORE_FILE_0001/,
    );
    assert.equal(await readFile(target, 'utf8'), 'UNCHANGED');
  } finally {
    await store?.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('a read-only view observes durable snapshots without writer ownership', async () => {
  const { root, store } = await fixture();
  try {
    const reader = await openCapsuleStateReader(store.directory);
    assert.equal('save' in reader, false);
    assert.equal('close' in reader, false);
    assert.equal(await reader.load(), null);

    const supervisor = new CapsuleSupervisor();
    supervisor.register(request(), 100);
    await store.save(supervisor.exportRegistry('1', '1', 101));
    assert.equal((await reader.load()).revision, '1');
    await store.save(supervisor.exportRegistry('1', '2', 102));
    assert.equal((await reader.load()).revision, '2');
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('a separate process can inspect state without acquiring writer ownership', async () => {
  const { root, store } = await fixture();
  try {
    const supervisor = new CapsuleSupervisor();
    supervisor.register(request(), 100);
    await store.save(supervisor.exportRegistry('1', '1', 101));
    const moduleUrl = new URL(
      '../../src/main/execution/capsule-state-store.ts',
      import.meta.url,
    ).href;
    const source = `
      import { openCapsuleStateReader } from ${JSON.stringify(moduleUrl)};
      const reader = await openCapsuleStateReader(process.argv[1]);
      const document = await reader.load();
      process.stdout.write(JSON.stringify({ revision: document?.revision, writable: 'save' in reader }));
    `;
    const child = spawn(process.execPath, ['--input-type=module', '--eval', source, store.directory], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let childError = '';
    child.stdout.on('data', (data) => { output += data.toString('utf8'); });
    child.stderr.on('data', (data) => { childError += data.toString('utf8'); });
    const [code, signal] = await once(child, 'exit');
    assert.equal(code, 0, childError);
    assert.equal(signal, null);
    assert.deepEqual(JSON.parse(output), { revision: '1', writable: false });
    await assert.rejects(
      () => openCapsuleStateStore(store.directory),
      /DOSAI_CAPSULE_STORE_OWNED_0001/,
    );
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('exclusive ownership rejects a second store and clean close permits takeover', async () => {
  const { root, store } = await fixture();
  let reopened;
  try {
    assert.equal((await stat(store.ownershipPath)).mode & 0o077, 0);
    await assert.rejects(
      () => openCapsuleStateStore(store.directory),
      /DOSAI_CAPSULE_STORE_OWNED_0001/,
    );
    const supervisor = new CapsuleSupervisor();
    supervisor.register(request(), 100);
    await store.save(supervisor.exportRegistry('1', '1', 101));

    await store.close();
    await assert.rejects(() => store.load(), /DOSAI_CAPSULE_STORE_CLOSED_0001/);
    reopened = await openCapsuleStateStore(store.directory);
    assert.equal((await reopened.load()).revision, '1');
  } finally {
    await store.close().catch(() => undefined);
    await reopened?.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('an orphaned ownership marker blocks automatic stale takeover', async () => {
  const { root, store } = await fixture();
  try {
    const ownershipPath = store.ownershipPath;
    const supervisor = new CapsuleSupervisor();
    supervisor.register(request(), 100);
    await store.save(supervisor.exportRegistry('1', '1', 101));
    await store.close();
    await writeFile(ownershipPath, 'ORPHANED_OWNER_REQUIRES_RECONCILIATION\n', {
      flag: 'wx',
      mode: 0o600,
    });
    await assert.rejects(
      () => openCapsuleStateStore(store.directory),
      /DOSAI_CAPSULE_STORE_OWNED_0001/,
    );
    assert.equal(
      await readFile(ownershipPath, 'utf8'),
      'ORPHANED_OWNER_REQUIRES_RECONCILIATION\n',
    );
    const reader = await openCapsuleStateReader(store.directory);
    assert.equal((await reader.load()).revision, '1');
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('ownership excludes a separate process until its clean release', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dosai-capsule-owner-test-')));
  const directory = join(root, 'state');
  const moduleUrl = new URL(
    '../../src/main/execution/capsule-state-store.ts',
    import.meta.url,
  ).href;
  const source = `
    import { openCapsuleStateStore } from ${JSON.stringify(moduleUrl)};
    const store = await openCapsuleStateStore(process.argv[1]);
    process.stdout.write('OWNED\\n');
    for await (const chunk of process.stdin) {
      if (chunk.toString('utf8').trim() === 'CLOSE') break;
    }
    await store.close();
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', source, directory], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let childError = '';
  child.stderr.on('data', (data) => { childError += data.toString('utf8'); });
  const exited = once(child, 'exit');
  let reopened;
  try {
    const [chunk] = await Promise.race([
      once(child.stdout, 'data'),
      exited.then(([code, signal]) => {
        throw new Error(`owner child exited before acquisition: ${code}/${signal}: ${childError}`);
      }),
    ]);
    assert.equal(chunk.toString('utf8'), 'OWNED\n');
    await assert.rejects(
      () => openCapsuleStateStore(directory),
      /DOSAI_CAPSULE_STORE_OWNED_0001/,
    );

    child.stdin.end('CLOSE\n');
    const [code, signal] = await exited;
    assert.equal(code, 0, childError);
    assert.equal(signal, null);
    reopened = await openCapsuleStateStore(directory);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.stdin.end('CLOSE\n');
      await exited.catch(() => undefined);
    }
    await reopened?.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('ownership marker replacement disables the original writer', async () => {
  const { root, store } = await fixture();
  try {
    await rm(store.ownershipPath);
    await writeFile(store.ownershipPath, 'REPLACEMENT_OWNER\n', { mode: 0o600 });
    const supervisor = new CapsuleSupervisor();
    supervisor.register(request(), 100);
    await assert.rejects(
      () => store.save(supervisor.exportRegistry('1', '1', 101)),
      /DOSAI_CAPSULE_STORE_OWNERSHIP_0001/,
    );
    await assert.rejects(() => store.load(), /DOSAI_CAPSULE_STORE_OWNERSHIP_0001/);
    await assert.rejects(() => readFile(store.statePath), { code: 'ENOENT' });
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('strict JSON admission rejects nested duplicates and negative zero', () => {
  assert.throws(
    () => parseStrictJsonBytes(Buffer.from('{"outer":{"value":1,"value":2}}')),
    /DOSAI_JSON_DUPLICATE_KEY_0001/,
  );
  assert.throws(
    () => parseStrictJsonBytes(Buffer.from('{"value":-0}')),
    /DOSAI_JSON_NUMBER_0001/,
  );
  assert.throws(
    () => parseStrictJsonBytes(Buffer.from('{"value":"non-ascii: \u00e9"}')),
    /DOSAI_JSON_ENCODING_0001/,
  );
});
