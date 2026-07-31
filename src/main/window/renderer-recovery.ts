export const RENDERER_RECOVERY_LIMIT = 3;
export const RENDERER_RECOVERY_INTERVAL_MS = 60_000;

export interface RendererRecoveryBudget {
  tryAcquire(reason: string): boolean;
}

export function createRendererRecoveryBudget(
  now: () => number = () => performance.now(),
): RendererRecoveryBudget {
  const recoveryAttempts: number[] = [];
  let lastObservedTime = Number.NEGATIVE_INFINITY;

  return Object.freeze({
    tryAcquire(reason: string): boolean {
      if (reason === 'clean-exit') {
        return false;
      }

      const currentTime = now();
      if (!Number.isFinite(currentTime) || currentTime < lastObservedTime) {
        return false;
      }
      lastObservedTime = currentTime;

      const oldestAllowedTime = currentTime - RENDERER_RECOVERY_INTERVAL_MS;
      while (
        recoveryAttempts[0] !== undefined &&
        recoveryAttempts[0] <= oldestAllowedTime
      ) {
        recoveryAttempts.shift();
      }

      if (recoveryAttempts.length >= RENDERER_RECOVERY_LIMIT) {
        return false;
      }

      recoveryAttempts.push(currentTime);
      return true;
    },
  });
}
