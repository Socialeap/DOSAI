import { app } from 'electron';
import { join } from 'node:path';

import {
  createServiceManagementLifecycleCore,
  type NativeServiceManagementLifecycleBinding,
  type ServiceManagementLifecycleReceipt,
  type ServiceManagementLifecycleResult,
} from './service-management-lifecycle-core';
import type { ServiceManagementStatusObservation } from './service-management-status-adapter';

const resultPrefix = 'DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:';
const lifecycleAddonName = 'dosai-service-management-lifecycle.node';
const nativeAddonLoadFailure = 'NATIVE_ADDON_LOAD_FAILED' as const;
const nativeCallContractFailure = 'NATIVE_CALL_CONTRACT_FAILED' as const;
const electronReadinessFailure = 'ELECTRON_READINESS_FAILED' as const;
const failureObservation: ServiceManagementStatusObservation = 'NOT_FOUND';
const operationNames = Object.freeze(['observe', 'register', 'unregister'] as const);

type NativeOperationName = (typeof operationNames)[number];
type NativeOperation = (...arguments_: never[]) => unknown;
type ProofResult =
  | ServiceManagementLifecycleResult
  | typeof nativeAddonLoadFailure
  | typeof nativeCallContractFailure
  | typeof electronReadinessFailure;
type OperationCounts = Readonly<Record<NativeOperationName, number>>;
type LifecycleProofReceipt = Readonly<{
  readonly result: ProofResult;
  readonly before: ServiceManagementStatusObservation;
  readonly after_register: ServiceManagementStatusObservation;
  readonly after_unregister: ServiceManagementStatusObservation;
  readonly observe_attempts: number;
  readonly register_attempts: number;
  readonly unregister_attempts: number;
  readonly observe_completions: number;
  readonly register_completions: number;
  readonly unregister_completions: number;
  readonly consumed: boolean;
}>;
type AdmittedNativeBinding = Readonly<{
  readonly candidate: object;
  readonly operations: Readonly<Record<NativeOperationName, NativeOperation>>;
}>;
type MutableOperationCounts = Record<NativeOperationName, number>;

let emitted = false;

function zeroCounts(): MutableOperationCounts {
  return { observe: 0, register: 0, unregister: 0 };
}

function proofReceipt(
  result: ProofResult,
  receipt: ServiceManagementLifecycleReceipt,
  attempts: OperationCounts,
  completions: OperationCounts,
): LifecycleProofReceipt {
  return Object.freeze({
    result,
    before: receipt.before,
    after_register: receipt.after_register,
    after_unregister: receipt.after_unregister,
    observe_attempts: attempts.observe,
    register_attempts: attempts.register,
    unregister_attempts: attempts.unregister,
    observe_completions: completions.observe,
    register_completions: completions.register,
    unregister_completions: completions.unregister,
    consumed: receipt.consumed,
  });
}

function terminalFailure(result: ProofResult): LifecycleProofReceipt {
  const attempts = Object.freeze(zeroCounts());
  return Object.freeze({
    result,
    before: failureObservation,
    after_register: failureObservation,
    after_unregister: failureObservation,
    observe_attempts: attempts.observe,
    register_attempts: attempts.register,
    unregister_attempts: attempts.unregister,
    observe_completions: attempts.observe,
    register_completions: attempts.register,
    unregister_completions: attempts.unregister,
    consumed: false,
  });
}

function uncertainLifecycleFailure(): LifecycleProofReceipt {
  return Object.freeze({
    result: nativeCallContractFailure,
    before: failureObservation,
    after_register: failureObservation,
    after_unregister: failureObservation,
    observe_attempts: 3,
    register_attempts: 1,
    unregister_attempts: 1,
    observe_completions: 0,
    register_completions: 0,
    unregister_completions: 0,
    consumed: true,
  });
}

function loadFixedLifecycleAddon(): unknown {
  return module.require(join(process.resourcesPath, lifecycleAddonName));
}

function admitNativeBinding(candidate: unknown): AdmittedNativeBinding | undefined {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }
  try {
    const keys = Reflect.ownKeys(candidate);
    if (
      keys.some(key => typeof key === 'symbol')
      || keys.map(String).sort().join('\0') !== 'observe\0register\0unregister'
    ) return undefined;

    const operations = Object.create(null) as Record<NativeOperationName, NativeOperation>;
    for (const name of operationNames) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, name);
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !('value' in descriptor)
        || typeof descriptor.value !== 'function'
      ) return undefined;
      operations[name] = descriptor.value as NativeOperation;
    }
    return Object.freeze({ candidate, operations: Object.freeze(operations) });
  } catch {
    return undefined;
  }
}

function exerciseLifecycleBinding(candidate: unknown): LifecycleProofReceipt {
  const admitted = admitNativeBinding(candidate);
  if (admitted === undefined) {
    const receipt = createServiceManagementLifecycleCore(undefined).exercise();
    const counts = Object.freeze(zeroCounts());
    return proofReceipt(receipt.result, receipt, counts, counts);
  }

  const attempts = zeroCounts();
  const completions = zeroCounts();
  let callContractFailed = false;
  const invoke = (name: NativeOperationName, arguments_: never[]): unknown => {
    attempts[name] += 1;
    if (arguments_.length !== 0) {
      callContractFailed = true;
      throw new Error('DOSAI_LIFECYCLE_PROOF_ARGUMENT_COUNT_0001');
    }
    try {
      const result = Reflect.apply(admitted.operations[name], admitted.candidate, arguments_);
      completions[name] += 1;
      return result;
    } catch {
      callContractFailed = true;
      throw new Error('DOSAI_LIFECYCLE_PROOF_NATIVE_CALL_0001');
    }
  };
  const monitoredBinding: NativeServiceManagementLifecycleBinding = Object.freeze({
    observe(...arguments_: never[]): unknown {
      return invoke('observe', arguments_);
    },
    register(...arguments_: never[]): unknown {
      return invoke('register', arguments_);
    },
    unregister(...arguments_: never[]): unknown {
      return invoke('unregister', arguments_);
    },
  });
  const receipt = createServiceManagementLifecycleCore(monitoredBinding).exercise();
  const expectedObservations = 1 + receipt.register_attempts + receipt.unregister_attempts;
  const countsAreExact = attempts.observe === expectedObservations
    && attempts.register === receipt.register_attempts
    && attempts.unregister === receipt.unregister_attempts
    && completions.observe === attempts.observe
    && completions.register === attempts.register
    && completions.unregister === attempts.unregister;
  const boundsHold = attempts.observe <= 3
    && attempts.register <= 1
    && attempts.unregister <= 1
    && receipt.result !== 'ALREADY_CONSUMED'
    && receipt.result !== 'BINDING_INVALID';
  return proofReceipt(
    callContractFailed || !countsAreExact || !boundsHold
      ? nativeCallContractFailure
      : receipt.result,
    receipt,
    Object.freeze({ ...attempts }),
    Object.freeze({ ...completions }),
  );
}

function runLifecycleProof(): LifecycleProofReceipt {
  let candidate: unknown;
  try {
    candidate = loadFixedLifecycleAddon();
  } catch {
    return terminalFailure(nativeAddonLoadFailure);
  }
  try {
    return exerciseLifecycleBinding(candidate);
  } catch {
    return uncertainLifecycleFailure();
  }
}

function emitResult(receipt: LifecycleProofReceipt): void {
  if (emitted) {
    app.exit(1);
    return;
  }
  emitted = true;
  process.stdout.write(`${resultPrefix}${JSON.stringify(receipt)}\n`);
  app.exit(0);
}

void app.whenReady().then(
  () => emitResult(runLifecycleProof()),
  () => emitResult(terminalFailure(electronReadinessFailure)),
);
