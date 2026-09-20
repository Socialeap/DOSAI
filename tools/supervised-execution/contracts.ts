// Offline capability proof only. These are not registered DOSAI runtime operations.
export const FIXTURE = Object.freeze([
  Object.freeze({ suite: 'authorization', passed: 8, failed: 0 }),
  Object.freeze({ suite: 'routing', passed: 4, failed: 1 }),
  Object.freeze({ suite: 'validation', passed: 6, failed: 0 }),
] as const);

export const ROUTES = Object.freeze({
  SUMMARIZE_FIXTURE: Object.freeze({
    handler: 'fixture.summary.v1',
    resourceId: '1cb2cb1a-d886-4606-9bd2-3bbdb286fe58',
  }),
  LIST_FIXTURE_FAILURES: Object.freeze({
    handler: 'fixture.failures.v1',
    resourceId: '220e63b2-82f4-49ce-9d32-8ad170eb16a2',
  }),
} as const);

export type Action = keyof typeof ROUTES;
export type Request = Readonly<{
  version: 1;
  action: Action;
  fixture: 'beta-core-v1';
  generation: '1';
}>;
export type FixtureResult = Readonly<{
  suites: number;
  passed: number;
  failed: number;
}>;
export type Configuration = Readonly<{
  enabled: boolean;
  mode: 'FIXTURE_ONLY';
  generation: '1';
}>;

export class SliceFailure extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'SliceFailure';
  }
}

// Reject accessors, inherited fields, symbols and extra fields before reading values.
function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SliceFailure('INVALID_CONTRACT');
  }
  const prototype = Object.getPrototypeOf(value);
  const actual = Reflect.ownKeys(value);
  if ((prototype !== Object.prototype && prototype !== null) ||
      actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw new SliceFailure('INVALID_CONTRACT');
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new SliceFailure('INVALID_CONTRACT');
    }
    result[key] = descriptor.value;
  }
  return result;
}

export function admitRequest(value: unknown): Request {
  const input = exactRecord(value, ['version', 'action', 'fixture', 'generation']);
  if (input.version !== 1 || input.fixture !== 'beta-core-v1' || input.generation !== '1' ||
      (input.action !== 'SUMMARIZE_FIXTURE' && input.action !== 'LIST_FIXTURE_FAILURES')) {
    throw new SliceFailure('ACTION_NOT_ALLOWED');
  }
  return Object.freeze(input) as Request;
}

export function admitConfiguration(value: unknown): Configuration {
  const input = exactRecord(value, ['enabled', 'mode', 'generation']);
  if (input.enabled !== true || input.mode !== 'FIXTURE_ONLY' || input.generation !== '1') {
    throw new SliceFailure('CONFIGURATION_UNAVAILABLE');
  }
  return Object.freeze(input) as Configuration;
}

export function evaluateFixture(action: Action): FixtureResult {
  // Closed dispatch; no caller-supplied handlers, scripts, paths, endpoints or plugins.
  const rows = action === 'SUMMARIZE_FIXTURE' ? FIXTURE :
    action === 'LIST_FIXTURE_FAILURES' ? FIXTURE.filter(row => row.failed > 0) : null;
  if (rows === null) throw new SliceFailure('ACTION_NOT_ALLOWED');
  let passed = 0;
  let failed = 0;
  for (const row of rows) { passed += row.passed; failed += row.failed; }
  return Object.freeze({
    suites: rows.length,
    passed,
    failed,
  });
}
