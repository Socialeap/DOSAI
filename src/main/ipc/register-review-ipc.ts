import { BrowserWindow, dialog, ipcMain } from 'electron';

import { REVIEW_IPC } from '../../contracts/ipc.ts';
import type { ReviewPlan, ReviewSession } from '../../contracts/review-session';
import { ReviewSessionEngine } from '../review/session-engine.ts';
import { isTrustedIpcSender } from '../security/application-policy.ts';

async function confirmReview(window: BrowserWindow, plan: ReviewPlan): Promise<boolean> {
  if (window.isDestroyed() || !window.isFocused() || !window.isVisible()) {
    throw new Error('Local confirmation requires the focused DOSAI window.');
  }

  const { config } = plan;
  const { response } = await dialog.showMessageBox(window, {
    type: 'question',
    title: 'DOSAI review approval',
    message: `Prepare two manual review handoffs for ${config.repository}?`,
    detail: [
      `Base: ${config.base}`,
      `Candidate: ${config.head}`,
      `Patch SHA-256: ${config.patchSha256}`,
      `Correctness: ${config.correctness}`,
      `Test coverage: ${config.testCoverage}`,
      '',
      'Approval prepares handoff text on this Mac. You decide whether to share it.',
    ].join('\n'),
    buttons: ['Deny', 'Approve handoffs'],
    cancelId: 0,
    defaultId: 0,
    noLink: true,
  });
  return !window.isDestroyed() && response === 1;
}

type Handler = (engine: ReviewSessionEngine, owner: BrowserWindow, input: unknown) => Promise<ReviewSession | null>;

export function registerReviewIpc(isPackaged: boolean): void {
  const sessions = new WeakMap<BrowserWindow, ReviewSessionEngine>();

  function engineFor(owner: BrowserWindow): ReviewSessionEngine {
    const existing = sessions.get(owner);
    if (existing !== undefined) return existing;

    const engine = new ReviewSessionEngine();
    sessions.set(owner, engine);
    owner.once('closed', () => engine.clear());
    owner.webContents.on('render-process-gone', () => engine.clear());
    return engine;
  }

  function handle(channel: (typeof REVIEW_IPC)[keyof typeof REVIEW_IPC], arity: number, handler: Handler): void {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const frame = event.senderFrame;
      if (
        owner === null || owner.isDestroyed() || args.length !== arity ||
        !isTrustedIpcSender({
          frameUrl: frame?.url,
          isMainFrame: frame !== null && frame === event.sender.mainFrame,
          ownerWebContentsId: owner.webContents.id,
          senderWebContentsId: event.sender.id,
        }, isPackaged)
      ) {
        throw new Error('Rejected untrusted DOSAI review request.');
      }

      return handler(engineFor(owner), owner, args[0]);
    });
  }

  handle(REVIEW_IPC.getSession, 0, (engine) => engine.getSession());
  handle(REVIEW_IPC.prepare, 1, (engine, _owner, input) => engine.prepare(input));
  handle(REVIEW_IPC.requestApproval, 1, (engine, owner, input) =>
    engine.requestApproval(input, (plan) => confirmReview(owner, plan)));
  handle(REVIEW_IPC.recordReport, 1, (engine, _owner, input) => engine.recordReport(input));
  handle(REVIEW_IPC.stop, 1, (engine, _owner, input) => engine.stop(input));
}
