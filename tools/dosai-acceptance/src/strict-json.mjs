import { createRequire } from 'node:module';
import { lstat, readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const duplicateKeyValidator = require('json-dup-key-validator');

function rejectInvalidNumbers(value) {
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
    throw new SyntaxError('INVALID_JSON_NUMBER');
  }
  if (Array.isArray(value)) {
    value.forEach(rejectInvalidNumbers);
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(rejectInvalidNumbers);
  }
}

export function parseStrictJson(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new SyntaxError('JSON_BOM_FORBIDDEN');
  }
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const value = duplicateKeyValidator.parse(source, false);
  rejectInvalidNumbers(value);
  return value;
}

export async function readStrictJson(path, maximumBytes = 1_048_576) {
  const file = await lstat(path);
  if (!file.isFile() || file.isSymbolicLink() || file.size > maximumBytes) {
    throw new Error('JSON_FILE_POLICY_REJECTED');
  }
  const bytes = await readFile(path);
  return { bytes, value: parseStrictJson(bytes) };
}
