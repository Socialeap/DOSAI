import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { openProject } from '../../tools/coordination-prototype/project-store.mjs';
import { frameCodec, frameType, protectedPipe } from '../../tools/local-coordination-pilot/protected-frame.mjs';
import { runProtectedFixture } from '../../tools/local-coordination-pilot/protected-launcher.mjs';

const context = () => ({ seed: randomBytes(32), session: randomBytes(16), endpoint: randomBytes(16) });
const read = (codec, bytes) => codec.decode(bytes.subarray(0, 118), bytes.subarray(118));

test('protected frame binds the payload to its key, endpoint, direction, and sequence', () => {
  const shared = context();
  const sender = frameCodec(shared, 2);
  const receiver = frameCodec(shared, 2);
  const message = sender.encode(frameType.request, 1, Buffer.from('known request'));
  const altered = Buffer.from(message);
  altered[118] ^= 1;
  assert.throws(() => read(receiver, altered), /rejected/);
  assert.throws(() => read(frameCodec({ ...shared, seed: randomBytes(32) }, 2), message), /rejected/);
  assert.throws(() => read(frameCodec({ ...shared, endpoint: randomBytes(16) }, 2), message), /rejected/);
  assert.throws(() => read(frameCodec({ ...shared, session: randomBytes(16) }, 2), message), /rejected/);
  assert.throws(() => read(frameCodec(shared, 1), message), /rejected/);
  assert.equal(read(receiver, message).payload.toString(), 'known request');
  assert.throws(() => read(receiver, message), /rejected/);
  const second = sender.encode(frameType.request, 2, Buffer.from('second'));
  assert.throws(() => read(frameCodec(shared, 2), second), /rejected/);
  assert.equal(read(receiver, second).correlation, 2);
  const third = sender.encode(frameType.request, 3, Buffer.from('last'));
  receiver.destroy();
  assert.throws(() => read(receiver, third), /rejected/);
  sender.destroy();
});

test('protected pipe buffers fragments and separated records with bounded headers', async () => {
  const shared = context();
  const sender = frameCodec(shared, 2);
  const receiver = frameCodec(shared, 2);
  const stream = new PassThrough();
  const pipe = protectedPipe(stream);
  const one = sender.encode(frameType.request, 1, Buffer.from('first'));
  const two = sender.encode(frameType.request, 2, Buffer.from('second'));
  stream.write(one.subarray(0, 11));
  stream.end(Buffer.concat([one.subarray(11), two]));
  assert.equal((await pipe.readFrame(receiver)).payload.toString(), 'first');
  assert.equal((await pipe.readFrame(receiver)).payload.toString(), 'second');
  assert.equal(await pipe.readFrame(receiver), null);
  sender.destroy();
  receiver.destroy();
  pipe.close();
});

test('impossible payload length and incomplete authenticated records close the transport', async t => {
  const shared = context();
  const sender = frameCodec(shared, 2);
  const original = sender.encode(frameType.request, 1, Buffer.from('sample'));
  const impossible = Buffer.from(original.subarray(0, 118));
  impossible.writeUInt32BE(4097, 10);
  for (const bytes of [impossible, original.subarray(0, -1)]) {
    await t.test('rejects frame without decoding a payload', async () => {
      const receiver = frameCodec(shared, 2);
      const stream = new PassThrough();
      const pipe = protectedPipe(stream);
      stream.end(bytes);
      await assert.rejects(() => pipe.readFrame(receiver), /rejected/);
      assert.equal(stream.destroyed, true);
      receiver.destroy();
    });
  }
  sender.destroy();
});

test('a bad MAC quarantines a protected pipe even if a valid record is buffered behind it', async () => {
  const shared = context();
  const sender = frameCodec(shared, 2);
  const receiver = frameCodec(shared, 2);
  const original = sender.encode(frameType.request, 1, Buffer.from('sample'));
  const bad = Buffer.from(original);
  bad[bad.length - 1] ^= 1;
  const stream = new PassThrough();
  const pipe = protectedPipe(stream);
  stream.end(Buffer.concat([bad, original]));
  await assert.rejects(() => pipe.readFrame(receiver), /rejected/);
  await assert.rejects(() => pipe.readFrame(receiver), /rejected/);
  assert.equal(stream.destroyed, true);
  sender.destroy();
  receiver.destroy();
});

test('a peer that never finishes its frame is disconnected on deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const receiver = frameCodec(context(), 2);
  const stream = new PassThrough();
  const pipe = protectedPipe(stream);
  stream.write(Buffer.from('DCPF'));
  const reading = pipe.readFrame(receiver);
  t.mock.timers.tick(4000);
  await assert.rejects(reading, /timed out/);
  assert.equal(stream.destroyed, true);
  receiver.destroy();
});

test('macOS binds both protected fixture processes and persists their MCP exchange', {
  skip: process.platform !== 'darwin', timeout: 15000,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'dosai-protected-fixture-'));
  const project = openProject(join(directory, 'pilot.sqlite'));
  t.after(() => {
    project.close();
    rmSync(directory, { recursive: true, force: true });
  });
  project.start({ lead: 'codex', review: 'claude', test: 'carbon' });
  const saved = await runProtectedFixture(project);
  assert.equal(saved.tasks.review.status, 'complete');
  assert.deepEqual(saved.events.map(event => [event.type, event.from, event.to]), [
    ['assignment', 'codex', 'claude'],
    ['progress', 'claude', 'codex'],
    ['result', 'claude', 'codex'],
  ]);
});
