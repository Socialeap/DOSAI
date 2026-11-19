import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

const magic = Buffer.from('DCPF');
const domain = Buffer.from('DOSAI/protected-local-pilot/v1\0');
const headerLength = 118;
const tagLength = 32;
export const maxProtectedPayloadBytes = 4096;
const maxFrames = 64;
const maxPayloadTotal = 96 * 1024;
const frameTimeoutMs = 4000;

export const frameType = Object.freeze({ hello: 1, request: 2, response: 3 });

const hash = (...parts) => {
  const sha = createHash('sha256');
  for (const part of parts) sha.update(part);
  return sha.digest();
};

function fail() {
  throw new Error('Protected frame rejected.');
}

function validContext(context) {
  return Buffer.isBuffer(context.seed) && context.seed.length === 32 &&
    Buffer.isBuffer(context.session) && context.session.length === 16 &&
    Buffer.isBuffer(context.endpoint) && context.endpoint.length === 16;
}

export function frameCodec(context, direction) {
  if (!validContext(context) || (direction !== 1 && direction !== 2)) fail();
  const session = Buffer.from(context.session);
  const endpoint = Buffer.from(context.endpoint);
  const key = Buffer.from(hkdfSync('sha256', context.seed, session, Buffer.concat([domain, endpoint, Buffer.of(direction)]), 32));
  let sequence = 0;
  let total = 0;
  let closed = false;
  const tag = (header, payload) => createHmac('sha256', key).update(domain).update(header).update(payload).digest();

  function counters(type, correlation, length, next) {
    if (closed || next !== sequence + 1 || next > maxFrames || length > maxProtectedPayloadBytes ||
        total + length > maxPayloadTotal || !Number.isSafeInteger(correlation) ||
        correlation < 0 || correlation > maxFrames || !Object.values(frameType).includes(type) ||
        (direction === 1 && type !== frameType.response) || (direction === 2 && type === frameType.response) ||
        (type === frameType.hello ? correlation !== 0 || next !== 1 : correlation === 0)) fail();
  }

  function identities(header) {
    const binding = header.subarray(4, 54);
    return {
      nonce: hash(domain, Buffer.of(1), binding).subarray(0, 16),
      message: hash(domain, Buffer.of(2), binding).subarray(0, 16),
    };
  }

  function encode(type, correlation, payload) {
    if (!Buffer.isBuffer(payload)) fail();
    const next = sequence + 1;
    counters(type, correlation, payload.length, next);
    const header = Buffer.alloc(headerLength);
    magic.copy(header);
    header[4] = 1;
    header[5] = 1;
    header[6] = type;
    header[7] = direction;
    header.writeUInt16BE(headerLength, 8);
    header.writeUInt32BE(payload.length, 10);
    header.writeUInt32BE(next, 14);
    header.writeUInt32BE(correlation, 18);
    session.copy(header, 22);
    endpoint.copy(header, 38);
    const ids = identities(header);
    ids.nonce.copy(header, 54);
    ids.message.copy(header, 70);
    hash(payload).copy(header, 86);
    const framed = Buffer.concat([header, payload, tag(header, payload)]);
    sequence = next;
    total += payload.length;
    return framed;
  }

  function preflight(header) {
    if (!Buffer.isBuffer(header) || header.length !== headerLength ||
        !header.subarray(0, 4).equals(magic) || header[4] !== 1 || header[5] !== 1 ||
        header[7] !== direction || header.readUInt16BE(8) !== headerLength ||
        !header.subarray(22, 38).equals(session) || !header.subarray(38, 54).equals(endpoint)) fail();
    const type = header[6];
    const size = header.readUInt32BE(10);
    const next = header.readUInt32BE(14);
    const correlation = header.readUInt32BE(18);
    counters(type, correlation, size, next);
    const ids = identities(header);
    if (!ids.nonce.equals(header.subarray(54, 70)) || !ids.message.equals(header.subarray(70, 86))) fail();
    return { type, correlation, size, next };
  }

  function decode(header, tail) {
    const { type, correlation, size, next } = preflight(header);
    if (!Buffer.isBuffer(tail) || tail.length !== size + tagLength) fail();
    const payload = tail.subarray(0, size);
    if (!timingSafeEqual(tag(header, payload), tail.subarray(size)) ||
        !timingSafeEqual(hash(payload), header.subarray(86, 118))) fail();
    sequence = next;
    total += size;
    return { type, correlation, payload };
  }

  function destroy() {
    closed = true;
    key.fill(0);
  }

  return Object.freeze({ encode, preflight, decode, destroy });
}

export function protectedPipe(stream) {
  const incoming = stream[Symbol.asyncIterator]();
  let current = Buffer.alloc(0);
  let closed = false;

  function close() {
    closed = true;
    current = Buffer.alloc(0);
    stream.destroy();
  }

  async function exact(size, eof = false, scrub = false) {
    const buffer = Buffer.alloc(size);
    let written = 0;
    while (written < size) {
      if (!current.length) {
        const next = await incoming.next();
        if (next.done) {
          if (eof && written === 0) return null;
          fail();
        }
        if (!Buffer.isBuffer(next.value) || next.value.length > 128 * 1024) fail();
        current = next.value;
      }
      const count = Math.min(size - written, current.length);
      current.copy(buffer, written, 0, count);
      if (scrub) current.fill(0, 0, count);
      written += count;
      current = current.subarray(count);
    }
    return buffer;
  }

  async function bounded(read) {
    if (closed) fail();
    const timeout = setTimeout(() => stream.destroy(new Error('Protected frame timed out.')), frameTimeoutMs);
    try {
      return await read();
    } catch (error) {
      close();
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function readFrame(codec) {
    return bounded(async () => {
      const header = await exact(headerLength, true);
      if (header === null) return null;
      const { size } = codec.preflight(header);
      return codec.decode(header, await exact(size + tagLength));
    });
  }

  return Object.freeze({
    bootstrap: size => bounded(() => exact(size, false, true)),
    readFrame,
    async write(bytes) {
      if (closed) fail();
      await new Promise((resolve, reject) => stream.write(bytes, error => error ? reject(error) : resolve()));
    },
    close,
  });
}
