# ADR 0008: Persistence, Search, Retention, and Deletion

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T12:04:27-04:00
- **Decision owner:** Repository owner
- **Related controls:** F10, F12
- **Related plan phase:** P7

## Context

SQLite, FTS shadow tables, WAL and journal files, caches, artifacts, exports, and
backups can all retain copies. Encryption does not make prohibited data safe to
store and does not implement deletion. Logical invisibility, removal from active
managed files, cryptographic inaccessibility, backup expiry, and physical media
erasure are different claims and must not share one completion state.

## Decision

### Admission and Storage Authority

- Reject secrets and prohibited personal or authentication data before any
  persistence, logging, hashing, packet, screenshot, prompt, crash-report,
  telemetry, temporary-file, or export boundary. Unknown, oversized, malformed,
  or unclassifiable input fails closed and yields only a bounded sanitized reason.
- Perform classification and field extraction in a dedicated bounded worker using
  versioned allowlists. Raw source bytes remain transient, are never written as a
  retry or failure artifact, and are destroyed after an accepted sanitized object
  or rejection result is produced.
- Give one persistence service exclusive write authority over the canonical
  metadata, payload, deletion, and search stores. Renderers, agents, repository
  processes, packet handlers, and general application code receive typed queries
  and bounded display models, never database handles, paths, arbitrary SQL,
  extensions, pragmas, attach operations, backup APIs, or filesystem access.
- Place each store in a broker-created owner-only local directory with canonical
  filesystem identity. Reject links, unexpected files, network filesystems, and
  unapproved backup or synchronization locations. Configure and inventory every
  database, WAL, shared-memory, journal, temporary, migration, and backup path.
- Persist only versioned allowlisted fields with explicit data class, purpose,
  source provenance, schema and policy versions, creation sequence, immutable
  expiry, and opaque object identity. Keep the minimal permanent audit envelope
  from ADR 0004 separate from expiring searchable payload and evidence.
- Treat schema migration as a managed-copy operation with preflighted disk reserve,
  exact source and destination manifests, crash recovery, validation, and cleanup.
  An old or failed database remains quarantined until its deletion state is known.

### Authoritative Visibility and Search

- Maintain authoritative lifecycle states such as `ACTIVE`, `HIDDEN`, `PURGING`,
  `VERIFYING`, `COMPLETE_MANAGED`, `PARTIAL`, `BLOCKED`, and `QUARANTINED`, plus an
  access generation. Every read, search, cache fill, evidence fetch, export, and
  backup operation rechecks current lifecycle and generation.
- Keep FTS5 as a narrower disposable derivative. Index only explicitly approved
  sanitized fields and never raw packets, logs, DOM, console, browser bodies,
  command output, credentials, or arbitrary evidence text.
- Route every search result through a join to current authoritative visibility;
  direct FTS results have no display authority. Revocation increments the access
  generation, cancels or invalidates outstanding readers and result handles, and
  evicts HUD, worker, query, snippet, and pagination caches.
- Accept search input through a bounded typed query builder, not caller-supplied
  SQL or unrestricted FTS syntax. Apply token, operator, prefix, result, time,
  memory, and cancellation limits so search cannot exhaust the database worker.
- Update source lifecycle and FTS entries in one controlled transaction and use a
  schema whose delete ordering is proven for the selected FTS content mode. Run
  consistency checks and rebuild only from currently `ACTIVE` authoritative rows.
- Pin and verify the SQLite library, FTS5 support, compile options, tokenizer,
  schema, and settings at runtime. Require SQLite core `secure_delete=ON` and the
  FTS5 table `secure-delete=1`; `FAST`, an unsupported SQLite or FTS version, or a
  setting that cannot be read back disables disk-backed search. The initial
  minimum is SQLite 3.42.0, subject to the packaged runtime evidence.

### Retention

- Define a maximum retention period, expiry basis, permitted permanent envelope,
  and deletion objective for every data class before ingestion. Agents and source
  content cannot extend retention; any owner-approved extension is a new policy
  decision and never revives already deleted data.
- Compute and persist expiry at admission. Maintain a durable last-observed time
  high-water mark so wall-clock rollback cannot extend retention. Large forward
  jumps, unavailable time, or policy ambiguity enter a visible conservative
  recovery state rather than silently changing expiry.
- Run bounded expiry continuously, at startup, before search exposure, and before
  backup or export. If deletion falls behind its maximum service window, stop or
  reduce new retention-bearing ingestion and surface the backlog; do not trade
  deletion guarantees for availability.

### Resumable Deletion

1. Resolve a deletion request to stable opaque object identities and durably
   create an idempotent job with policy, reason, scope, managed-copy inventory,
   and per-store checkpoints. Never identify deleted content by retaining its raw
   value or an unapproved low-entropy hash.
2. In the first transaction, mark all affected objects `HIDDEN`, increment their
   access generations, and commit the job. After this point no new query, display,
   prompt, packet, export, or backup may expose them, even while physical cleanup
   remains pending.
3. Cancel and drain managed readers and workers, invalidate in-memory and renderer
   results, then delete source payload and FTS state in the schema-required order
   and one controlled transaction. Record only content-free lifecycle tombstones.
4. Purge thumbnails, transformations, caches, temporary and migration files,
   managed artifacts and exports, backup references, wrapped object keys, and any
   other inventoried copy. Shared blobs across incompatible retention scopes are
   prohibited; a legitimately shared retained copy produces an explicit partial
   result rather than a false deletion claim.
5. Perform the selected SQLite maintenance sequence with all readers quiesced:
   verify secure-delete settings, complete and verify the required WAL checkpoint
   and truncation, handle journals and temporary files, and run a validated
   vacuum or clean rebuild when required by the threat model. Busy, disk-full,
   crash, corruption, version, or verification failure leaves the job resumable
   and not complete.
6. Verify absence with database and FTS integrity checks, direct managed-file and
   canary scans appropriate to the test environment, managed-copy manifests, key
   status, and a restore simulation where required. Only then record
   `COMPLETE_MANAGED`; otherwise record `PARTIAL`, `BLOCKED`, or `QUARANTINED` with
   exact remaining locations and retry requirements.

### Backups, Exports, and Encryption

- Create only policy-approved managed backups and exports through the persistence
  service. Give each an identity, manifest, source cutoff, retention and expiry,
  encryption and key identities, location, lifecycle, and deletion capability.
  Untracked file copies are unsupported.
- Apply the current deletion ledger and retention policy in an isolated restore
  area before restored data becomes queryable, searchable, exportable, or backed
  up again. A backup that still contains deleted bytes remains a declared managed
  copy until it expires or is rewritten and verified.
- User-created exports, operating-system backups and snapshots, cloud sync,
  provider logs, recipient copies, swap, crash dumps, and SSD remanence are
  unmanaged unless a later integration explicitly takes control of them. DOSAI
  can warn, minimize, and exclude managed directories where supported but cannot
  issue an erasure claim for those copies.
- Select at-rest and backup encryption in a subordinate ADR before P7 writes user
  data. If per-object cryptographic deletion is claimed, use independently wrapped
  object keys, inventory every key copy and backup, and prove key destruction and
  restore behavior. A database key, FileVault, or deleted key reference alone is
  not per-object deletion. Encryption never relaxes admission prohibitions.

### Deletion Receipts and Non-Claims

- A receipt contains the job and policy identities, opaque object scope, request
  and completion sequences, logical-hide time, each managed location and result,
  SQLite and FTS maintenance evidence, backup and key status, verifier version,
  retries or failures, and unmanaged-copy limitations. It contains no deleted
  content, unsafe digest, or claim stronger than observed evidence.
- `COMPLETE_MANAGED` means active access is revoked and every inventoried
  DOSAI-managed copy met its deletion objective. It does not prove physical media
  erasure or recall bytes already displayed, transmitted, exported, backed up by
  the user, or retained by an external provider.

## Consequences

Search is narrower than the original product vision, and deletion maintenance can
block ingestion, close readers, checkpoint, vacuum, rebuild, rewrite backups, or
quarantine a store. The application gains an honest lifecycle and bounded
retention claim. Search and persistence remain unavailable if the packaged SQLite
runtime or selected encryption cannot meet the contract.

## Alternatives Rejected

- SQL row deletion alone does not remove every managed copy.
- Indexing raw packets or logs conflicts with the security policy.
- A single database encryption key does not provide per-record deletion.
- Core SQLite `secure_delete` alone does not remove FTS5 index history.
- Hiding stale FTS rows at query time is necessary for immediate revocation but is
  not physical cleanup.
- Deleting an open database, WAL, or backup file can leave live handles, snapshots,
  or recoverable copies and cannot substitute for coordinated maintenance.
- A success receipt without per-location verification overstates erasure.

## Evidence Required

P7 must test prohibited input before every boundary; malformed and oversized
classification; lifecycle and generation races; open readers and stale result
handles; raw SQL and FTS injection; expensive queries; source and FTS transaction
ordering; tokenizer and version drift; disabled, `FAST`, and changed secure-delete
settings; FTS tombstones and shadow structures; WAL frames and incomplete, busy,
restart and truncate checkpoints; rollback, statement and super journals; shared
memory; SQLite temporary and vacuum files; migrations; disk-full and low-space
states; corruption; app and worker crashes at every deletion checkpoint; clock
rollback and forward jump; retention backlog; cache and artifact copies; shared
references; interrupted exports; backup creation, rewrite, expiry and restore;
key loss, duplicated keys and cryptographic deletion; and repeated or concurrent
deletion requests.

Synthetic unique and low-entropy canaries must disappear from every inventoried
managed query and byte surface according to the declared deletion objective while
unrelated retained records remain intact. Fault injection must prove immediate
logical hiding, idempotent recovery, no reappearance after restart or restore,
honest `PARTIAL` and `BLOCKED` receipts, and no effect on unmanaged user files.

## Implementation References

- SQLite temporary files: <https://www.sqlite.org/tempfiles.html>
- SQLite write-ahead logging: <https://www.sqlite.org/wal.html>
- SQLite pragmas and core secure delete: <https://www.sqlite.org/pragma.html>
- SQLite FTS5 and FTS secure delete: <https://www.sqlite.org/fts5.html>
- SQLite `VACUUM`: <https://www.sqlite.org/lang_vacuum.html>
- SQLite Online Backup API: <https://www.sqlite.org/backup.html>

## Revisit Conditions

Revisit when retention requirements, data classes, backup integration, or an
approved encryption technology changes. A new SQLite major behavior, FTS schema
or tokenizer, journal mode, storage engine, encryption or key hierarchy, backup
target, deduplication scheme, export surface, or deletion claim requires a
versioned transition and renewed canary, crash, restore, and forensic evidence.
