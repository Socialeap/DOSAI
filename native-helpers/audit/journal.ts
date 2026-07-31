import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  lstatSync,
  openSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  AUDIT_ALGORITHM_SUITE,
  AUDIT_DURABILITY_PROFILE,
  AUDIT_SCHEMA_IDS,
  type AuditAcknowledgement,
  type AuditEvent,
  type AuditEventProposal,
  type AuditProvenance,
  type Digest,
  type JsonValue,
  admitAuditAcknowledgement,
  admitAuditEvent,
  admitAuditEventProposal,
  canonicalAuditJson,
} from './contracts.ts';

const APPLICATION_ID = 0x444f5341;
const DATABASE_SCHEMA_VERSION = 1;
const EVENT_HASH_DOMAIN = 'DOSAI:AUDIT_EVENT:V1\0';
const REQUEST_HASH_DOMAIN = 'DOSAI:AUDIT_REQUEST:V1\0';
const ZERO_HASH = '0'.repeat(64);
const maximumAcknowledgementBytes = 8_192;
const maximumEventBytes = 16_384;
const maximumSourceCount = 32;
const maximumPageCountLimit = 1_048_576;
const producerPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const sequencePattern = /^(0|[1-9][0-9]{0,31})$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const journalStateSql = `CREATE TABLE journal_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  algorithm_suite TEXT NOT NULL CHECK (algorithm_suite = 'DOSAI-JOURNAL-SHA256-JCS-V1'),
  storage_profile TEXT NOT NULL CHECK (storage_profile = 'SQLITE_DELETE_EXTRA_FULLFSYNC'),
  journal_id TEXT NOT NULL,
  journal_epoch_id TEXT NOT NULL,
  head_sequence INTEGER NOT NULL CHECK (head_sequence >= 0),
  head_hash TEXT NOT NULL CHECK (length(head_hash) = 64),
  latest_writer_epoch_id TEXT,
  latest_boot_id TEXT
) STRICT`;

const eventsSql = `CREATE TABLE events (
  sequence INTEGER PRIMARY KEY CHECK (sequence > 0),
  request_message_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
  event_hash TEXT NOT NULL CHECK (length(event_hash) = 64),
  previous_event_hash TEXT NOT NULL CHECK (length(previous_event_hash) = 64),
  event_json TEXT NOT NULL,
  acknowledgement_json TEXT NOT NULL
) STRICT`;

const schemaSql = Object.freeze([
  journalStateSql,
  eventsSql,
  'CREATE UNIQUE INDEX events_request_message_id_uq ON events (request_message_id)',
  'CREATE UNIQUE INDEX events_event_hash_uq ON events (event_hash)',
]);

export type AuditJournalFailureCode =
  | 'DOSAI_AUDIT_AUTH_0001'
  | 'DOSAI_AUDIT_COMMIT_UNKNOWN_0001'
  | 'DOSAI_AUDIT_CONCURRENCY_0001'
  | 'DOSAI_AUDIT_INTEGRITY_0001'
  | 'DOSAI_AUDIT_PERSISTENCE_0001'
  | 'DOSAI_AUDIT_PRECONDITION_0001'
  | 'DOSAI_AUDIT_REPLAY_0001'
  | 'DOSAI_AUDIT_SCHEMA_0001';

export class AuditJournalFailure extends Error {
  readonly code: AuditJournalFailureCode;
  readonly assurance: 'BROKEN';

  constructor(code: AuditJournalFailureCode) {
    super(code);
    this.name = 'AuditJournalFailure';
    this.code = code;
    this.assurance = 'BROKEN';
  }
}

export type AuditSourceBinding = Readonly<{
  sourceId: string;
  sourceGeneration: string;
  provenance: AuditProvenance;
  wallClockUncertaintyMs: number;
  authenticationToken: Uint8Array;
}>;

export type JournalIdentity = Readonly<{
  journalId: string;
  journalEpochId: string;
}>;

export type OpenAuditJournalOptions = Readonly<{
  databasePath: string;
  sources: readonly AuditSourceBinding[];
  expectedIdentity?: JournalIdentity;
  maximumPageCount?: number;
}>;

export type AuditVerificationReport = Readonly<{
  assurance: 'LOCAL_DURABLE';
  journalId: string;
  journalEpochId: string;
  verifiedThroughSequence: string;
  headHash: Digest;
  eventCount: number;
  writerEpochCount: number;
  limitations: readonly ['UNSIGNED', 'UNANCHORED', 'LOCAL_ROLLBACK_NOT_DETECTABLE'];
}>;

export type AuditDurabilityStatus = Readonly<{
  journalMode: 'DELETE';
  synchronous: 'EXTRA';
  fullFsync: true;
  checkpointFullFsync: true;
  lockingMode: 'EXCLUSIVE';
}>;

type SourceRecord = Readonly<{
  sourceId: string;
  sourceGeneration: string;
  provenance: AuditProvenance;
  wallClockUncertaintyMs: number;
  authenticationToken: Uint8Array;
}>;

type StateRow = Readonly<{
  journalId: string;
  journalEpochId: string;
  headSequence: bigint;
  headHash: string;
  latestWriterEpochId: string | null;
  latestBootId: string | null;
}>;

type VerifiedState = Readonly<{
  state: StateRow;
  report: AuditVerificationReport;
}>;

function fail(code: AuditJournalFailureCode): never {
  throw new AuditJournalFailure(code);
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function databaseFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('database is locked') || message.includes('database table is locked')) {
    return fail('DOSAI_AUDIT_CONCURRENCY_0001');
  }
  return fail('DOSAI_AUDIT_PERSISTENCE_0001');
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : fail('DOSAI_AUDIT_INTEGRITY_0001');
}

function stringCell(row: Record<string, unknown>, key: string): string {
  return typeof row[key] === 'string' ? row[key] as string : fail('DOSAI_AUDIT_INTEGRITY_0001');
}

function nullableStringCell(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return value === null || typeof value === 'string' ? value : fail('DOSAI_AUDIT_INTEGRITY_0001');
}

function bigintCell(row: Record<string, unknown>, key: string): bigint {
  return typeof row[key] === 'bigint' ? row[key] as bigint : fail('DOSAI_AUDIT_INTEGRITY_0001');
}

function scalarPragma(database: DatabaseSync, sql: string): unknown {
  const row = asRecord(database.prepare(sql).get());
  const values = Object.values(row);
  return values.length === 1 ? values[0] : fail('DOSAI_AUDIT_PERSISTENCE_0001');
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim().toUpperCase();
}

function sha256(domain: string, value: string): string {
  return createHash('sha256').update(domain, 'utf8').update(value, 'utf8').digest('hex');
}

function digest(value: string): Digest {
  return Object.freeze({ algorithm: 'SHA-256', value });
}

function exactTimestamp(): string {
  return new Date().toISOString();
}

function assertExistingDatabasePath(databasePath: string): void {
  if (!isAbsolute(databasePath) || resolve(databasePath) !== databasePath || databasePath.includes('\0')) {
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }
  const parent = dirname(databasePath);
  const currentUid = process.getuid?.();
  try {
    const parentStats = lstatSync(parent);
    const databaseStats = lstatSync(databasePath);
    if (
      !parentStats.isDirectory() ||
      parentStats.isSymbolicLink() ||
      (parentStats.mode & 0o077) !== 0 ||
      (currentUid !== undefined && parentStats.uid !== currentUid) ||
      realpathSync(parent) !== parent ||
      !databaseStats.isFile() ||
      databaseStats.isSymbolicLink() ||
      databaseStats.nlink !== 1 ||
      (databaseStats.mode & 0o077) !== 0 ||
      (currentUid !== undefined && databaseStats.uid !== currentUid) ||
      realpathSync(databasePath) !== databasePath
    ) {
      return fail('DOSAI_AUDIT_PRECONDITION_0001');
    }
  } catch (error) {
    if (error instanceof AuditJournalFailure) {
      throw error;
    }
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }
}

function prepareDatabasePath(databasePath: string): boolean {
  if (!isAbsolute(databasePath) || resolve(databasePath) !== databasePath || databasePath.includes('\0')) {
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }
  const parent = dirname(databasePath);
  let parentStats;
  try {
    parentStats = lstatSync(parent);
  } catch {
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }
  const currentUid = process.getuid?.();
  if (
    !parentStats.isDirectory() ||
    parentStats.isSymbolicLink() ||
    (parentStats.mode & 0o077) !== 0 ||
    (currentUid !== undefined && parentStats.uid !== currentUid) ||
    realpathSync(parent) !== parent
  ) {
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }

  try {
    const databaseStats = lstatSync(databasePath);
    if (
      !databaseStats.isFile() ||
      databaseStats.isSymbolicLink() ||
      databaseStats.nlink !== 1 ||
      (databaseStats.mode & 0o077) !== 0 ||
      (currentUid !== undefined && databaseStats.uid !== currentUid)
    ) {
      return fail('DOSAI_AUDIT_PRECONDITION_0001');
    }
    return false;
  } catch (error) {
    if (nodeErrorCode(error) !== 'ENOENT') {
      return fail('DOSAI_AUDIT_PRECONDITION_0001');
    }
  }

  try {
    const descriptor = openSync(
      databasePath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
      0o600,
    );
    closeSync(descriptor);
    chmodSync(databasePath, 0o600);
    return true;
  } catch {
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }
}

function configureDatabase(database: DatabaseSync): void {
  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA trusted_schema = OFF');
    database.exec('PRAGMA temp_store = MEMORY');
    database.exec('PRAGMA busy_timeout = 0');
    database.exec('PRAGMA secure_delete = ON');
    if (String(scalarPragma(database, 'PRAGMA journal_mode = DELETE')).toLowerCase() !== 'delete') {
      fail('DOSAI_AUDIT_PERSISTENCE_0001');
    }
    database.exec('PRAGMA synchronous = EXTRA');
    database.exec('PRAGMA fullfsync = ON');
    database.exec('PRAGMA checkpoint_fullfsync = ON');
    if (
      scalarPragma(database, 'PRAGMA synchronous') !== 3n ||
      scalarPragma(database, 'PRAGMA fullfsync') !== 1n ||
      scalarPragma(database, 'PRAGMA checkpoint_fullfsync') !== 1n
    ) {
      fail('DOSAI_AUDIT_PERSISTENCE_0001');
    }
    if (String(scalarPragma(database, 'PRAGMA locking_mode = EXCLUSIVE')).toLowerCase() !== 'exclusive') {
      fail('DOSAI_AUDIT_PERSISTENCE_0001');
    }
    database.exec('BEGIN EXCLUSIVE');
    database.exec('COMMIT');
  } catch (error) {
    if (error instanceof AuditJournalFailure) {
      throw error;
    }
    databaseFailure(error);
  }
}

function schemaObjects(database: DatabaseSync): readonly Record<string, unknown>[] {
  return database.prepare(
    "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name LIMIT 16",
  ).all().map(asRecord);
}

function initializeDatabase(database: DatabaseSync): JournalIdentity {
  const journalId = randomUUID();
  const journalEpochId = randomUUID();
  try {
    database.exec('BEGIN IMMEDIATE');
    for (const sql of schemaSql) {
      database.exec(sql);
    }
    database.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
    database.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION}`);
    database.prepare(
      `INSERT INTO journal_state (
        singleton, schema_version, algorithm_suite, storage_profile,
        journal_id, journal_epoch_id, head_sequence, head_hash,
        latest_writer_epoch_id, latest_boot_id
      ) VALUES (1, 1, ?, ?, ?, ?, 0, ?, NULL, NULL)`,
    ).run(AUDIT_ALGORITHM_SUITE, AUDIT_DURABILITY_PROFILE, journalId, journalEpochId, ZERO_HASH);
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // The original initialization failure remains authoritative.
    }
    databaseFailure(error);
  }
  return Object.freeze({ journalId, journalEpochId });
}

function assertSchema(database: DatabaseSync): void {
  const objects = schemaObjects(database);
  const expected = schemaSql.map(normalizeSql).sort();
  const actual = objects.map((row) => {
    const sql = row.sql;
    return typeof sql === 'string' ? normalizeSql(sql) : fail('DOSAI_AUDIT_INTEGRITY_0001');
  }).sort();
  if (actual.length !== expected.length || actual.some((sql, index) => sql !== expected[index])) {
    fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  if (
    scalarPragma(database, 'PRAGMA application_id') !== BigInt(APPLICATION_ID) ||
    scalarPragma(database, 'PRAGMA user_version') !== BigInt(DATABASE_SCHEMA_VERSION) ||
    scalarPragma(database, 'PRAGMA integrity_check') !== 'ok'
  ) {
    fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
}

function readState(database: DatabaseSync): StateRow {
  const rows = database.prepare('SELECT * FROM journal_state').all();
  if (rows.length !== 1) {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  const row = asRecord(rows[0]);
  if (
    bigintCell(row, 'singleton') !== 1n ||
    bigintCell(row, 'schema_version') !== 1n ||
    stringCell(row, 'algorithm_suite') !== AUDIT_ALGORITHM_SUITE ||
    stringCell(row, 'storage_profile') !== AUDIT_DURABILITY_PROFILE
  ) {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  const state = {
    journalId: stringCell(row, 'journal_id'),
    journalEpochId: stringCell(row, 'journal_epoch_id'),
    headSequence: bigintCell(row, 'head_sequence'),
    headHash: stringCell(row, 'head_hash'),
    latestWriterEpochId: nullableStringCell(row, 'latest_writer_epoch_id'),
    latestBootId: nullableStringCell(row, 'latest_boot_id'),
  };
  if (
    !uuidPattern.test(state.journalId) ||
    !uuidPattern.test(state.journalEpochId) ||
    !/^[0-9a-f]{64}$/.test(state.headHash)
  ) {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  return Object.freeze(state);
}

function parseCanonicalEvent(text: string): AuditEvent {
  if (Buffer.byteLength(text, 'utf8') > maximumEventBytes) {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  let event: AuditEvent;
  try {
    event = admitAuditEvent(candidate);
  } catch {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  if (canonicalAuditJson(event as unknown as JsonValue) !== text) {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  return event;
}

function parseCanonicalAcknowledgement(text: string): AuditAcknowledgement {
  if (Buffer.byteLength(text, 'utf8') > maximumAcknowledgementBytes) {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  let acknowledgement: AuditAcknowledgement;
  try {
    acknowledgement = admitAuditAcknowledgement(candidate);
  } catch {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  if (canonicalAuditJson(acknowledgement as unknown as JsonValue) !== text) {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }
  return acknowledgement;
}

function expectedRequestDigest(event: AuditEvent): string {
  if (event.event_kind === 'WRITER_EPOCH_STARTED') {
    return sha256(REQUEST_HASH_DOMAIN, canonicalAuditJson({
      event_kind: event.event_kind,
      previous_writer_epoch_id: event.payload.previous_writer_epoch_id as JsonValue,
      request_message_id: event.request_message_id,
    }));
  }
  return sha256(REQUEST_HASH_DOMAIN, canonicalAuditJson({
    schema_id: AUDIT_SCHEMA_IDS.proposal,
    schema_version: 1,
    message_id: event.request_message_id,
    created_at: event.observed_at,
    producer: event.source.source_id,
    producer_generation: event.source.source_generation,
    trace_id: event.trace_id,
    data_class: 'D1',
    event_kind: event.event_kind,
    payload: event.payload,
  }));
}

function verifyOpenDatabase(database: DatabaseSync, expectedIdentity: JournalIdentity): VerifiedState {
  assertSchema(database);
  const state = readState(database);
  if (
    state.journalId !== expectedIdentity.journalId ||
    state.journalEpochId !== expectedIdentity.journalEpochId
  ) {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }

  const rows = database.prepare('SELECT * FROM events ORDER BY sequence').iterate();
  let previousHash = ZERO_HASH;
  let previousWriterEpochId: string | null = null;
  let currentWriterEpochId: string | null = null;
  let currentBootId: string | null = null;
  let writerEpochCount = 0;
  let previousMonotonicMs = -1n;
  const acknowledgementMessageIds = new Set<string>();
  const bootIds = new Set<string>();
  const eventMessageIds = new Set<string>();
  const writerEpochIds = new Set<string>();

  let eventCount = 0;
  for (const candidateRow of rows) {
    eventCount += 1;
    if (!Number.isSafeInteger(eventCount)) {
      return fail('DOSAI_AUDIT_INTEGRITY_0001');
    }
    const row = asRecord(candidateRow);
    const expectedSequence = BigInt(eventCount);
    if (bigintCell(row, 'sequence') !== expectedSequence) {
      return fail('DOSAI_AUDIT_INTEGRITY_0001');
    }
    const eventJson = stringCell(row, 'event_json');
    const eventHash = stringCell(row, 'event_hash');
    const event = parseCanonicalEvent(eventJson);
    const acknowledgement = parseCanonicalAcknowledgement(stringCell(row, 'acknowledgement_json'));
    if (
      event.sequence !== expectedSequence.toString() ||
      event.journal_id !== state.journalId ||
      event.journal_epoch_id !== state.journalEpochId ||
      event.previous_event_hash.value !== previousHash ||
      eventHash !== sha256(EVENT_HASH_DOMAIN, eventJson) ||
      stringCell(row, 'previous_event_hash') !== previousHash ||
      stringCell(row, 'request_message_id') !== event.request_message_id ||
      stringCell(row, 'request_digest') !== event.request_digest.value ||
      stringCell(row, 'source_id') !== event.source.source_id ||
      expectedRequestDigest(event) !== event.request_digest.value ||
      acknowledgement.request_message_id !== event.request_message_id ||
      acknowledgement.journal_id !== state.journalId ||
      acknowledgement.journal_epoch_id !== state.journalEpochId ||
      acknowledgement.sequence !== event.sequence ||
      acknowledgement.event_hash.value !== eventHash ||
      acknowledgement.message_id !== event.acknowledgement_message_id ||
      acknowledgement.trace_id !== event.trace_id ||
      acknowledgement.created_at !== event.created_at ||
      acknowledgement.producer_generation !== event.producer_generation ||
      eventMessageIds.has(event.message_id) ||
      acknowledgementMessageIds.has(acknowledgement.message_id)
    ) {
      return fail('DOSAI_AUDIT_INTEGRITY_0001');
    }
    eventMessageIds.add(event.message_id);
    acknowledgementMessageIds.add(acknowledgement.message_id);

    if (event.writer_epoch_id !== currentWriterEpochId) {
      if (
        event.event_kind !== 'WRITER_EPOCH_STARTED' ||
        (event.payload.previous_writer_epoch_id as JsonValue) !== previousWriterEpochId ||
        writerEpochIds.has(event.writer_epoch_id) ||
        bootIds.has(event.boot_id)
      ) {
        return fail('DOSAI_AUDIT_INTEGRITY_0001');
      }
      writerEpochIds.add(event.writer_epoch_id);
      bootIds.add(event.boot_id);
      previousWriterEpochId = event.writer_epoch_id;
      currentWriterEpochId = event.writer_epoch_id;
      currentBootId = event.boot_id;
      previousMonotonicMs = -1n;
      writerEpochCount += 1;
    } else if (event.event_kind === 'WRITER_EPOCH_STARTED' || event.boot_id !== currentBootId) {
      return fail('DOSAI_AUDIT_INTEGRITY_0001');
    }
    const monotonicMs = BigInt(event.monotonic_ms);
    if (monotonicMs < previousMonotonicMs) {
      return fail('DOSAI_AUDIT_INTEGRITY_0001');
    }
    previousMonotonicMs = monotonicMs;
    previousHash = eventHash;
  }

  if (
    state.headSequence !== BigInt(eventCount) ||
    state.headHash !== previousHash ||
    state.latestWriterEpochId !== currentWriterEpochId ||
    state.latestBootId !== currentBootId
  ) {
    return fail('DOSAI_AUDIT_INTEGRITY_0001');
  }

  const report: AuditVerificationReport = Object.freeze({
    assurance: 'LOCAL_DURABLE',
    journalId: state.journalId,
    journalEpochId: state.journalEpochId,
    verifiedThroughSequence: state.headSequence.toString(),
    headHash: digest(state.headHash),
    eventCount,
    writerEpochCount,
    limitations: Object.freeze(['UNSIGNED', 'UNANCHORED', 'LOCAL_ROLLBACK_NOT_DETECTABLE'] as const),
  });
  return Object.freeze({ state, report });
}

function validateExpectedIdentity(identity: JournalIdentity): JournalIdentity {
  if (!uuidPattern.test(identity.journalId) || !uuidPattern.test(identity.journalEpochId)) {
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }
  return Object.freeze({ journalId: identity.journalId, journalEpochId: identity.journalEpochId });
}

function clearSourceTokens(records: ReadonlyMap<string, SourceRecord>): void {
  for (const record of records.values()) {
    record.authenticationToken.fill(0);
  }
}

function cloneSources(sources: readonly AuditSourceBinding[]): Map<string, SourceRecord> {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > maximumSourceCount) {
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }
  const records = new Map<string, SourceRecord>();
  for (const source of sources) {
    if (
      typeof source !== 'object' ||
      source === null ||
      !producerPattern.test(source.sourceId) ||
      source.sourceId.length > 96 ||
      source.sourceId === 'dosai.audit-writer' ||
      !sequencePattern.test(source.sourceGeneration) ||
      ![
        'AGENT_CLAIM',
        'SUPERVISOR_OBSERVATION',
        'OWNER_APPROVAL',
        'REMOTE_PROVIDER_RECEIPT',
        'DETERMINISTIC_DERIVATION',
        'RECOVERY_INFERENCE',
      ].includes(source.provenance) ||
      !Number.isSafeInteger(source.wallClockUncertaintyMs) ||
      source.wallClockUncertaintyMs < 0 ||
      source.wallClockUncertaintyMs > 86_400_000 ||
      Object.getPrototypeOf(source.authenticationToken) !== Uint8Array.prototype ||
      !(source.authenticationToken.buffer instanceof ArrayBuffer) ||
      source.authenticationToken.byteLength !== 32 ||
      records.has(source.sourceId)
    ) {
      clearSourceTokens(records);
      return fail('DOSAI_AUDIT_PRECONDITION_0001');
    }
    const authenticationToken = new Uint8Array(source.authenticationToken);
    if (
      authenticationToken.every((byte) => byte === 0) ||
      [...records.values()].some((record) =>
        timingSafeEqual(record.authenticationToken, authenticationToken),
      )
    ) {
      authenticationToken.fill(0);
      clearSourceTokens(records);
      return fail('DOSAI_AUDIT_PRECONDITION_0001');
    }
    records.set(source.sourceId, Object.freeze({
      sourceId: source.sourceId,
      sourceGeneration: source.sourceGeneration,
      provenance: source.provenance,
      wallClockUncertaintyMs: source.wallClockUncertaintyMs,
      authenticationToken,
    }));
  }
  return records;
}

function authenticate(
  sources: ReadonlyMap<string, SourceRecord>,
  sourceId: string,
  authenticationToken: Uint8Array,
): SourceRecord {
  const source = sources.get(sourceId);
  if (
    source === undefined ||
    Object.getPrototypeOf(authenticationToken) !== Uint8Array.prototype ||
    !(authenticationToken.buffer instanceof ArrayBuffer) ||
    authenticationToken.byteLength !== 32 ||
    !timingSafeEqual(source.authenticationToken, authenticationToken)
  ) {
    return fail('DOSAI_AUDIT_AUTH_0001');
  }
  return source;
}

function applyMaximumPageCount(database: DatabaseSync, maximumPageCount: number | undefined): void {
  if (maximumPageCount === undefined) {
    return;
  }
  if (
    !Number.isSafeInteger(maximumPageCount) ||
    maximumPageCount < 1 ||
    maximumPageCount > maximumPageCountLimit
  ) {
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }
  const actual = scalarPragma(database, `PRAGMA max_page_count = ${maximumPageCount}`);
  if (actual !== BigInt(maximumPageCount)) {
    return fail('DOSAI_AUDIT_PRECONDITION_0001');
  }
}

class AuditJournalWriter {
  readonly identity: JournalIdentity;
  readonly bootId: string;
  readonly writerEpochId: string;
  readonly storageProfile = AUDIT_DURABILITY_PROFILE;

  #database: DatabaseSync | null;
  #sources: Map<string, SourceRecord>;
  #headSequence: bigint;
  #headHash: string;
  #writerGeneration: string;
  #monotonicOrigin: bigint;
  #assurance: 'LOCAL_DURABLE' | 'BROKEN' = 'LOCAL_DURABLE';

  constructor(
    database: DatabaseSync,
    sources: Map<string, SourceRecord>,
    identity: JournalIdentity,
    state: StateRow,
    writerGeneration: string,
    previousWriterEpochId: string | null,
  ) {
    this.#database = database;
    this.#sources = sources;
    this.identity = identity;
    this.bootId = randomUUID();
    this.writerEpochId = randomUUID();
    this.#headSequence = state.headSequence;
    this.#headHash = state.headHash;
    this.#writerGeneration = writerGeneration;
    this.#monotonicOrigin = process.hrtime.bigint();
    Object.freeze(this.identity);
    this.#appendWriterEpoch(previousWriterEpochId);
  }

  get assurance(): 'LOCAL_DURABLE' | 'BROKEN' {
    return this.#assurance;
  }

  get headSequence(): string {
    return this.#headSequence.toString();
  }

  get durabilityStatus(): AuditDurabilityStatus {
    const database = this.#activeDatabase();
    if (
      String(scalarPragma(database, 'PRAGMA journal_mode')).toLowerCase() !== 'delete' ||
      scalarPragma(database, 'PRAGMA synchronous') !== 3n ||
      scalarPragma(database, 'PRAGMA fullfsync') !== 1n ||
      scalarPragma(database, 'PRAGMA checkpoint_fullfsync') !== 1n ||
      String(scalarPragma(database, 'PRAGMA locking_mode')).toLowerCase() !== 'exclusive'
    ) {
      this.#markBroken();
      return fail('DOSAI_AUDIT_PERSISTENCE_0001');
    }
    return Object.freeze({
      journalMode: 'DELETE',
      synchronous: 'EXTRA',
      fullFsync: true,
      checkpointFullFsync: true,
      lockingMode: 'EXCLUSIVE',
    });
  }

  append(
    sourceId: string,
    authenticationToken: Uint8Array,
    proposalCandidate: unknown,
  ): AuditAcknowledgement {
    const database = this.#activeDatabase();
    const source = authenticate(this.#sources, sourceId, authenticationToken);
    const proposal = admitAuditEventProposal(proposalCandidate);
    if (
      proposal.producer !== source.sourceId ||
      proposal.producer_generation !== source.sourceGeneration
    ) {
      return fail('DOSAI_AUDIT_AUTH_0001');
    }
    const proposalJson = canonicalAuditJson(proposal as unknown as JsonValue);
    const requestDigest = sha256(REQUEST_HASH_DOMAIN, proposalJson);
    return this.#appendRecord(database, source, proposal, requestDigest);
  }

  lookupAcknowledgement(
    sourceId: string,
    authenticationToken: Uint8Array,
    requestMessageId: string,
  ): AuditAcknowledgement | null {
    const database = this.#activeDatabase();
    const source = authenticate(this.#sources, sourceId, authenticationToken);
    if (!uuidPattern.test(requestMessageId)) {
      return fail('DOSAI_AUDIT_SCHEMA_0001');
    }
    const row = database.prepare(
      'SELECT source_id, acknowledgement_json FROM events WHERE request_message_id = ?',
    ).get(requestMessageId);
    if (row === undefined) {
      return null;
    }
    const record = asRecord(row);
    if (stringCell(record, 'source_id') !== source.sourceId) {
      return fail('DOSAI_AUDIT_AUTH_0001');
    }
    return parseCanonicalAcknowledgement(stringCell(record, 'acknowledgement_json'));
  }

  close(): void {
    if (this.#database === null) {
      return;
    }
    for (const source of this.#sources.values()) {
      source.authenticationToken.fill(0);
    }
    this.#sources.clear();
    try {
      this.#database.close();
    } finally {
      this.#database = null;
    }
  }

  #appendWriterEpoch(previousWriterEpochId: string | null): void {
    const database = this.#activeDatabase();
    const requestMessageId = randomUUID();
    const traceId = randomUUID();
    const observedAt = exactTimestamp();
    const marker = canonicalAuditJson({
      event_kind: 'WRITER_EPOCH_STARTED',
      previous_writer_epoch_id: previousWriterEpochId,
      request_message_id: requestMessageId,
    });
    const source: SourceRecord = Object.freeze({
      sourceId: 'dosai.audit-writer',
      sourceGeneration: this.#writerGeneration,
      provenance: 'SUPERVISOR_OBSERVATION',
      wallClockUncertaintyMs: 0,
      authenticationToken: new Uint8Array(32),
    });
    const proposal = Object.freeze({
      message_id: requestMessageId,
      trace_id: traceId,
      created_at: observedAt,
      event_kind: 'WRITER_EPOCH_STARTED' as const,
      payload: Object.freeze({ previous_writer_epoch_id: previousWriterEpochId }),
    });
    this.#appendRecord(database, source, proposal, sha256(REQUEST_HASH_DOMAIN, marker));
    source.authenticationToken.fill(0);
  }

  #activeDatabase(): DatabaseSync {
    if (this.#database === null || this.#assurance !== 'LOCAL_DURABLE') {
      return fail('DOSAI_AUDIT_PERSISTENCE_0001');
    }
    return this.#database;
  }

  #markBroken(): void {
    this.#assurance = 'BROKEN';
    this.close();
  }

  #appendRecord(
    database: DatabaseSync,
    source: SourceRecord,
    proposal: Pick<AuditEventProposal, 'message_id' | 'trace_id' | 'created_at' | 'event_kind' | 'payload'> | Readonly<{
      message_id: string;
      trace_id: string;
      created_at: string;
      event_kind: 'WRITER_EPOCH_STARTED';
      payload: Readonly<{ previous_writer_epoch_id: string | null }>;
    }>,
    requestDigest: string,
  ): AuditAcknowledgement {
    let transactionActive = false;
    let commitStarted = false;
    try {
      database.exec('BEGIN IMMEDIATE');
      transactionActive = true;
      const existing = database.prepare(
        'SELECT source_id, request_digest, acknowledgement_json FROM events WHERE request_message_id = ?',
      ).get(proposal.message_id);
      if (existing !== undefined) {
        const row = asRecord(existing);
        if (
          stringCell(row, 'source_id') !== source.sourceId ||
          stringCell(row, 'request_digest') !== requestDigest
        ) {
          database.exec('ROLLBACK');
          transactionActive = false;
          return fail('DOSAI_AUDIT_REPLAY_0001');
        }
        const acknowledgement = parseCanonicalAcknowledgement(stringCell(row, 'acknowledgement_json'));
        database.exec('ROLLBACK');
        transactionActive = false;
        return acknowledgement;
      }

      const sequence = this.#headSequence + 1n;
      if (sequence > BigInt(Number.MAX_SAFE_INTEGER)) {
        return fail('DOSAI_AUDIT_PERSISTENCE_0001');
      }
      const createdAt = exactTimestamp();
      const acknowledgementMessageId = randomUUID();
      const event = admitAuditEvent({
        schema_id: AUDIT_SCHEMA_IDS.event,
        schema_version: 1,
        message_id: randomUUID(),
        created_at: createdAt,
        producer: 'dosai.audit-writer',
        producer_generation: this.#writerGeneration,
        trace_id: proposal.trace_id,
        data_class: 'D1',
        algorithm_suite: AUDIT_ALGORITHM_SUITE,
        journal_id: this.identity.journalId,
        journal_epoch_id: this.identity.journalEpochId,
        boot_id: this.bootId,
        writer_epoch_id: this.writerEpochId,
        sequence: sequence.toString(),
        source: {
          source_id: source.sourceId,
          source_generation: source.sourceGeneration,
          provenance: source.provenance,
        },
        observed_at: proposal.created_at,
        wall_clock_uncertainty_ms: source.wallClockUncertaintyMs,
        monotonic_ms: ((process.hrtime.bigint() - this.#monotonicOrigin) / 1_000_000n).toString(),
        previous_event_hash: digest(this.#headHash),
        request_message_id: proposal.message_id,
        request_digest: digest(requestDigest),
        acknowledgement_message_id: acknowledgementMessageId,
        event_kind: proposal.event_kind,
        payload: proposal.payload,
      });
      const eventJson = canonicalAuditJson(event as unknown as JsonValue);
      const eventHash = sha256(EVENT_HASH_DOMAIN, eventJson);
      const acknowledgement = admitAuditAcknowledgement({
        schema_id: AUDIT_SCHEMA_IDS.acknowledgement,
        schema_version: 1,
        message_id: acknowledgementMessageId,
        created_at: createdAt,
        producer: 'dosai.audit-writer',
        producer_generation: this.#writerGeneration,
        trace_id: proposal.trace_id,
        data_class: 'D1',
        request_message_id: proposal.message_id,
        journal_id: this.identity.journalId,
        journal_epoch_id: this.identity.journalEpochId,
        sequence: sequence.toString(),
        event_hash: digest(eventHash),
        durability: AUDIT_DURABILITY_PROFILE,
        assurance: 'LOCAL_DURABLE',
      });
      const acknowledgementJson = canonicalAuditJson(acknowledgement as unknown as JsonValue);

      database.prepare(
        `INSERT INTO events (
          sequence, request_message_id, source_id, request_digest,
          event_hash, previous_event_hash, event_json, acknowledgement_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        sequence,
        proposal.message_id,
        source.sourceId,
        requestDigest,
        eventHash,
        this.#headHash,
        eventJson,
        acknowledgementJson,
      );
      database.prepare(
        `UPDATE journal_state
         SET head_sequence = ?, head_hash = ?, latest_writer_epoch_id = ?, latest_boot_id = ?
         WHERE singleton = 1 AND head_sequence = ? AND head_hash = ?`,
      ).run(
        sequence,
        eventHash,
        this.writerEpochId,
        this.bootId,
        this.#headSequence,
        this.#headHash,
      );
      if (database.prepare('SELECT changes() AS changes').get()?.changes !== 1n) {
        return fail('DOSAI_AUDIT_CONCURRENCY_0001');
      }
      commitStarted = true;
      database.exec('COMMIT');
      transactionActive = false;
      this.#headSequence = sequence;
      this.#headHash = eventHash;
      return acknowledgement;
    } catch (error) {
      if (commitStarted) {
        this.#markBroken();
        return fail('DOSAI_AUDIT_COMMIT_UNKNOWN_0001');
      }
      if (transactionActive) {
        try {
          database.exec('ROLLBACK');
        } catch {
          this.#markBroken();
          return fail('DOSAI_AUDIT_PERSISTENCE_0001');
        }
      }
      if (error instanceof AuditJournalFailure) {
        throw error;
      }
      this.#markBroken();
      return databaseFailure(error);
    }
  }
}

export function openAuditJournal(options: OpenAuditJournalOptions): AuditJournalWriter {
  const sources = cloneSources(options.sources);
  prepareDatabasePath(options.databasePath);
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(options.databasePath, {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readBigInts: true,
      timeout: 0,
    });
  } catch (error) {
    clearSourceTokens(sources);
    return databaseFailure(error);
  }
  try {
    configureDatabase(database);
    const objects = schemaObjects(database);
    let identity: JournalIdentity;
    if (objects.length === 0) {
      if (options.expectedIdentity !== undefined) {
        return fail('DOSAI_AUDIT_INTEGRITY_0001');
      }
      identity = initializeDatabase(database);
    } else {
      if (options.expectedIdentity === undefined) {
        return fail('DOSAI_AUDIT_PRECONDITION_0001');
      }
      identity = validateExpectedIdentity(options.expectedIdentity);
    }
    const verified = verifyOpenDatabase(database, identity);
    const writer = new AuditJournalWriter(
      database,
      sources,
      identity,
      verified.state,
      String(verified.report.writerEpochCount + 1),
      verified.state.latestWriterEpochId,
    );
    applyMaximumPageCount(database, options.maximumPageCount);
    return writer;
  } catch (error) {
    clearSourceTokens(sources);
    try {
      database.close();
    } catch {
      // Preserve the authoritative open or verification failure.
    }
    if (error instanceof AuditJournalFailure) {
      throw error;
    }
    databaseFailure(error);
  }
}

export function verifyAuditJournal(
  databasePath: string,
  expectedIdentity: JournalIdentity,
): AuditVerificationReport {
  assertExistingDatabasePath(databasePath);
  const identity = validateExpectedIdentity(expectedIdentity);
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(databasePath, {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readBigInts: true,
      readOnly: true,
      timeout: 0,
    });
  } catch (error) {
    return databaseFailure(error);
  }
  try {
    return verifyOpenDatabase(database, identity).report;
  } catch (error) {
    if (error instanceof AuditJournalFailure) {
      throw error;
    }
    return databaseFailure(error);
  } finally {
    database.close();
  }
}
