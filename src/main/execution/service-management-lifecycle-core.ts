import {
  createServiceManagementStatusAdapter,
  type ServiceManagementStatusObservation,
} from './service-management-status-adapter.ts';

export const serviceManagementLifecycleResults = Object.freeze([
  'REGISTERED_AND_CLEANED',
  'REGISTRATION_REJECTED_CLEAN',
  'REGISTRATION_FAILED_RECOVERED',
  'PRECONDITION_FAILED',
  'CLEANUP_UNVERIFIED',
  'BINDING_INVALID',
  'ALREADY_CONSUMED',
] as const);

export type ServiceManagementLifecycleResult =
  (typeof serviceManagementLifecycleResults)[number];

export type NativeServiceManagementLifecycleBinding = Readonly<{
  readonly observe: () => unknown;
  readonly register: () => unknown;
  readonly unregister: () => unknown;
}>;

export type ServiceManagementLifecycleReceipt = Readonly<{
  readonly result: ServiceManagementLifecycleResult;
  readonly before: ServiceManagementStatusObservation;
  readonly after_register: ServiceManagementStatusObservation;
  readonly after_unregister: ServiceManagementStatusObservation;
  readonly register_attempts: 0 | 1;
  readonly unregister_attempts: 0 | 1;
  readonly consumed: boolean;
}>;

export type ServiceManagementLifecycleCore = Readonly<{
  readonly exercise: () => ServiceManagementLifecycleReceipt;
}>;

type AdmittedBinding = Readonly<{
  readonly candidate: object;
  readonly observe: (...arguments_: never[]) => unknown;
  readonly register: (...arguments_: never[]) => unknown;
  readonly unregister: (...arguments_: never[]) => unknown;
}>;

const failureObservation: ServiceManagementStatusObservation = 'NOT_FOUND';

function admitBinding(candidate: unknown): AdmittedBinding | undefined {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }
  try {
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const keys = Reflect.ownKeys(candidate);
    if (
      keys.some(key => typeof key === 'symbol')
      || keys.map(String).sort().join('\0') !== 'observe\0register\0unregister'
    ) {
      return undefined;
    }
    const functions = ['observe', 'register', 'unregister'].map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !('value' in descriptor)
        || typeof descriptor.value !== 'function'
      ) {
        return undefined;
      }
      return descriptor.value as (...arguments_: never[]) => unknown;
    });
    const [observe, register, unregister] = functions;
    if (observe === undefined || register === undefined || unregister === undefined) {
      return undefined;
    }
    return Object.freeze({ candidate, observe, register, unregister });
  } catch {
    return undefined;
  }
}

function receipt(
  result: ServiceManagementLifecycleResult,
  before: ServiceManagementStatusObservation,
  afterRegister: ServiceManagementStatusObservation,
  afterUnregister: ServiceManagementStatusObservation,
  registerAttempts: 0 | 1,
  unregisterAttempts: 0 | 1,
  consumed: boolean,
): ServiceManagementLifecycleReceipt {
  return Object.freeze({
    result,
    before,
    after_register: afterRegister,
    after_unregister: afterUnregister,
    register_attempts: registerAttempts,
    unregister_attempts: unregisterAttempts,
    consumed,
  });
}

export function createServiceManagementLifecycleCore(
  bindingCandidate: unknown,
): ServiceManagementLifecycleCore {
  const binding = admitBinding(bindingCandidate);
  const observer = createServiceManagementStatusAdapter(binding === undefined
    ? undefined
    : Object.freeze({
      observe: () => Reflect.apply(binding.observe, binding.candidate, []),
    }));
  let consumed = false;

  return Object.freeze({
    exercise(): ServiceManagementLifecycleReceipt {
      if (consumed) {
        return receipt(
          'ALREADY_CONSUMED',
          failureObservation,
          failureObservation,
          failureObservation,
          0,
          0,
          true,
        );
      }
      consumed = true;
      if (binding === undefined) {
        return receipt(
          'BINDING_INVALID',
          failureObservation,
          failureObservation,
          failureObservation,
          0,
          0,
          true,
        );
      }

      const before = observer.observe();
      if (before !== 'NOT_REGISTERED' && before !== 'NOT_FOUND') {
        return receipt('PRECONDITION_FAILED', before, before, before, 0, 0, true);
      }

      let registered = false;
      try {
        registered = Reflect.apply(binding.register, binding.candidate, []) === true;
      } catch {
        registered = false;
      }
      const afterRegister = observer.observe();
      const cleanupRequired = registered
        || afterRegister === 'ENABLED'
        || afterRegister === 'REQUIRES_APPROVAL';
      if (!cleanupRequired) {
        return receipt(
          afterRegister === 'NOT_REGISTERED'
            ? 'REGISTRATION_REJECTED_CLEAN'
            : 'CLEANUP_UNVERIFIED',
          before,
          afterRegister,
          afterRegister,
          1,
          0,
          true,
        );
      }

      let unregistered = false;
      try {
        unregistered = Reflect.apply(binding.unregister, binding.candidate, []) === true;
      } catch {
        unregistered = false;
      }
      const afterUnregister = observer.observe();
      if (!unregistered || afterUnregister !== 'NOT_REGISTERED') {
        return receipt(
          'CLEANUP_UNVERIFIED',
          before,
          afterRegister,
          afterUnregister,
          1,
          1,
          true,
        );
      }
      return receipt(
        registered ? 'REGISTERED_AND_CLEANED' : 'REGISTRATION_FAILED_RECOVERED',
        before,
        afterRegister,
        afterUnregister,
        1,
        1,
        true,
      );
    },
  });
}
