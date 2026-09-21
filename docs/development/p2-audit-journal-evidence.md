# P2.3 Single-Writer Audit Journal Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T19:06:46-04:00`<br>
**Engineering result:** `PASS`<br>
**Review decision:** Owner accepted `2026-07-31T19:13:53-04:00`

This record covers a synthetic, isolated Z6 audit writer with strict event
proposal, canonical event, and durable acknowledgement contracts. It performs
no application effect, emits no execution grant, signs no checkpoint, contacts
no anchor, and is not connected to Electron. All runtime capabilities remain
`UNVERIFIED`.

## Accepted Set

| Artifact | State | SHA-256 |
| --- | --- | --- |
| Process ownership v3 | Accepted | `403707ec24c938f0012891bccbef848db3bc87a3088d593953b5ff5a965cc4bf` |
| Schema registry v7 | Accepted | `6a41d62c2f22683573f211d4c6012ac17bad6fe08ba9a1443792e0adcb0e6ff7` |
| Audit event proposal schema v1 | Defined in accepted registry | `5dcd5d083d87383ba183e0181548ab2cf2a9de22af8db33e508b6f2898125664` |
| Canonical audit event schema v1 | Defined in accepted registry | `6d6c1f2a465d50947b3e280b62335e34ce27cc7eb2fa677cc269e099841a4b8a` |
| Durable acknowledgement schema v1 | Defined in accepted registry | `1c61a3d9be76e3798d9269a2df1bd6f1df03ea4da9e9c5b0de9783ae6befc004` |
| Audit runtime contracts | Implemented | `ac5c3993525ebff20fa2a9ebb81ccfe995403fa1a85d8482725b41f9e51a69c3` |
| Isolated journal writer and verifier | Implemented | `acddb73efcaf698e11f5820bed0703165b91b02555c2e016cbcc09323c191f01` |
| Ownership and import tests | Updated | `f578bb3df85be892926d782c5dd47af204839296f52745742fa0e731b9f3b3fd` |
| Audit contract corpus | Implemented | `32f74eaa73e8997b9cabfad51b731b394cab924e37cff6485195b7f977367701` |
| Journal adversarial corpus | Implemented | `54bc06cab3988d4e4399ea9ed769c77cf88df91946444cac82fb71292b18435d` |
| Isolated audit typecheck | Implemented | `25a6da5badb5361ba4f8e44eb146283c72c021b9337860f3833b102c9f757fc4` |
| Root package scripts | Updated | `bf6408a4ec4e9d266cc50dc3b32f317f782e35b9eec70c562360db4e9de10d8b` |

Schema registry v6 remains byte-identical at SHA-256
`da06e0643ce17eaa8f081679667759433e53dc026264118632382ab9b5c7aa42`.
Process ownership v2 remains byte-identical at SHA-256
`bc9fadd5f3e446ebc1935b488a338210c81409ef4092ba7ed6b2ebeeee22ab0e`.

## Journal Protocol

- An owner-only canonical directory and regular, single-link database file are
  required. Non-canonical aliases, symlinks, hard links, permissive directories,
  missing expected identity, and replaced journal identities fail closed.
- The built-in SQLite connection uses defensive mode, extension loading disabled,
  exclusive locking, `DELETE` journal mode, `synchronous=EXTRA`, `fullfsync=ON`,
  and `checkpoint_fullfsync=ON`. A commit returns before an acknowledgement.
- Each append atomically inserts the canonical event and acknowledgement and
  compare-and-swap updates the sequence and chain head in one transaction.
- Events use JCS-compatible key ordering and domain-separated SHA-256. Sequence,
  previous hash, request digest, acknowledgement identity, journal identity,
  journal epoch, boot, writer epoch, source, provenance, wall-clock uncertainty,
  and writer monotonic time are bound into canonical event bytes.
- Every open verifies schema identity, SQLite integrity, exact event and
  acknowledgement contracts, canonical bytes, request reconstruction, sequence,
  hashes, epoch links, monotonic order, unique identities, and the stored head
  before appending a writer-epoch event linked to the prior verified head.
- Source identity, generation, uncertainty, and provenance come from a registered
  authentication-token binding. Tokens are unique, nonzero, transient, compared
  in constant time, and writer-owned copies are zeroed on close and never
  serialized, hashed, or logged.
- Request identifiers are idempotent. An exact replay returns the original
  durable acknowledgement; a changed replay fails closed. A caller can reconcile
  an unknown commit result by authenticated request identity after restart.
- The permanent corpus admits only `SYNTHETIC_AUDIT_PROBE` and writer-epoch
  records containing UUIDs, enums, digests, and fixed control metadata. Generic
  logs, commands, arbitrary strings, caller sequence, caller provenance, and
  extra fields are rejected before hashing or persistence.

## Faults Found and Remediated

1. The first lineage test compared process ownership v3 directly with v1 even
   though v3 supersedes v2. The corpus now verifies each immutable predecessor
   and immediate digest link separately.
2. Acknowledgement JSON initially carried an unchained random message identity
   and insufficient event rebinding. The acknowledgement identity now lives in
   canonical event bytes, and verification binds every acknowledgement field
   back to the event.
3. Startup verification initially materialized every event and parsed arbitrarily
   large stored JSON. It now iterates in constant memory, caps canonical event and
   acknowledgement bytes, and bounds schema-object inspection.
4. The implementation class and writer-epoch method were initially exported,
   allowing a trusted caller to bypass authenticated append admission. The class
   is now module-private, epoch creation is private construction behavior, and
   the module exposes only open, read-only verify, and typed failure entry points.
5. Two registered sources could initially share one authentication token and let
   the holder select either provenance class. Zero and duplicate tokens are now
   rejected, and copied token material is cleared on every failed open path.
6. Malformed stored contracts and active-writer lock conflicts could initially
   escape with imprecise failure classification. Persisted admission failures are
   now integrity failures and verifier lock contention is a bounded concurrency
   failure.

## Validation

| Command or inspection | Result |
| --- | --- |
| Strict Draft 2020-12 compilation and positive fixtures | PASS; proposal, event, and acknowledgement v1 |
| Schema and runtime negative corpus | PASS; authority, provenance, generic payload, extra field, durability, secret, accessor, and invalid digest inputs rejected |
| Contiguous multi-source allocation and exclusive writer | PASS; writer owns sequence and second writer is denied |
| Durable acknowledgement and idempotent reconciliation | PASS; exact replay returns the original acknowledgement and changed replay is denied |
| Restart, boot, and writer-epoch continuity | PASS; each epoch links to the prior verified head |
| Mutation, acknowledgement rebinding, deletion, and reorder | PASS; read-only verification and startup reject without repair |
| Commit-result ambiguity | PASS; writer enters `BROKEN`; authenticated request lookup reconciles the committed record after restart |
| SQLite storage exhaustion | PASS; failed append returns no acknowledgement and the last committed chain verifies |
| Prohibited-data canaries | PASS; rejected values and authentication tokens are absent from database bytes |
| Valid-prefix rollback simulation | PASS; local verification reports `LOCAL_ROLLBACK_NOT_DETECTABLE` rather than overstating assurance |
| `pnpm install --frozen-lockfile` | PASS; two workspaces already current under pnpm 11.18.0 |
| `pnpm run check` | PASS; seven typecheck surfaces, 83 tests, and three production builds |
| Architecture import and no-execution checks | PASS; application source cannot import the audit helper and no process execution path exists |
| `git diff --check` | PASS |

## Limitations

- The built-in `node:sqlite` API is experimental and accepted only for the exact
  pinned Node 24.18.0 development profile in this checkpoint.
- The writer is an isolated library, not an OS-authenticated service or Electron
  integration. Source registration, token delivery, expected installation
  identity, storage creation, and a separate process boundary still require
  governed bootstrap integration.
- The writer API is synchronous by design and must remain outside Electron main
  and renderer. No helper process lifecycle or bounded transport exists yet.
- A real sudden-power-loss rig and physical flush failure were not induced. The
  corpus verifies SQLite's strongest configured local mode, disk-full rollback,
  and a simulated commit that succeeds while acknowledgement delivery fails.
- Events and acknowledgements are unsigned and unanchored. A local attacker who
  replaces the database with a valid earlier prefix or creates a fork can evade
  local-only detection; the verifier states this limitation exactly.
- The verifier is read-only but ships in the same helper module. A separately
  packaged verifier, protected key, checkpoint schema, signing, rotation,
  independent anchor, and receipts belong to P2.4 and P11.
- Only synthetic probes and internal writer-epoch events are admitted. No real
  operation intent, approval, grant, effect, recovery transition, or application
  capability is enabled by P2.3.

## Decision

The owner accepted process ownership v3, schema registry v7, the three
synchronized audit contracts, the isolated single-writer journal, and all six
remediations. P2.3 is complete, every runtime capability remains `UNVERIFIED`,
the unsigned and unanchored limitations remain exact, and P2.4 protected
checkpoint, key lifecycle, assurance, and independent anti-fork anchor work
begins with process execution still absent.
