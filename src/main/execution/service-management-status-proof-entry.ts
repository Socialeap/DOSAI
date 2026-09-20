import { app } from 'electron';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  createServiceManagementStatusAdapter,
  serviceManagementStatusObservations,
  type ServiceManagementStatusObservation,
} from './service-management-status-adapter';

const resultPrefix = 'DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:';
const statusAddonName = 'dosai-service-management-status.node';
const requireFromProofEntry = createRequire(__filename);
const nativeAddonLoadFailure = 'NATIVE_ADDON_LOAD_FAILED' as const;
const nativeStatusCallFailure = 'NATIVE_STATUS_CALL_FAILED' as const;
const electronReadinessFailure = 'ELECTRON_READINESS_FAILED' as const;
type ProofObservation =
  | ServiceManagementStatusObservation
  | typeof nativeAddonLoadFailure
  | typeof nativeStatusCallFailure
  | typeof electronReadinessFailure;
type AddonLoadResult =
  | Readonly<{ readonly loaded: true; readonly binding: unknown }>
  | Readonly<{ readonly loaded: false }>;
type NativeObserver = (...arguments_: never[]) => unknown;
let emitted = false;

function loadFixedStatusAddon(): AddonLoadResult {
  try {
    return Object.freeze({
      binding: requireFromProofEntry(join(process.resourcesPath, statusAddonName)),
      loaded: true,
    });
  } catch {
    return Object.freeze({ loaded: false });
  }
}

function getOwnObserver(candidate: unknown): NativeObserver | undefined {
  if (
    candidate === null
    || (typeof candidate !== 'object' && typeof candidate !== 'function')
  ) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(candidate, 'observe');
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || typeof descriptor.value !== 'function'
    ) {
      return undefined;
    }
    return descriptor.value as NativeObserver;
  } catch {
    return undefined;
  }
}

function observeFixedStatusAddon(): ProofObservation {
  const addon = loadFixedStatusAddon();
  if (!addon.loaded) return nativeAddonLoadFailure;

  const observer = getOwnObserver(addon.binding);
  if (observer === undefined) return nativeStatusCallFailure;

  let argumentCount: number | undefined;
  let callCompleted = false;
  let rawObservation: unknown;
  const monitoredBinding = Object.freeze({
    observe(...arguments_: never[]): unknown {
      argumentCount = arguments_.length;
      rawObservation = Reflect.apply(observer, addon.binding, arguments_);
      callCompleted = true;
      return rawObservation;
    },
  });
  const admittedObservation = createServiceManagementStatusAdapter(monitoredBinding).observe();
  if (
    !callCompleted
    || argumentCount !== 0
    || !serviceManagementStatusObservations.includes(
      rawObservation as ServiceManagementStatusObservation,
    )
  ) {
    return nativeStatusCallFailure;
  }
  return admittedObservation;
}

function emitResult(observation: ProofObservation): void {
  if (emitted) {
    app.exit(1);
    return;
  }
  emitted = true;
  process.stdout.write(`${resultPrefix}${observation}\n`);
  app.exit(0);
}

void app.whenReady().then(
  () => emitResult(observeFixedStatusAddon()),
  () => emitResult(electronReadinessFailure),
);
