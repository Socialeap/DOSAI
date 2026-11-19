import assert from 'node:assert/strict';
import { Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { frameCodec, frameType, protectedPipe } from './protected-frame.mjs';

const actor = process.argv[2];
if (process.argv.length !== 3 || !['codex', 'claude'].includes(actor)) process.exit(2);

const stream = new Socket({ fd: 3, readable: true, writable: true });
const pipe = protectedPipe(stream);
let read;
let write;
try {
  await pipe.write(Buffer.from('R'));
  const bootstrap = await pipe.bootstrap(64);
  try {
    const context = { seed: bootstrap.subarray(0, 32), session: bootstrap.subarray(32, 48), endpoint: bootstrap.subarray(48) };
    read = frameCodec(context, 1);
    write = frameCodec(context, 2);
  } finally {
    bootstrap.fill(0);
  }

  await pipe.write(write.encode(frameType.hello, 0, Buffer.from('dosai-protected-fixture-ready-v1')));
  let id = 0;
  let correlation = 0;
  async function send(message) {
    const expected = ++correlation;
    await pipe.write(write.encode(frameType.request, expected, Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }))));
    const reply = await pipe.readFrame(read);
    assert.equal(reply?.type, frameType.response);
    assert.equal(reply.correlation, expected);
    return reply.payload.length ? JSON.parse(reply.payload.toString('utf8')) : undefined;
  }
  async function call(name, args = {}) {
    const expected = ++id;
    const reply = await send({ id: expected, method: 'tools/call', params: { name, arguments: args } });
    assert.equal(reply.id, expected);
    assert.equal(reply.result.isError, undefined);
    return JSON.parse(reply.result.content[0].text);
  }
  async function waitFor(status) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const record = await call('dosai_read_project');
      if (record.status === status) return record;
      await delay(25);
    }
    throw new Error('Expected fixture status.');
  }

  const initialized = await send({
    id: ++id, method: 'initialize',
    params: {
      protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'protected-fixture', version: '1' },
    },
  });
  assert.equal(initialized.result.protocolVersion, '2025-06-18');
  await send({ method: 'notifications/initialized' });
  if (actor === 'codex') {
    const initial = await call('dosai_read_project');
    await call('dosai_assign_review', { expectedRevision: initial.revision });
    assert.equal((await waitFor('complete')).note, 'The fixture needs an empty-input check.');
  } else {
    const task = await waitFor('assigned');
    const progress = await call('dosai_report_review', { expectedRevision: task.revision, note: 'checking' });
    await call('dosai_complete_review', { expectedRevision: progress.revision, note: 'missing_validation' });
  }
} finally {
  read?.destroy();
  write?.destroy();
  pipe.close();
}
