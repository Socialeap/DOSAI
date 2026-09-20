import assert from 'node:assert/strict';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { unlinkSync } from 'node:fs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { admitRequest, FIXTURE, ROUTES } from '../../tools/supervised-execution/contracts.ts';
import { digest } from '../../tools/supervised-execution/engine.ts';
import { createLocalFixtureSession } from '../../tools/supervised-execution/runtime.mjs';
import { createEvidenceDirectory } from '../../tools/supervised-execution/evidence-directory.ts';
import { verifyAuditJournal } from '../../native-helpers/audit/journal.ts';
import { collectFiles, importedModules } from '../architecture/source-graph.mjs';

const root = resolve(import.meta.dirname, '../..');
const request = (action = 'SUMMARIZE_FIXTURE') => ({ version: 1, action, fixture: 'beta-core-v1', generation: '1' });
async function harness(t, overrides = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dosai-execution-slice-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'audit.sqlite3');
  let currentTime = Date.parse('2026-09-20T20:00:00.000Z');
  let mono = 100;
  let configuration = { enabled: true, mode: 'FIXTURE_ONLY', generation: '1' };
  let policyPatch = {};
  const engine = await createLocalFixtureSession(databasePath, {
    clock: () => new Date(currentTime), monotonic: () => mono,
    configuration: () => configuration,
    policyContext: identity => ({ ...identity, policyAvailable: true, actorGeneration: '1', resourceGeneration: '1',
      actorCapabilities: ['policy.preflight'], ownerCapabilities: ['policy.preflight'], policyCapabilities: ['policy.preflight'],
      capabilityEnvelopeActive: false, capabilityEnvelopeCapabilities: [], ...policyPatch }),
    ...overrides,
  });
  return { engine, directory, databasePath,
    time: value => { currentTime = value; }, monotonic: value => { mono = value; },
    config: value => { configuration = value; }, policy: value => { policyPatch = value; },
  };
}
function prepare(engine, input = request()) {
  const prepared = engine.prepare(input);
  assert.equal(prepared.status, 'AWAITING_APPROVAL', JSON.stringify(prepared));
  return prepared;
}
function deny(receipt, reason) {
  assert.equal(receipt.body.status, 'DENIED');
  assert.equal(receipt.body.effects, 'NONE');
  assert.equal(receipt.body.result, null);
  if (reason) assert.equal(receipt.body.reason, reason);
}
function verify(databasePath, receipt) {
  const ack = receipt.acknowledgement;
  assert.ok(ack);
  return verifyAuditJournal(databasePath, { journalId: ack.journal_id, journalEpochId: ack.journal_epoch_id }, {
    sequence: ack.sequence, eventHash: ack.event_hash,
  });
}

test('both closed routes require exact approval, evaluate fixed data and produce durable receipts', async t => {
  for (const [action, expected] of [
    ['SUMMARIZE_FIXTURE', { suites: 3, passed: 18, failed: 1 }],
    ['LIST_FIXTURE_FAILURES', { suites: 1, passed: 4, failed: 1 }],
  ]) {
    const { engine, databasePath } = await harness(t);
    const plan = prepare(engine, request(action));
    assert.equal(plan.route, ROUTES[action].handler);
    assert.equal(plan.fixtureDigest, digest(FIXTURE));
    assert.deepEqual(engine.receipts().map(x => x.body.status), ['PREPARED']);
    const receipt = engine.run(plan, plan.approvalInstruction);
    assert.equal(receipt.body.status, 'SUCCEEDED', JSON.stringify(receipt));
    assert.deepEqual(receipt.body.result, expected);
    assert.equal(receipt.body.authority, 'SYNTHETIC_NO_EFFECT_TEST_ONLY');
    assert.equal(receipt.audit, 'LOCAL_DURABLE');
    assert.deepEqual(engine.receipts().map(x => x.body.status), ['PREPARED', 'INTENT', 'SUCCEEDED']);
    assert.equal(verify(databasePath, receipt).assurance, 'LOCAL_DURABLE');
    for (const item of engine.receipts()) assert.equal(item.digest, digest(item.body));
    const db = new DatabaseSync(databasePath, { readOnly: true });
    const rows = db.prepare('SELECT * FROM events').all();
    db.close();
    for (const item of engine.receipts()) assert.ok(JSON.stringify(rows).includes(item.digest));
  }
});

test('unknown, unsafe, provider and schema-expanding actions are denied without retaining their input', async t => {
  const { engine } = await harness(t);
  const canary = 'SECRET_CANARY_DO_NOT_PERSIST';
  for (const input of [null, [], {}, { ...request(), version: 2 }, request('shell'), request('deploy'), request('__proto__'),
    { ...request(), command: canary }, { ...request(), endpoint: canary }, { ...request(), fixture: canary },
    { ...request(), generation: '2' }, { ...request(), permissions: ['*'] }, { ...request(), approved: true }]) {
    deny(engine.prepare(input));
  }
  assert.equal(JSON.stringify(engine.receipts()).includes(canary), false);
  assert.equal(engine.receipts().some(x => x.body.status === 'INTENT'), false);
});

test('accessors, inherited fields, symbols and hidden properties are rejected without invoking getters', () => {
  let invoked = false;
  const getter = { ...request() };
  Object.defineProperty(getter, 'action', { enumerable: true, get() { invoked = true; return 'SUMMARIZE_FIXTURE'; } });
  const hidden = { ...request() };
  Object.defineProperty(hidden, 'secret', { value: 'CANARY' });
  for (const input of [getter, hidden, Object.create(request()), { ...request(), [Symbol('extra')]: 1 }]) {
    assert.throws(() => admitRequest(input));
  }
  assert.equal(invoked, false);
});

test('routing does not depend on key order; admitted requests and exact plans are immutable', async t => {
  const { engine } = await harness(t);
  const candidate = { generation: '1', fixture: 'beta-core-v1', action: 'SUMMARIZE_FIXTURE', version: 1 };
  const plan = prepare(engine, candidate);
  candidate.action = 'LIST_FIXTURE_FAILURES';
  assert.equal(plan.request.action, 'SUMMARIZE_FIXTURE');
  assert.throws(() => { plan.request.action = 'LIST_FIXTURE_FAILURES'; }, TypeError);
  assert.throws(() => { plan.route = 'shell'; }, TypeError);
  deny(engine.run({ ...plan }, plan.approvalInstruction), 'UNKNOWN_PLAN');
  const other = await harness(t);
  deny(other.engine.run(plan, plan.approvalInstruction), 'UNKNOWN_PLAN');
});

test('missing configuration, disabled configuration and nonfixture modes fail closed', async t => {
  for (const config of [null, {}, { enabled: false, mode: 'FIXTURE_ONLY', generation: '1' },
    { enabled: true, mode: 'PRODUCTION', generation: '1' }, { enabled: true, mode: 'FIXTURE_ONLY', generation: '2' }]) {
    const h = await harness(t); h.config(config); deny(h.engine.prepare(request()));
  }
});

test('actor, session, resource, generation and every capability allowance are checked by P2', async t => {
  for (const patch of [{ policyAvailable: false }, { actorId: 'foreign.actor' },
    { actorGeneration: '2' }, { resourceGeneration: '2' },
    { sessionId: 'd0274eb3-d68f-4c02-8b23-4900d8e35e32' },
    { resourceId: '59dbff1b-6f23-4c51-b6b8-30fd80218e6e' },
    { actorCapabilities: [] }, { ownerCapabilities: [] }, { policyCapabilities: [] },
    { actorCapabilities: ['shell.execute'] }]) {
    const h = await harness(t); h.policy(patch); deny(h.engine.prepare(request()));
  }
});

test('operator denial, Boolean approval and an approval for another plan cannot run a handler', async t => {
  for (const answer of ['no', '', true, { approved: true }, `APPROVE ${'a'.repeat(64)}`]) {
    const { engine } = await harness(t); const plan = prepare(engine);
    deny(engine.run(plan, answer), 'OWNER_DENIED');
    deny(engine.run(plan, plan.approvalInstruction), 'PLAN_REPLAYED');
    assert.equal(engine.receipts().some(x => x.body.status === 'INTENT'), false);
  }
});

test('grants/plans are single-use and one session allows only one pending plan', async t => {
  const { engine } = await harness(t); const plan = prepare(engine);
  deny(engine.prepare(request()), 'BUSY');
  assert.equal(engine.run(plan, plan.approvalInstruction).body.status, 'SUCCEEDED');
  deny(engine.run(plan, plan.approvalInstruction), 'PLAN_REPLAYED');
});

test('preflight rechecks permissions and configuration after operator review', async t => {
  for (const mutate of [h => h.policy({ ownerCapabilities: [] }), h => h.config(null), h => h.policy({ resourceGeneration: '2' })]) {
    const h = await harness(t); const plan = prepare(h.engine); mutate(h);
    deny(h.engine.run(plan, plan.approvalInstruction));
    assert.equal(h.engine.receipts().some(x => x.body.status === 'INTENT'), false);
  }
});

test('permission revocation after authorization is rechecked before fixture dispatch', async t => {
  let calls = 0;
  const h = await harness(t, { policyContext: identity => ({
    ...identity, policyAvailable: true, actorGeneration: '1', resourceGeneration: '1',
    actorCapabilities: ['policy.preflight'], ownerCapabilities: ++calls >= 3 ? [] : ['policy.preflight'],
    policyCapabilities: ['policy.preflight'], capabilityEnvelopeActive: false, capabilityEnvelopeCapabilities: [],
  }) });
  const plan = prepare(h.engine);
  deny(h.engine.run(plan, plan.approvalInstruction));
  assert.equal(h.engine.receipts().some(x => x.body.status === 'SUCCEEDED'), false);
});

test('wall time, monotonic expiry and backward monotonic clocks fail closed', async t => {
  for (const mutate of [h => h.time(Date.parse('2026-09-20T20:01:00.000Z')),
    h => h.time(Date.parse('2026-09-20T19:59:00.000Z')),
    h => { h.time(Date.parse('2026-09-20T19:00:00.000Z')); h.monotonic(60_100); },
    h => h.monotonic(0), h => h.monotonic(NaN)]) {
    const h = await harness(t); const plan = prepare(h.engine); mutate(h);
    deny(h.engine.run(plan, plan.approvalInstruction));
  }
});

test('missing audit storage blocks preparation; emergency stop does not depend on audit', async t => {
  const h = await harness(t); await rename(h.directory, `${h.directory}-moved`);
  t.after(() => rm(`${h.directory}-moved`, { recursive: true, force: true }));
  const receipt = h.engine.prepare(request()); deny(receipt, 'AUDIT_UNAVAILABLE');
  assert.equal(receipt.audit, 'UNRECORDED');
  const stopped = h.engine.stop();
  assert.equal(stopped.body.status, 'STOPPED');
  assert.equal(stopped.audit, 'UNRECORDED');
});

test('deleted or corrupted audit history cannot be silently replaced before execution', async t => {
  for (const corrupt of [path => rm(path), path => writeFile(path, 'invalid-database')]) {
    const h = await harness(t); const plan = prepare(h.engine); await corrupt(h.databasePath);
    deny(h.engine.run(plan, plan.approvalInstruction), 'AUDIT_UNAVAILABLE');
    assert.equal(h.engine.receipts().some(x => x.body.status === 'SUCCEEDED'), false);
  }
});

test('lost outcome persistence returns UNKNOWN, never durable success, and blocks further work', async t => {
  let calls = 0;
  let path;
  const h = await harness(t, { policyContext: identity => {
    if (++calls === 3) unlinkSync(path);
    return { ...identity, policyAvailable: true, actorGeneration: '1', resourceGeneration: '1',
      actorCapabilities: ['policy.preflight'], ownerCapabilities: ['policy.preflight'], policyCapabilities: ['policy.preflight'],
      capabilityEnvelopeActive: false, capabilityEnvelopeCapabilities: [] };
  } });
  path = h.databasePath;
  const plan = prepare(h.engine);
  const result = h.engine.run(plan, plan.approvalInstruction);
  assert.equal(result.body.status, 'UNKNOWN');
  assert.equal(result.body.reason, 'OUTCOME_AUDIT_UNAVAILABLE');
  assert.equal(result.audit, 'UNRECORDED');
  assert.equal(result.body.result, null);
  assert.ok(result.body.authorization);
  deny(h.engine.prepare(request()), 'AUDIT_UNAVAILABLE');
});

test('invalid clock cannot prepare a plan or reach a handler', async t => {
  const h = await harness(t, { clock: () => new Date(NaN) });
  deny(h.engine.prepare(request()), 'CLOCK_UNAVAILABLE');
});

test('stop invalidates pending work and remains idempotent', async t => {
  const { engine } = await harness(t); const plan = prepare(engine);
  assert.equal(engine.stop().body.status, 'STOPPED');
  assert.equal(engine.stop().body.status, 'STOPPED');
  deny(engine.run(plan, plan.approvalInstruction), 'PLAN_REPLAYED');
  deny(engine.prepare(request()), 'STOP_ENGAGED');
});

test('dependency exceptions are sanitized and session receipt retention is bounded', async t => {
  const { engine } = await harness(t, { configuration: () => { throw new Error('DOSAI_AUTH_SECRET_CANARY_0001'); } });
  for (let i = 0; i < 170; i++) deny(engine.prepare(request()));
  assert.ok(engine.receipts().length <= 160);
  assert.equal(JSON.stringify(engine.receipts()).includes('SECRET_CANARY'), false);
});

test('journal survives session end; a restarted session rejects old plans', async t => {
  const h = await harness(t); const plan = prepare(h.engine);
  const receipt = h.engine.run(plan, plan.approvalInstruction);
  const restarted = await createLocalFixtureSession(h.databasePath);
  deny(restarted.run(plan, plan.approvalInstruction), 'UNKNOWN_PLAN');
  assert.equal(verify(h.databasePath, receipt).assurance, 'LOCAL_DURABLE');
});

test('operator command rejects piped approval and unknown actions before opening an audit store', () => {
  for (const args of [[], ['shell']]) {
    const result = spawnSync(process.execPath, ['tools/supervised-execution/run.mjs', ...args], {
      cwd: root, input: 'APPROVE anything\n', encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
  }
});

test('both evidence prefixes reject existing and dangling symlinks before any external write', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dosai-evidence-gate-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = join(directory, 'repo');
  const outside = join(directory, 'outside');
  await mkdir(repository); await mkdir(outside);
  await writeFile(join(outside, 'sentinel'), 'unchanged');
  const evidence = join(repository, 'evidence');
  for (const target of [outside, join(directory, 'missing')]) {
    await symlink(target, evidence);
    for (const prefix of ['supervised-fixture-', 'execution-benchmark-']) {
      await assert.rejects(createEvidenceDirectory(repository, prefix), /^Error: EVIDENCE_ROOT_REJECTED$/);
      assert.deepEqual(await readdir(outside), ['sentinel']);
      assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'unchanged');
      assert.ok((await lstat(evidence)).isSymbolicLink());
      await assert.rejects(lstat(join(directory, 'missing')), { code: 'ENOENT' });
    }
    await rm(evidence);
  }
});

test('evidence creation resolves the repository, accepts a real root and rejects non-directory roots', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dosai-evidence-root-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = join(directory, 'repo');
  await mkdir(repository);
  for (const prefix of ['supervised-fixture-', 'execution-benchmark-']) {
    const result = await createEvidenceDirectory(repository, prefix);
    assert.equal(await realpath(result), result);
    assert.equal(resolve(result, '..'), join(repository, 'evidence'));
    assert.equal((await lstat(result)).isDirectory(), true);
    assert.deepEqual(await readdir(result), []);
  }
  const other = join(directory, 'other'); await mkdir(other);
  await writeFile(join(other, 'evidence'), 'keep');
  await assert.rejects(createEvidenceDirectory(other, 'supervised-fixture-'), /EVIDENCE_ROOT_REJECTED/);
  assert.equal(await readFile(join(other, 'evidence'), 'utf8'), 'keep');
});

test('operator and benchmark entry points reject redirected evidence before creating audit or receipt files', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dosai-evidence-cli-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = join(directory, 'repo');
  const tool = join(repository, 'tools/supervised-execution');
  const outside = join(directory, 'outside');
  await mkdir(tool, { recursive: true }); await mkdir(outside);
  await writeFile(join(outside, 'sentinel'), 'unchanged');
  await symlink(outside, join(repository, 'evidence'));
  await symlink(join(root, 'native-helpers'), join(repository, 'native-helpers'));
  for (const name of ['runtime.mjs', 'evidence-directory.ts']) {
    await symlink(join(root, 'tools/supervised-execution', name), join(tool, name));
  }
  for (const name of ['run.mjs', 'benchmark.mjs']) {
    const entry = join(tool, name);
    await copyFile(join(root, 'tools/supervised-execution', name), entry);
    // Test-only TTY flags reach startup validation; no approval is supplied.
    const source = `Object.defineProperty(process.stdin, 'isTTY', {value: true});
      Object.defineProperty(process.stdout, 'isTTY', {value: true});
      await import(${JSON.stringify(pathToFileURL(entry).href)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: repository, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /EVIDENCE_ROOT_REJECTED/);
    assert.equal(result.stdout, '');
    assert.deepEqual(await readdir(outside), ['sentinel']);
    assert.equal(await readFile(join(outside, 'sentinel'), 'utf8'), 'unchanged');
    assert.ok((await lstat(join(repository, 'evidence'))).isSymbolicLink());
  }
});

test('application source cannot import the offline proof; core tool has no process or network imports', async () => {
  for (const path of await collectFiles(join(root, 'src'))) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const modules = importedModules(await readFile(path, 'utf8'), path);
    assert.equal(modules.some(module => module.includes('supervised-execution')), false, path);
  }
  const expected = new Set([
    'node:crypto', 'node:perf_hooks', '../../src/contracts/p2/contracts.ts', '../../src/policy/synthetic-policy.ts',
    '../../native-helpers/grants/synthetic-authorization.ts', '../../native-helpers/audit/checkpoint.ts',
    '../../native-helpers/audit/journal.ts', '../../native-helpers/audit/contracts.ts', './contracts.ts',
  ]);
  for (const name of ['engine.ts', 'contracts.ts']) {
    const path = join(root, 'tools/supervised-execution', name);
    for (const module of importedModules(await readFile(path, 'utf8'), path)) assert.ok(expected.has(module), module);
  }
});
