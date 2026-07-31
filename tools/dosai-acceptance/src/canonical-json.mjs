import { createHash } from 'node:crypto';

function normalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError('NON_CANONICAL_NUMBER');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    );
  }
  throw new TypeError('NON_CANONICAL_VALUE');
}

export function canonicalJson(value) {
  return `${JSON.stringify(normalize(value))}\n`;
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function digestObject(bytes) {
  return { algorithm: 'SHA-256', value: sha256Bytes(bytes) };
}
