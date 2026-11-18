import type { ReviewBridge } from './review-session';
import type { RuntimeSnapshot } from './runtime';

export const APPLICATION_IPC = Object.freeze({
  getRuntimeSnapshot: 'dosai:runtime:get-snapshot',
} as const);

export const REVIEW_IPC = Object.freeze({
  getSession: 'dosai:review:get-session',
  prepare: 'dosai:review:prepare',
  requestApproval: 'dosai:review:request-approval',
  recordReport: 'dosai:review:record-report',
  stop: 'dosai:review:stop',
} as const);

export interface RuntimeBridge {
  getSnapshot(): Promise<RuntimeSnapshot>;
}

export interface DosaiBridge {
  readonly runtime: RuntimeBridge;
  readonly review: ReviewBridge;
}
