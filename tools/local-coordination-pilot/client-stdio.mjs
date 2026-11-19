import { fstatSync } from 'node:fs';
import { Socket } from 'node:net';
import { once } from 'node:events';
import { frameCodec, frameType, maxProtectedPayloadBytes, protectedPipe } from './protected-frame.mjs';

const hello = Buffer.from('dosai-protected-stdio-ready-v1');

async function* readMessages(input) {
  const pending = Buffer.alloc(maxProtectedPayloadBytes);
  let length = 0;
  for await (const chunk of input) {
    for (let start = 0; start < chunk.length;) {
      const newline = chunk.indexOf(0x0a, start);
      const end = newline === -1 ? chunk.length : newline;
      const size = end - start;
      if (length + size > pending.length) throw new Error('Invalid MCP stdio message size.');
      chunk.copy(pending, length, start, end);
      length += size;
      start = end + 1;
      if (newline !== -1) {
        if (!length) throw new Error('Empty MCP stdio message.');
        yield pending.subarray(0, length);
        length = 0;
      }
    }
  }
  if (length) throw new Error('Incomplete MCP stdio message.');
}

async function run() {
  // File descriptor 3 must be supplied by a trusted launcher. MCP input, paths,
  // environment variables and command-line flags cannot select a broker or role.
  if (process.platform !== 'darwin' || process.argv.length !== 2 || !fstatSync(3).isSocket()) {
    throw new Error('A protected inherited connection is required.');
  }
  const channel = new Socket({ fd: 3, readable: true, writable: true });
  channel.once('close', () => process.stdin.destroy());
  const pipe = protectedPipe(channel);
  let reader;
  let writer;
  try {
    await pipe.write(Buffer.from('R'));
    const bootstrap = await pipe.bootstrap(64);
    try {
      const context = { seed: bootstrap.subarray(0, 32), session: bootstrap.subarray(32, 48), endpoint: bootstrap.subarray(48) };
      reader = frameCodec(context, 1);
      writer = frameCodec(context, 2);
    } finally {
      bootstrap.fill(0);
    }
    await pipe.write(writer.encode(frameType.hello, 0, hello));

    let correlation = 0;
    for await (const request of readMessages(process.stdin)) {
      await pipe.write(writer.encode(frameType.request, ++correlation, request));
      const response = await pipe.readFrame(reader);
      if (response?.type !== frameType.response || response.correlation !== correlation ||
          response.payload.includes(0x0a) || response.payload.includes(0x0d)) {
        throw new Error('Invalid MCP stdio response.');
      }
      // A notification gets a protected acknowledgement with no stdio output.
      if (response.payload.length && !process.stdout.write(Buffer.concat([response.payload, Buffer.of(0x0a)]))) {
        await once(process.stdout, 'drain');
      }
    }
  } finally {
    pipe.close();
    reader?.destroy();
    writer?.destroy();
  }
}

run().catch(() => {
  process.stderr.write('DOSAI MCP bridge closed.\n');
  process.exitCode = 1;
});
