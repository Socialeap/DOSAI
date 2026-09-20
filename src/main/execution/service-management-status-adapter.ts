export const serviceManagementStatusObservations = Object.freeze([
  'NOT_REGISTERED',
  'ENABLED',
  'REQUIRES_APPROVAL',
  'NOT_FOUND',
] as const);

export type ServiceManagementStatusObservation =
  (typeof serviceManagementStatusObservations)[number];

export type NativeServiceManagementStatusBinding = Readonly<{
  readonly observe: () => unknown;
}>;

export type ServiceManagementStatusAdapter = Readonly<{
  readonly observe: () => ServiceManagementStatusObservation;
}>;

const failureObservation: ServiceManagementStatusObservation = 'NOT_FOUND';

function admitObservation(candidate: unknown): ServiceManagementStatusObservation {
  switch (candidate) {
    case 'NOT_REGISTERED':
    case 'ENABLED':
    case 'REQUIRES_APPROVAL':
    case 'NOT_FOUND':
      return candidate;
    default:
      return failureObservation;
  }
}

function getObserver(candidate: unknown): ((...arguments_: never[]) => unknown) | undefined {
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
    return descriptor.value as (...arguments_: never[]) => unknown;
  } catch {
    return undefined;
  }
}

export function createServiceManagementStatusAdapter(
  bindingCandidate: unknown,
): ServiceManagementStatusAdapter {
  const observer = getObserver(bindingCandidate);
  return Object.freeze({
    observe(): ServiceManagementStatusObservation {
      if (observer === undefined) return failureObservation;
      try {
        return admitObservation(Reflect.apply(observer, bindingCandidate, []));
      } catch {
        return failureObservation;
      }
    },
  });
}
