import {
  CAPSULE_STATES,
  CANCELLATION_REASONS,
  admitFixedSafeTestCapsuleRequest,
  type CancellationReason,
  type CapsuleRequest,
  type CapsuleState,
} from '../../contracts/p3/contracts.ts';
import {
  admitCapsuleRegistryDocument,
  reconcileCapsuleRegistryDocument,
  type CapsuleRegistryDocument,
} from '../../contracts/p3/persistence.ts';

export type CapsuleProcessHandle = Readonly<{
  readonly stop: (graceMs: number) => Promise<void>;
  readonly forceStop: () => Promise<void>;
  readonly isAlive: () => boolean;
}>;

export type CapsuleSnapshot = Readonly<{
  readonly request: CapsuleRequest;
  readonly state: CapsuleState;
  readonly registeredAt: number;
  readonly deadlineAt: number;
  readonly outputBytes: number;
  readonly processAttached: boolean;
  readonly lastCancellationReason?: CancellationReason;
}>;

export type CancellationResult = Readonly<{
  readonly capsuleId: string;
  readonly state: Extract<CapsuleState, 'STOPPED' | 'QUARANTINED'>;
  readonly cleanup: 'VERIFIED' | 'UNCERTAIN';
  readonly reason: CancellationReason;
}>;

export type CapsuleRestoreResult = Readonly<{
  readonly supervisor: CapsuleSupervisor;
  readonly registry: CapsuleRegistryDocument;
  readonly quarantinedCapsuleIds: readonly string[];
}>;

type CapsuleRecord = {
  readonly request: CapsuleRequest;
  readonly registeredAt: number;
  readonly deadlineAt: number;
  state: CapsuleState;
  outputBytes: number;
  process?: CapsuleProcessHandle;
  lastCancellationReason?: CancellationReason;
  cancellation?: Promise<CancellationResult>;
};

const ACTIVE_STATES = new Set<CapsuleState>(['REGISTERED', 'STARTING', 'RUNNING', 'STOPPING']);
const TERMINAL_STATES = new Set<CapsuleState>(['STOPPED', 'FAILED', 'QUARANTINED']);
const GRACE_PERIOD_MS = 250;

function assertState(value: CapsuleState): void {
  if (!CAPSULE_STATES.includes(value)) {
    throw new TypeError('DOSAI_CAPSULE_STATE_0001');
  }
}

function assertReason(value: CancellationReason): void {
  if (!CANCELLATION_REASONS.includes(value)) {
    throw new TypeError('DOSAI_CAPSULE_REASON_0001');
  }
}

function nowValue(now: number): number {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new TypeError('DOSAI_CAPSULE_CLOCK_0001');
  }
  return now;
}

export class CapsuleSupervisor {
  private readonly records = new Map<string, CapsuleRecord>();

  static restoreFromRegistry(
    candidate: unknown,
    nextSupervisorGeneration: string,
    now: number,
  ): CapsuleRestoreResult {
    const reconciled = reconcileCapsuleRegistryDocument(
      candidate,
      nextSupervisorGeneration,
      nowValue(now),
    );
    const supervisor = new CapsuleSupervisor();
    for (const persisted of reconciled.document.records) {
      supervisor.records.set(persisted.request.capsule_id, {
        request: persisted.request,
        registeredAt: persisted.registered_at_ms,
        deadlineAt: persisted.deadline_at_ms,
        state: persisted.state,
        outputBytes: persisted.output_bytes,
        ...(persisted.last_cancellation_reason === undefined
          ? {}
          : { lastCancellationReason: persisted.last_cancellation_reason }),
      });
    }
    return Object.freeze({
      supervisor,
      registry: reconciled.document,
      quarantinedCapsuleIds: reconciled.quarantined_capsule_ids,
    });
  }

  register(candidate: unknown, now: number): CapsuleSnapshot {
    const request = admitFixedSafeTestCapsuleRequest(candidate);
    const timestamp = nowValue(now);
    if (timestamp > Number.MAX_SAFE_INTEGER - request.limits.wall_time_ms) {
      throw new TypeError('DOSAI_CAPSULE_CLOCK_0001');
    }
    if (this.records.has(request.capsule_id)) {
      throw new Error('DOSAI_CAPSULE_DUPLICATE_0001');
    }
    const record: CapsuleRecord = {
      request,
      registeredAt: timestamp,
      deadlineAt: timestamp + request.limits.wall_time_ms,
      state: 'REGISTERED',
      outputBytes: 0,
    };
    this.records.set(request.capsule_id, record);
    return this.toSnapshot(record);
  }

  begin(capsuleId: string, generation: string): CapsuleSnapshot {
    const record = this.recordFor(capsuleId, generation);
    if (record.state !== 'REGISTERED') {
      throw new Error('DOSAI_CAPSULE_TRANSITION_0001');
    }
    record.state = 'STARTING';
    return this.toSnapshot(record);
  }

  attachProcess(
    capsuleId: string,
    generation: string,
    process: CapsuleProcessHandle,
  ): CapsuleSnapshot {
    const record = this.recordFor(capsuleId, generation);
    if (record.state !== 'STARTING' || !this.validProcessHandle(process)) {
      throw new Error('DOSAI_CAPSULE_PROCESS_0001');
    }
    record.process = process;
    record.state = 'RUNNING';
    return this.toSnapshot(record);
  }

  appendOutput(capsuleId: string, generation: string, bytes: number, now: number): Promise<CancellationResult> | CapsuleSnapshot {
    const record = this.recordFor(capsuleId, generation);
    if (!ACTIVE_STATES.has(record.state) || !Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error('DOSAI_CAPSULE_OUTPUT_0001');
    }
    const outputLimit = record.request.limits.max_output_bytes;
    if (bytes > outputLimit - record.outputBytes) {
      record.outputBytes = outputLimit + 1;
      return this.cancel(capsuleId, generation, 'OUTPUT_LIMIT', now);
    }
    record.outputBytes += bytes;
    return this.toSnapshot(record);
  }

  async cancel(
    capsuleId: string,
    generation: string,
    reason: CancellationReason,
    now: number,
  ): Promise<CancellationResult> {
    assertReason(reason);
    const record = this.recordFor(capsuleId, generation);
    nowValue(now);
    if (record.cancellation !== undefined) {
      return record.cancellation;
    }
    if (TERMINAL_STATES.has(record.state)) {
      const terminal = record.state === 'STOPPED' ? 'STOPPED' : 'QUARANTINED';
      return Object.freeze({
        capsuleId,
        state: terminal,
        cleanup: terminal === 'QUARANTINED' ? 'UNCERTAIN' : 'VERIFIED',
        reason: record.lastCancellationReason ?? reason,
      });
    }
    record.state = 'STOPPING';
    record.lastCancellationReason = reason;
    record.cancellation = this.stopRecord(record, reason);
    return record.cancellation;
  }

  async emergencyStop(now: number): Promise<readonly CancellationResult[]> {
    const ids = [...this.records.values()]
      .filter((record) => ACTIVE_STATES.has(record.state))
      .map((record) => record.request.capsule_id)
      .sort();
    return Promise.all(ids.map((id) => {
      const record = this.records.get(id);
      if (record === undefined) {
        throw new Error('DOSAI_CAPSULE_REGISTRY_0001');
      }
      return this.cancel(id, record.request.generation, 'EMERGENCY_STOP', now);
    }));
  }

  async watchdogSweep(now: number): Promise<readonly CancellationResult[]> {
    const timestamp = nowValue(now);
    const expired = [...this.records.values()]
      .filter((record) => ACTIVE_STATES.has(record.state) && timestamp >= record.deadlineAt)
      .map((record) => record.request.capsule_id)
      .sort();
    return Promise.all(expired.map((id) => {
      const record = this.records.get(id);
      if (record === undefined) {
        throw new Error('DOSAI_CAPSULE_REGISTRY_0001');
      }
      return this.cancel(id, record.request.generation, 'WATCHDOG_TIMEOUT', timestamp);
    }));
  }

  snapshot(capsuleId: string): CapsuleSnapshot {
    const record = this.records.get(capsuleId);
    if (record === undefined) {
      throw new Error('DOSAI_CAPSULE_NOT_FOUND_0001');
    }
    return this.toSnapshot(record);
  }

  exportRegistry(
    supervisorGeneration: string,
    revision: string,
    now: number,
  ): CapsuleRegistryDocument {
    return admitCapsuleRegistryDocument({
      schema_id: 'urn:dosai:schema:capsule-registry:1',
      schema_version: 1,
      supervisor_generation: supervisorGeneration,
      revision,
      updated_at_ms: nowValue(now),
      records: [...this.records.values()].map((record) => ({
        request: record.request,
        state: record.state,
        registered_at_ms: record.registeredAt,
        deadline_at_ms: record.deadlineAt,
        output_bytes: record.outputBytes,
        process_attached: record.process !== undefined,
        ...(record.lastCancellationReason === undefined
          ? {}
          : { last_cancellation_reason: record.lastCancellationReason }),
      })),
    });
  }

  private async stopRecord(record: CapsuleRecord, reason: CancellationReason): Promise<CancellationResult> {
    const process = record.process;
    if (process === undefined) {
      record.state = 'STOPPED';
      return this.stoppedResult(record, reason);
    }
    const gracefulOutcome = await this.awaitGracefulStop(process);
    if (gracefulOutcome === 'COMPLETED' && this.isStopped(process)) {
      delete record.process;
      record.state = 'STOPPED';
      return this.stoppedResult(record, reason);
    }
    return this.forceAndVerify(record, process, reason);
  }

  private awaitGracefulStop(process: CapsuleProcessHandle): Promise<'COMPLETED' | 'TIMED_OUT' | 'FAILED'> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome: 'COMPLETED' | 'TIMED_OUT' | 'FAILED') => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(outcome);
      };
      const timer = setTimeout(() => finish('TIMED_OUT'), GRACE_PERIOD_MS);
      try {
        void process.stop(GRACE_PERIOD_MS).then(
          () => finish('COMPLETED'),
          () => finish('FAILED'),
        );
      } catch {
        finish('FAILED');
      }
    });
  }

  private async forceAndVerify(
    record: CapsuleRecord,
    process: CapsuleProcessHandle,
    reason: CancellationReason,
  ): Promise<CancellationResult> {
    try {
      await process.forceStop();
      if (this.isStopped(process)) {
        delete record.process;
        record.state = 'STOPPED';
        return this.stoppedResult(record, reason);
      }
    } catch {
      // Cleanup uncertainty is a quarantine, never a false success.
    }
    record.state = 'QUARANTINED';
    return Object.freeze({
      capsuleId: record.request.capsule_id,
      state: 'QUARANTINED',
      cleanup: 'UNCERTAIN',
      reason,
    });
  }

  private isStopped(process: CapsuleProcessHandle): boolean {
    try {
      return !process.isAlive();
    } catch {
      return false;
    }
  }

  private stoppedResult(record: CapsuleRecord, reason: CancellationReason): CancellationResult {
    return Object.freeze({
      capsuleId: record.request.capsule_id,
      state: 'STOPPED',
      cleanup: 'VERIFIED',
      reason,
    });
  }

  private recordFor(capsuleId: string, generation: string): CapsuleRecord {
    const record = this.records.get(capsuleId);
    if (record === undefined || record.request.generation !== generation) {
      throw new Error('DOSAI_CAPSULE_IDENTITY_0001');
    }
    assertState(record.state);
    return record;
  }

  private validProcessHandle(process: CapsuleProcessHandle): boolean {
    return process !== null &&
      typeof process === 'object' &&
      typeof process.stop === 'function' &&
      typeof process.forceStop === 'function' &&
      typeof process.isAlive === 'function';
  }

  private toSnapshot(record: CapsuleRecord): CapsuleSnapshot {
    return Object.freeze({
      request: record.request,
      state: record.state,
      registeredAt: record.registeredAt,
      deadlineAt: record.deadlineAt,
      outputBytes: record.outputBytes,
      processAttached: record.process !== undefined,
      ...(record.lastCancellationReason === undefined
        ? {}
        : { lastCancellationReason: record.lastCancellationReason }),
    });
  }
}
