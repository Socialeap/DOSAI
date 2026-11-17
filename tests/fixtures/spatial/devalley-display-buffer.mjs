// Source-only buffer. Taking a frame returns synthetic data without sending it.
import { createSyntheticDevalleyResidentSet } from './devalley-display-adapter.mjs';

function bufferResident(resident) {
  let pending = null;

  return Object.freeze({
    connect: resident.connect,
    view: resident.view,

    disconnect(generation, nowMs) {
      if (!resident.disconnect(generation, nowMs)) return false;
      pending = null;
      return true;
    },

    observe(event, nowMs) {
      const before = resident.view(nowMs).lastObservedSequence;
      const frame = resident.observe(event, nowMs);
      const after = resident.view(nowMs).lastObservedSequence;
      if (before === after) return false;

      // Every accepted observation supersedes earlier display data. DOSAI-only
      // states replace the slot with null.
      pending = frame;
      return true;
    },

    take(nowMs) {
      const { connected, stale } = resident.view(nowMs);
      const frame = pending;
      pending = null;
      return connected && !stale ? frame : null;
    },
  });
}

export function createSyntheticDevalleyBufferedResidentSet() {
  const { m1, m4 } = createSyntheticDevalleyResidentSet();
  return Object.freeze({ m1: bufferResident(m1), m4: bufferResident(m4) });
}
