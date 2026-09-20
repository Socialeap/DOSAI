const MAXIMUM_DEPTH = 32;
const MAXIMUM_NODES = 10_000;

class StrictJsonScanner {
  private readonly source: string;
  private index = 0;
  private nodes = 0;

  constructor(source: string) {
    this.source = source;
  }

  scan(): void {
    this.skipWhitespace();
    this.scanValue(0);
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      throw new SyntaxError('DOSAI_JSON_SYNTAX_0001');
    }
  }

  private scanValue(depth: number): void {
    this.nodes += 1;
    if (depth > MAXIMUM_DEPTH || this.nodes > MAXIMUM_NODES) {
      throw new SyntaxError('DOSAI_JSON_LIMIT_0001');
    }
    const token = this.source[this.index];
    if (token === '{') {
      this.scanObject(depth + 1);
      return;
    }
    if (token === '[') {
      this.scanArray(depth + 1);
      return;
    }
    if (token === '"') {
      this.scanString();
      return;
    }
    this.scanPrimitive();
  }

  private scanObject(depth: number): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === '}') {
      this.index += 1;
      return;
    }
    const keys = new Set<string>();
    while (this.index < this.source.length) {
      if (this.source[this.index] !== '"') {
        throw new SyntaxError('DOSAI_JSON_SYNTAX_0001');
      }
      const key = this.scanString();
      if (keys.has(key)) {
        throw new SyntaxError('DOSAI_JSON_DUPLICATE_KEY_0001');
      }
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index] !== ':') {
        throw new SyntaxError('DOSAI_JSON_SYNTAX_0001');
      }
      this.index += 1;
      this.skipWhitespace();
      this.scanValue(depth);
      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === '}') {
        this.index += 1;
        return;
      }
      if (separator !== ',') {
        throw new SyntaxError('DOSAI_JSON_SYNTAX_0001');
      }
      this.index += 1;
      this.skipWhitespace();
    }
    throw new SyntaxError('DOSAI_JSON_SYNTAX_0001');
  }

  private scanArray(depth: number): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === ']') {
      this.index += 1;
      return;
    }
    while (this.index < this.source.length) {
      this.scanValue(depth);
      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === ']') {
        this.index += 1;
        return;
      }
      if (separator !== ',') {
        throw new SyntaxError('DOSAI_JSON_SYNTAX_0001');
      }
      this.index += 1;
      this.skipWhitespace();
    }
    throw new SyntaxError('DOSAI_JSON_SYNTAX_0001');
  }

  private scanString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === '"') {
        this.index += 1;
        return JSON.parse(this.source.slice(start, this.index)) as string;
      }
      if (character === '\\') {
        this.index += 2;
      } else {
        this.index += 1;
      }
    }
    throw new SyntaxError('DOSAI_JSON_SYNTAX_0001');
  }

  private scanPrimitive(): void {
    const start = this.index;
    while (this.index < this.source.length && !/[\s,\]}]/.test(this.source[this.index] ?? '')) {
      this.index += 1;
    }
    if (start === this.index) {
      throw new SyntaxError('DOSAI_JSON_SYNTAX_0001');
    }
    JSON.parse(this.source.slice(start, this.index));
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.source[this.index] ?? '')) {
      this.index += 1;
    }
  }
}

function rejectInvalidNumbers(value: unknown): void {
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
    throw new SyntaxError('DOSAI_JSON_NUMBER_0001');
  }
  if (Array.isArray(value)) {
    for (const item of value) rejectInvalidNumbers(item);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) rejectInvalidNumbers(item);
  }
}

export function parseStrictJsonBytes(bytes: Uint8Array): unknown {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new SyntaxError('DOSAI_JSON_BOM_0001');
  }
  let source = '';
  for (const byte of bytes) {
    if (byte > 0x7f) {
      throw new SyntaxError('DOSAI_JSON_ENCODING_0001');
    }
    source += String.fromCharCode(byte);
  }
  new StrictJsonScanner(source).scan();
  const value: unknown = JSON.parse(source);
  rejectInvalidNumbers(value);
  return value;
}
