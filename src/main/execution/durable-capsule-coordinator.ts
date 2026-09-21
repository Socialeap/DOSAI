import type { CancellationReason } from '../../contracts/p3/contracts.ts';
import type {
  CapsuleRegistryAuditBindingPort,
  CapsuleRegistryTransition,
} from '../../contracts/p3/audit-binding.ts';
import type { CapsuleRegistryDocument } from '../../contracts/p3/persistence.ts';
import type { CapsuleStateStore } from './capsule-state-store.ts';
import {
  CapsuleSupervisor,
  type CancellationResult,
  type CapsuleSnapshot,
} from './capsule-supervisor.ts';

export type DurableCoordinatorStatus = 'READY' | 'BROKEN';
export type PersistenceOutcome = 'DURABLE' | 'FAILED';

export type EmergencyStopOutcome = Readonly<{
  readonly results: readonly CancellationResult[];
  readonly persistence: PersistenceOutcome;
  readonly coordinatorStatus: DurableCoordinatorStatus;
  readonly durableRevision: string;
}>;

export type DurableCoordinatorOpenResult = Readonly<{
  readonly coordinator: DurableCapsuleCoordinator;
  readonly startupQuarantinedCapsuleIds: readonly string[];
}>;

export type DurableCapsuleCoordinatorFailureCode =
  | 'DOSAI_CAPSULE_COORDINATOR_AUDIT_BINDING_0001'
  | 'DOSAI_CAPSULE_COORDINATOR_BROKEN_0001'
  | 'DOSAI_CAPSULE_COORDINATOR_CONTINUITY_0001'
  | 'DOSAI_CAPSULE_COORDINATOR_PERSISTENCE_0001';

export class DurableCapsuleCoordinatorFailure extends Error {
  readonly code: DurableCapsuleCoordinatorFailureCode;

  constructor(code: DurableCapsuleCoordinatorFailureCode) {
    super(code);
    this.name = 'DurableCapsuleCoordinatorFailure';
    this.code = code;
  }
}

const CONSTRUCTION_TOKEN = Symbol('DOSAI_DURABLE_CAPSULE_COORDINATOR');

export class DurableCapsuleCoordinator {
  private readonly store: CapsuleStateStore;
  private readonly auditBinding: CapsuleRegistryAuditBindingPort;
  private readonly supervisor: CapsuleSupervisor;
  private readonly supervisorGeneration: string;
  private durableRegistryValue: CapsuleRegistryDocument;
  private durableRevisionValue: string;
  private statusValue: DurableCoordinatorStatus = 'READY';
  private tail: Promise<void> = Promise.resolve();

  constructor(
    token: symbol,
    store: CapsuleStateStore,
    auditBinding: CapsuleRegistryAuditBindingPort,
    supervisor: CapsuleSupervisor,
    durableRegistry: CapsuleRegistryDocument,
  ) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw new DurableCapsuleCoordinatorFailure('DOSAI_CAPSULE_COORDINATOR_BROKEN_0001');
    }
    this.store = store;
    this.auditBinding = auditBinding;
    this.supervisor = supervisor;
    this.supervisorGeneration = durableRegistry.supervisor_generation;
    this.durableRegistryValue = durableRegistry;
    this.durableRevisionValue = durableRegistry.revision;
  }

  get status(): DurableCoordinatorStatus {
    return this.statusValue;
  }

  get durableRevision(): string {
    return this.durableRevisionValue;
  }

  register(candidate: unknown, now: number): Promise<CapsuleSnapshot> {
    return this.serialize(async () => {
      this.assertReady();
      const snapshot = this.supervisor.register(candidate, now);
      await this.commit(now, 'REGISTER');
      this.assertReady();
      return snapshot;
    });
  }

  begin(capsuleId: string, generation: string, now: number): Promise<CapsuleSnapshot> {
    return this.serialize(async () => {
      this.assertReady();
      const snapshot = this.supervisor.begin(capsuleId, generation);
      await this.commit(now, 'BEGIN');
      this.assertReady();
      return snapshot;
    });
  }

  appendOutput(
    capsuleId: string,
    generation: string,
    bytes: number,
    now: number,
  ): Promise<CapsuleSnapshot | CancellationResult> {
    return this.serialize(async () => {
      this.assertReady();
      const result = await this.supervisor.appendOutput(capsuleId, generation, bytes, now);
      await this.commit(now, 'OUTPUT');
      this.assertReady();
      return result;
    });
  }

  cancel(
    capsuleId: string,
    generation: string,
    reason: CancellationReason,
    now: number,
  ): Promise<CancellationResult> {
    return this.serialize(async () => {
      this.assertReady();
      const result = await this.supervisor.cancel(capsuleId, generation, reason, now);
      await this.commit(now, 'CANCEL');
      this.assertReady();
      return result;
    });
  }

  watchdogSweep(now: number): Promise<readonly CancellationResult[]> {
    return this.serialize(async () => {
      this.assertReady();
      const results = await this.supervisor.watchdogSweep(now);
      if (results.length > 0) await this.commit(now, 'WATCHDOG');
      this.assertReady();
      return results;
    });
  }

  async emergencyStop(now: number): Promise<EmergencyStopOutcome> {
    const results = await this.supervisor.emergencyStop(now);
    let persistence: PersistenceOutcome = 'DURABLE';
    try {
      await this.commit(now, 'EMERGENCY_STOP');
    } catch {
      persistence = 'FAILED';
    }
    return Object.freeze({
      results,
      persistence,
      coordinatorStatus: this.statusValue,
      durableRevision: this.durableRevisionValue,
    });
  }

  snapshot(capsuleId: string): CapsuleSnapshot {
    return this.supervisor.snapshot(capsuleId);
  }

  registry(_now: number): CapsuleRegistryDocument {
    return this.durableRegistryValue;
  }

  private assertReady(): void {
    if (this.statusValue !== 'READY') {
      throw new DurableCapsuleCoordinatorFailure('DOSAI_CAPSULE_COORDINATOR_BROKEN_0001');
    }
  }

  private async commit(now: number, transition: CapsuleRegistryTransition): Promise<void> {
    const previous = this.durableRegistryValue;
    const nextRevision = (BigInt(this.durableRevisionValue) + 1n).toString();
    const candidate = this.supervisor.exportRegistry(
      this.supervisorGeneration,
      nextRevision,
      now,
    );
    try {
      const saved = await this.store.save(candidate);
      if (
        saved.supervisor_generation !== this.supervisorGeneration ||
        saved.revision !== nextRevision
      ) {
        throw new Error('DOSAI_CAPSULE_COORDINATOR_STORE_IDENTITY_0001');
      }
      this.durableRegistryValue = saved;
      this.durableRevisionValue = saved.revision;
    } catch {
      this.statusValue = 'BROKEN';
      throw new DurableCapsuleCoordinatorFailure(
        'DOSAI_CAPSULE_COORDINATOR_PERSISTENCE_0001',
      );
    }
    try {
      await this.auditBinding.bindTransition(previous, this.durableRegistryValue, transition);
    } catch {
      this.statusValue = 'BROKEN';
      throw new DurableCapsuleCoordinatorFailure(
        'DOSAI_CAPSULE_COORDINATOR_AUDIT_BINDING_0001',
      );
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export async function openDurableCapsuleCoordinator(
  store: CapsuleStateStore,
  supervisorGeneration: string,
  now: number,
  auditBinding: CapsuleRegistryAuditBindingPort,
): Promise<DurableCoordinatorOpenResult> {
  const current = await store.load();
  if (current === null) {
    try {
      await auditBinding.verifyCurrent(null);
    } catch {
      throw new DurableCapsuleCoordinatorFailure(
        'DOSAI_CAPSULE_COORDINATOR_CONTINUITY_0001',
      );
    }
    const supervisor = new CapsuleSupervisor();
    const initial = supervisor.exportRegistry(supervisorGeneration, '1', now);
    const saved = await store.save(initial);
    try {
      await auditBinding.bindTransition(null, saved, 'INITIALIZE');
    } catch {
      throw new DurableCapsuleCoordinatorFailure(
        'DOSAI_CAPSULE_COORDINATOR_AUDIT_BINDING_0001',
      );
    }
    return Object.freeze({
      coordinator: new DurableCapsuleCoordinator(
        CONSTRUCTION_TOKEN,
        store,
        auditBinding,
        supervisor,
        saved,
      ),
      startupQuarantinedCapsuleIds: Object.freeze([]),
    });
  }

  try {
    await auditBinding.verifyCurrent(current);
  } catch {
    throw new DurableCapsuleCoordinatorFailure(
      'DOSAI_CAPSULE_COORDINATOR_CONTINUITY_0001',
    );
  }

  const restored = CapsuleSupervisor.restoreFromRegistry(
    current,
    supervisorGeneration,
    now,
  );
  const saved = await store.save(restored.registry);
  try {
    await auditBinding.bindTransition(current, saved, 'STARTUP_RECONCILE');
  } catch {
    throw new DurableCapsuleCoordinatorFailure(
      'DOSAI_CAPSULE_COORDINATOR_AUDIT_BINDING_0001',
    );
  }
  return Object.freeze({
    coordinator: new DurableCapsuleCoordinator(
      CONSTRUCTION_TOKEN,
      store,
      auditBinding,
      restored.supervisor,
      saved,
    ),
    startupQuarantinedCapsuleIds: restored.quarantinedCapsuleIds,
  });
}
