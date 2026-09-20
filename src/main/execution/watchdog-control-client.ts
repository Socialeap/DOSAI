import {
  admitWatchdogControlResponse,
  admitWatchdogControlSession,
  admitWatchdogControlRequest,
  watchdogFrameBytes,
  type WatchdogControlRequest,
  type WatchdogControlResponse,
  type WatchdogControlSession,
} from '../../contracts/p3/watchdog-control.ts';

export type WatchdogControlTransport = Readonly<{
  readonly exchange: (request: WatchdogControlRequest) => Promise<unknown>;
}>;

export type WatchdogRequestIdSource = () => string;

type WatchdogOperation =
  | Readonly<{ readonly operation: 'INSPECT'; readonly supervisor_generation: string }>
  | Readonly<{
    readonly operation: 'STOP_ONE';
    readonly supervisor_generation: string;
    readonly capsule_id: string;
    readonly reason: 'OWNER_REQUEST' | 'WATCHDOG_TIMEOUT' | 'EMERGENCY_STOP';
  }>
  | Readonly<{
    readonly operation: 'STOP_ALL';
    readonly supervisor_generation: string;
    readonly reason: 'OWNER_REQUEST' | 'COORDINATOR_DISCONNECT' | 'EMERGENCY_STOP';
  }>;

type PendingRequest = Readonly<{
  readonly operation: WatchdogOperation;
  readonly resolve: (response: WatchdogControlResponse) => void;
  readonly reject: (reason: Error) => void;
}>;

const scheduleTimeout = setTimeout;
const cancelTimeout = clearTimeout;

function admitTransport(candidate: unknown): WatchdogControlTransport {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('DOSAI_WATCHDOG_CLIENT_TRANSPORT_0001');
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('DOSAI_WATCHDOG_CLIENT_TRANSPORT_0001');
  }
  const keys = Reflect.ownKeys(candidate);
  const descriptor = Object.getOwnPropertyDescriptor(candidate, 'exchange');
  if (
    keys.length !== 1
    || keys[0] !== 'exchange'
    || descriptor === undefined
    || !descriptor.enumerable
    || !('value' in descriptor)
    || typeof descriptor.value !== 'function'
  ) {
    throw new TypeError('DOSAI_WATCHDOG_CLIENT_TRANSPORT_0001');
  }
  return Object.freeze({ exchange: descriptor.value as WatchdogControlTransport['exchange'] });
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = scheduleTimeout(
      () => reject(new Error('DOSAI_WATCHDOG_CLIENT_TIMEOUT_0001')),
      timeoutMs,
    );
    operation.then(
      (value) => {
        cancelTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        cancelTimeout(timeout);
        reject(error);
      },
    );
  });
}

export class WatchdogControlClient {
  private readonly session: WatchdogControlSession;
  private readonly transport: WatchdogControlTransport;
  private readonly requestIdSource: WatchdogRequestIdSource;
  private nextSequence = 1n;
  private readonly requestIds = new Set<string>();
  private readonly ordinaryQueue: PendingRequest[] = [];
  private readonly emergencyQueue: PendingRequest[] = [];
  private active: PendingRequest | undefined = undefined;
  private open = true;

  constructor(
    sessionCandidate: unknown,
    transportCandidate: unknown,
    requestIdSource: WatchdogRequestIdSource,
  ) {
    this.session = admitWatchdogControlSession(sessionCandidate);
    this.transport = admitTransport(transportCandidate);
    if (typeof requestIdSource !== 'function') {
      throw new TypeError('DOSAI_WATCHDOG_CLIENT_REQUEST_ID_0001');
    }
    this.requestIdSource = requestIdSource;
  }

  inspect(supervisorGeneration: string): Promise<WatchdogControlResponse> {
    return this.send({ operation: 'INSPECT', supervisor_generation: supervisorGeneration });
  }

  stopOne(
    supervisorGeneration: string,
    capsuleId: string,
    reason: 'OWNER_REQUEST' | 'WATCHDOG_TIMEOUT' | 'EMERGENCY_STOP',
  ): Promise<WatchdogControlResponse> {
    return this.send({
      operation: 'STOP_ONE',
      supervisor_generation: supervisorGeneration,
      capsule_id: capsuleId,
      reason,
    });
  }

  stopAll(
    supervisorGeneration: string,
    reason: 'OWNER_REQUEST' | 'COORDINATOR_DISCONNECT' | 'EMERGENCY_STOP',
  ): Promise<WatchdogControlResponse> {
    return this.send({ operation: 'STOP_ALL', supervisor_generation: supervisorGeneration, reason });
  }

  close(): void {
    this.closeWith(new Error('DOSAI_WATCHDOG_CLIENT_CLOSED_0001'));
  }

  private send(operation: WatchdogOperation): Promise<WatchdogControlResponse> {
    if (!this.open) {
      return Promise.reject(new Error('DOSAI_WATCHDOG_CLIENT_CLOSED_0001'));
    }
    if (this.requestIds.size + this.ordinaryQueue.length + this.emergencyQueue.length
      >= this.session.limits.max_cached_responses) {
      const error = new Error('DOSAI_WATCHDOG_CLIENT_SESSION_LIMIT_0001');
      this.closeWith(error);
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      const pending = Object.freeze({ operation, resolve, reject });
      if (this.isEmergencyStopAll(operation)) {
        this.emergencyQueue.push(pending);
      } else {
        this.ordinaryQueue.push(pending);
      }
      this.dispatchNext();
    });
  }

  private dispatchNext(): void {
    if (!this.open || this.active !== undefined) {
      return;
    }
    const pending = this.emergencyQueue.shift() ?? this.ordinaryQueue.shift();
    if (pending === undefined) {
      return;
    }
    this.active = pending;
    void this.exchange(pending);
  }

  private async exchange(pending: PendingRequest): Promise<void> {
    try {
      const requestId = this.requestIdSource();
      if (this.requestIds.has(requestId)) {
        throw new Error('DOSAI_WATCHDOG_CLIENT_REQUEST_ID_0001');
      }
      const request = admitWatchdogControlRequest({
        schema_id: 'urn:dosai:schema:watchdog-control-request:1',
        schema_version: 1,
        request_id: requestId,
        session_id: this.session.session_id,
        service_boot_id: this.session.service_boot_id,
        service_generation: this.session.service_generation,
        sequence: this.nextSequence.toString(),
        ...pending.operation,
        authorization: 'NO_EFFECT_TEST_ONLY',
      });
      if (watchdogFrameBytes(request) > this.session.limits.max_frame_bytes) {
        throw new Error('DOSAI_WATCHDOG_CLIENT_FRAME_0001');
      }
      this.requestIds.add(request.request_id);
      this.nextSequence += 1n;
      const response = admitWatchdogControlResponse(await withTimeout(
        this.transport.exchange(request),
        this.session.limits.response_timeout_ms,
      ));
      if (
        response.request_id !== request.request_id
        || response.session_id !== request.session_id
        || response.service_boot_id !== request.service_boot_id
        || response.service_generation !== request.service_generation
        || response.sequence !== request.sequence
        || response.operation !== request.operation
        || watchdogFrameBytes(response) > this.session.limits.max_frame_bytes
      ) {
        throw new Error('DOSAI_WATCHDOG_CLIENT_BINDING_0001');
      }
      if (!this.open || this.active !== pending) {
        return;
      }
      this.active = undefined;
      pending.resolve(response);
      this.dispatchNext();
    } catch (error) {
      if (this.active === pending) {
        this.closeWith(error instanceof Error ? error : new Error('DOSAI_WATCHDOG_CLIENT_CLOSED_0001'));
      }
    }
  }

  private isEmergencyStopAll(operation: WatchdogOperation): boolean {
    return operation.operation === 'STOP_ALL' && operation.reason === 'EMERGENCY_STOP';
  }

  private closeWith(error: Error): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    const active = this.active;
    this.active = undefined;
    active?.reject(error);
    for (const pending of this.emergencyQueue.splice(0)) {
      pending.reject(error);
    }
    for (const pending of this.ordinaryQueue.splice(0)) {
      pending.reject(error);
    }
  }
}
