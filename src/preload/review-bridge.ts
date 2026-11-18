import { ipcRenderer } from 'electron';

import { REVIEW_IPC } from '../contracts/ipc';
import type { ReviewBridge, ReviewSession } from '../contracts/review-session';

function invoke<T extends ReviewSession | null>(
  operation: keyof typeof REVIEW_IPC,
  argumentCount: number,
  args: readonly unknown[],
): Promise<T> {
  if (args.length !== argumentCount) {
    return Promise.reject(new TypeError('Invalid review argument count.'));
  }
  return ipcRenderer.invoke(REVIEW_IPC[operation], ...args);
}

export function createReviewBridge(): ReviewBridge {
  return Object.freeze({
    getSession: (...args: unknown[]) => invoke<ReviewSession | null>('getSession', 0, args),
    prepare: (...args: unknown[]) => invoke<ReviewSession>('prepare', 1, args),
    requestApproval: (...args: unknown[]) => invoke<ReviewSession>('requestApproval', 1, args),
    recordReport: (...args: unknown[]) => invoke<ReviewSession>('recordReport', 1, args),
    stop: (...args: unknown[]) => invoke<ReviewSession>('stop', 1, args),
  });
}
