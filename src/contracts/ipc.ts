import type { RuntimeSnapshot } from './runtime';

export const APPLICATION_IPC = Object.freeze({
  getRuntimeSnapshot: 'dosai:runtime:get-snapshot',
} as const);

export interface RuntimeBridge {
  getSnapshot(): Promise<RuntimeSnapshot>;
}

export interface DosaiBridge {
  readonly runtime: RuntimeBridge;
}
