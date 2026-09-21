import type { CapsuleRegistryDocument } from './persistence.ts';

export const CAPSULE_REGISTRY_TRANSITIONS = Object.freeze([
  'INITIALIZE',
  'STARTUP_RECONCILE',
  'REGISTER',
  'BEGIN',
  'OUTPUT',
  'CANCEL',
  'WATCHDOG',
  'EMERGENCY_STOP',
] as const);

export type CapsuleRegistryTransition = (typeof CAPSULE_REGISTRY_TRANSITIONS)[number];

export type CapsuleRegistryBindingAcknowledgement = Readonly<{
  readonly journalSequence: string;
  readonly eventHash: Readonly<{
    readonly algorithm: 'SHA-256';
    readonly value: string;
  }>;
}>;

export type CapsuleRegistryAuditBindingPort = Readonly<{
  verifyCurrent(
    registry: CapsuleRegistryDocument | null,
  ): Promise<void>;
  bindTransition(
    previousRegistry: CapsuleRegistryDocument | null,
    currentRegistry: CapsuleRegistryDocument,
    transition: CapsuleRegistryTransition,
  ): Promise<CapsuleRegistryBindingAcknowledgement>;
}>;
