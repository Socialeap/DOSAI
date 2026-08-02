export const RESERVED_WORKER_KINDS = Object.freeze([
  'persistence',
  'evidence',
  'parser',
  'image',
  'compression',
] as const);

export const WORKER_OWNERSHIP = Object.freeze({
  accepts: 'BOUNDED_VALIDATED_DATA_ONLY',
  authority: 'NONE',
  implementationState: 'NOT_IMPLEMENTED',
  runtime: 'NODE_WORKER_THREADS',
  trustZone: 'Z7',
});
