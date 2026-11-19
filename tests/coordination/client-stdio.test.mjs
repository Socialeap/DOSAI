import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { openProject } from '../../tools/coordination-prototype/project-store.mjs';
import { frameCodec, frameType, protectedPipe } from '../../tools/local-coordination-pilot/protected-frame.mjs';
import { runProtectedStdioFixture } from '../../tools/local-coordination-pilot/protected-launcher.mjs';

const macFixture = { skip: process.platform !== 'darwin', timeout: 15000 };
const bridge = fileURLToPath(new URL('../../tools/local-coordination-pilot/client-stdio.mjs', import.meta.url));
const line = request => JSON.stringify({ jsonrpc: '2.0', ...request }) + '\n';

function projectFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dosai-stdio-fixture-'));
  const project = openProject(join(dir, 'pilot.sqlite'));
  t.after(() => {
    project.close();
    rmSync(dir, { recursive: true, force: true });
  });
  project.start({ lead: 'codex', review: 'claude', test: 'carbon' });
  return project;
}

function client({ input, output }) {
  const responses = createInterface({ input: output, crlfDelay: Infinity })[Symbol.asyncIterator]();
  let id = 0;
  async function receive(expected) {
    const response = await responses.next();
    assert.equal(response.done, false);
    const parsed = JSON.parse(response.value);
    assert.equal(parsed.jsonrpc, '2.0');
    assert.equal(parsed.id, expected);
    return parsed.result;
  }
  async function initialize(claimedName) {
    const initializationId = ++id;
    const init = line({
      id: initializationId, method: 'initialize',
      params: { protocolVersion: '2025-06-18', clientInfo: { name: claimedName, version: '1' }, capabilities: {} },
    });
    input.write(init.slice(0, 17));
    await delay(10);
    const listingId = ++id;
    input.write(init.slice(17) + line({ method: 'notifications/initialized' }) + line({ id: listingId, method: 'tools/list' }));
    assert.equal((await receive(initializationId)).protocolVersion, '2025-06-18');
    return (await receive(listingId)).tools.map(tool => tool.name);
  }
  async function call(name, args = {}) {
    input.write(line({ id: ++id, method: 'tools/call', params: { name, arguments: args } }));
    const result = await receive(id);
    return result.isError ? result : JSON.parse(result.content[0].text);
  }
  async function waitFor(status) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const task = await call('dosai_read_project');
      if (task.status === status) return task;
      await delay(25);
    }
    throw new Error('The fixture task never reached the expected status.');
  }
  async function close() {
    input.end();
    assert.equal((await responses.next()).done, true, 'No unsolicited messages or console text on stdout');
  }
  return { initialize, call, waitFor, close };
}

test('the stdio command alone cannot establish an agent connection', macFixture, () => {
  const run = spawnSync(process.execPath, [bridge], {
    input: line({ id: 1, method: 'tools/list' }),
    stdio: ['pipe', 'pipe', 'pipe', 'ignore'],
    env: { PATH: '/usr/bin:/bin' }, timeout: 2000,
  });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 1);
  assert.equal(run.stdout.length, 0);
  assert.equal(run.stderr.toString(), 'DOSAI MCP bridge closed.\n');
});

test('the stdio bridge relays exactly one bounded line per protected request', macFixture, async t => {
  const child = spawn(process.execPath, [bridge], {
    env: { PATH: '/usr/bin:/bin' }, stdio: ['pipe', 'pipe', 'ignore', 'pipe'],
  });
  const exited = once(child, 'close');
  void exited.catch(() => {});
  const pipe = protectedPipe(child.stdio[3]);
  const context = { seed: randomBytes(32), session: randomBytes(16), endpoint: randomBytes(16) };
  const incoming = frameCodec(context, 2);
  const outgoing = frameCodec(context, 1);
  t.after(async () => {
    pipe.close();
    incoming.destroy();
    outgoing.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
  });
  assert.equal((await pipe.bootstrap(1)).toString(), 'R');
  const bootstrap = Buffer.concat([context.seed, context.session, context.endpoint]);
  try {
    await pipe.write(bootstrap);
  } finally {
    bootstrap.fill(0);
    context.seed.fill(0);
  }
  assert.equal((await pipe.readFrame(incoming)).type, frameType.hello);

  const notification = line({ method: 'notifications/initialized' });
  const request = line({ method: 'ping', id: 1 });
  child.stdin.write(notification.slice(0, 13));
  child.stdin.end(notification.slice(13) + request);
  const rows = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  for (const [correlation, expected] of [[1, notification], [2, request]]) {
    const message = await pipe.readFrame(incoming);
    assert.equal(message.type, frameType.request);
    assert.equal(message.correlation, correlation);
    assert.equal(message.payload.toString(), expected.slice(0, -1));
    const payload = correlation === 1 ? '' : '{"jsonrpc":"2.0","id":1,"result":{}}';
    await pipe.write(outgoing.encode(frameType.response, correlation, Buffer.from(payload)));
  }
  assert.deepEqual(JSON.parse((await rows.next()).value), { jsonrpc: '2.0', id: 1, result: {} });
  assert.equal((await rows.next()).done, true);
  assert.deepEqual(await exited, [0, null]);
});

test('two authenticated stdio endpoints exchange and persist work in their launcher-bound roles', macFixture, async t => {
  const project = projectFixture(t);
  const saved = await runProtectedStdioFixture(project, async ({ codex, claude }) => {
    const lead = client(codex);
    const specialist = client(claude);
    const [leadTools, specialistTools] = await Promise.all([
      lead.initialize('claude'), specialist.initialize('codex'),
    ]);
    assert.deepEqual(leadTools.sort(), ['dosai_assign_review', 'dosai_read_project']);
    assert.deepEqual(specialistTools.sort(), ['dosai_complete_review', 'dosai_read_project', 'dosai_report_review']);
    const first = await lead.call('dosai_read_project');
    assert.equal((await specialist.call('dosai_assign_review', { expectedRevision: first.revision })).isError, true);
    await Promise.all([
      (async () => {
        await lead.call('dosai_assign_review', { expectedRevision: first.revision });
        assert.equal((await lead.waitFor('complete')).note, 'The fixture needs an empty-input check.');
        await lead.close();
      })(),
      (async () => {
        const assignment = await specialist.waitFor('assigned');
        const update = await specialist.call('dosai_report_review', { expectedRevision: assignment.revision, note: 'checking' });
        await specialist.call('dosai_complete_review', { expectedRevision: update.revision, note: 'missing_validation' });
        await specialist.close();
      })(),
    ]);
  });
  assert.deepEqual(saved.events.map(event => [event.type, event.from, event.to]), [
    ['assignment', 'codex', 'claude'],
    ['progress', 'claude', 'codex'],
    ['result', 'claude', 'codex'],
  ]);
});

test('oversized or partial stdio messages abort without persisting an agent update', macFixture, async t => {
  for (const [name, bytes] of [
    ['oversized', Buffer.alloc(4097, 0x20)],
    ['partial EOF', line({ id: 1, method: 'tools/list' }).slice(0, -1)],
  ]) {
    await t.test(name, async subtest => {
      const project = projectFixture(subtest);
      let malformedInputSent = false;
      await assert.rejects(runProtectedStdioFixture(project, async ({ codex, claude }) => {
        await Promise.all([client(codex).initialize('codex'), client(claude).initialize('claude')]);
        malformedInputSent = true;
        codex.input.end(bytes);
      }), /did not exit cleanly|Protected frame rejected|ECONNRESET/);
      assert.equal(malformedInputSent, true, 'Malformed input must follow both authenticated handshakes.');
      const saved = project.snapshot();
      assert.equal(saved.phase, 'stopped');
      assert.deepEqual(saved.events, []);
    });
  }
});
