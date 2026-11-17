// Test-only one-frame session. No transport, dispatch callback, or approval authority.
import { createHmac, timingSafeEqual } from 'node:crypto';

const headerBytes = 40;
const tagBytes = 32;
const maximumPayload = 128;
const domain = 'DOSAI offline fixture proposal v1\0';
const payload = Buffer.from('{"action":"SUMMARIZE_FIXTURE"}');

export function createOfflineReceiver({ key, peer, session }) {
  if (![key, peer, session].every(Buffer.isBuffer) ||
      key.length !== 32 || peer.length !== 16 || session.length !== 16) {
    throw new TypeError('INVALID_FIXTURE_CONTEXT');
  }
  const secret = Buffer.from(key);
  const expectedPeer = Buffer.from(peer);
  const expectedSession = Buffer.from(session);
  const buffer = Buffer.alloc(headerBytes + maximumPayload + tagBytes);
  let size = 0;
  let expectedSize = null;
  let closed = false;

  function close() {
    closed = true;
    secret.fill(0);
    buffer.fill(0);
  }

  function reject(reason) {
    close();
    return Object.freeze({ status: 'REJECTED', reason });
  }

  function push(chunk) {
    if (closed) return reject('SESSION_CLOSED');
    if (!Buffer.isBuffer(chunk) || chunk.length > buffer.length - size) {
      return reject('INVALID_LENGTH');
    }
    chunk.copy(buffer, size);
    size += chunk.length;
    if (size >= headerBytes && expectedSize === null) {
      if (buffer[0] !== 1) return reject('UNSUPPORTED_VERSION');
      const length = buffer.readUInt16BE(38);
      if (length === 0 || length > maximumPayload) return reject('INVALID_LENGTH');
      expectedSize = headerBytes + length + tagBytes;
    }
    if (expectedSize !== null && size > expectedSize) return reject('TRAILING_BYTES');
    return Object.freeze({ status: 'PENDING' });
  }

  function finish() {
    if (closed) return reject('SESSION_CLOSED');
    if (expectedSize === null || size !== expectedSize) return reject('TRUNCATED');
    const bodyEnd = size - tagBytes;
    const tag = createHmac('sha256', secret).update(domain).update(buffer.subarray(0, bodyEnd)).digest();
    if (!timingSafeEqual(tag, buffer.subarray(bodyEnd, size))) return reject('AUTHENTICATION_FAILED');
    if (buffer[1] !== 1 || !buffer.subarray(2, 18).equals(expectedPeer) ||
        !buffer.subarray(18, 34).equals(expectedSession)) return reject('CONTEXT_MISMATCH');
    if (buffer.readUInt32BE(34) !== 1) return reject('INVALID_SEQUENCE');
    if (!buffer.subarray(headerBytes, bodyEnd).equals(payload)) return reject('INVALID_PAYLOAD');
    close();
    return Object.freeze({
      status: 'PROPOSAL_FOR_LOCAL_REVIEW',
      proposal: Object.freeze({ version: 1, action: 'SUMMARIZE_FIXTURE', fixture: 'beta-core-v1', generation: '1' }),
    });
  }

  return Object.freeze({ push, finish });
}
