# ADR 0010: Canonical Evidence and Lossy Derivations

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T14:12:44-04:00
- **Decision owner:** Repository owner
- **Related control:** F11
- **Related plan phase:** P9

## Context

Perceptual similarity does not establish UI equivalence, syntax proximity does
not establish semantic completeness, and a compressed timeline is not a complete
record of reality. Compression, sampling, parsing, redaction, and summarization
can hide the evidence required for approval, incident response, security review,
or causal understanding.

DOSAI must reconcile two constraints. It needs exact evidence for decision and
audit purposes, but it must never retain prohibited data and cannot store
unbounded browser, terminal, or repository output. In this ADR, `canonical`
therefore means the exact bounded bytes that are permitted after deterministic
classification and sanitization. It does not mean the raw source, complete
reality, or an assertion that the observed source was truthful.

## Decision

### Canonical Evidence Contract

- Capture and admit canonical sanitized evidence before sampling, deduplication,
  parsing, pruning, summarization, thumbnailing, perceptual hashing, or another
  lossy transform. Classification, exclusion, masking, and redaction required by
  the data policy occur before persistence or hashing; D0 prohibited data is
  never made canonical, hashed, cached, or retained.
- Define a versioned evidence schema for each source and operation type. It sets
  permitted media types and fields, purpose, capture point, byte and duration
  limits, required pre-effect and post-effect observations, critical events,
  sanitization profile, retention class, and behavior when capture is forbidden,
  incomplete, or unavailable.
- Make every admitted artifact immutable. Bind exact byte digest and byte length
  to an immutable manifest containing an opaque identity, schema and policy
  versions, source and provenance class, operation and action-plan digests,
  session and resource generations, monotonic capture sequence, observed clock
  values and uncertainty, media type and encoding, capture method and version,
  sanitization profile, exclusions, truncation, retention, and parent identities.
- Version the cryptographic digest algorithm and canonical byte framing. A digest
  identifies the captured bytes and supports integrity checking; provenance is a
  separate manifest claim that must be verified through its trusted producer and
  audit records. Algorithm migration creates new identities and cross-references;
  it never silently re-labels an existing artifact.
- For content above the single-object limit, use deterministic ordered byte
  chunks. The manifest records total permitted length, every byte range and chunk
  digest, and whether the source ended or capture stopped. Retrieval verifies the
  manifest, order, coverage, and reconstructed digest; a missing, reordered,
  duplicated, corrupt, or expired chunk is an explicit unavailable range, not a
  partial success.

### Capture Failure, Bounds, and Backpressure

- Allocate bounded queues, memory, CPU, time, and disk reserve to evidence
  capture. Decision-relevant events have reserved capacity and cannot be dropped
  by telemetry pressure. If required canonical capture cannot complete because
  of policy, authentication state, overflow, timeout, disk pressure, crash, or
  worker failure, record only a sanitized typed gap and refuse any new effect or
  conclusion that requires that evidence.
- Keep the emergency stop independent of evidence availability. A stop proceeds
  even when capture or audit is degraded; the outcome remains explicitly unknown
  where post-stop evidence is absent.
- Raw browser, process, and repository bytes remain transient inside their
  approved evidence boundary. They cannot spill to application-created temporary
  files, logs, crash reports, retry caches, prompts, packets, or renderer state.
  Sanitization failure yields no artifact and no digest of the rejected value.
- A bound is part of the evidence, not an implementation detail. Record exact
  captured and omitted byte ranges, frames, selectors, streams, channels, and
  intervals. Never convert `not captured`, `not permitted`, `truncated`,
  `unavailable`, `not observed`, or `no change detected` into one state.
- For stdout and stderr, preserve admitted bytes in capture-sequence order with
  stream identity, byte offsets, encoding status, interleaving uncertainty, and
  explicit truncation or dropped-range markers. Repetition and rate limiting may
  affect forwarding only after canonical capture. Malformed or split encodings,
  control characters, and attacker text remain untrusted data.

### Derived Artifact Contract

- Treat AST slices, code summaries, DOM and accessibility deltas, OCR, pHash and
  similarity scores, thumbnails, selected frames, compressed logs, counts,
  timelines, and model-written summaries as derived artifacts. They have no
  approval, policy, incident, security, or audit authority by themselves.
- Every derivation records all source manifest digests and byte ranges,
  transformer name, package and executable build identities, dependency and
  configuration versions, exact parameters, start and completion sequence,
  deterministic or nondeterministic classification, output digest, coverage,
  omissions, warnings, errors, loss class, and source availability at read time.
  Model-based transforms additionally bind model, prompt template, and sampling
  configuration and are always untrusted, nondeterministic views.
- Run transforms in bounded workers with no network, credential, grant, policy,
  approval, arbitrary filesystem, or execution authority. Treat parsers and
  image decoders as attack surfaces, pin their dependency closure, and classify
  their output before any later boundary.
- A derived artifact may point to another derivation for navigation, but its
  complete provenance chain must terminate in verified canonical manifests.
  Transformer upgrades create new derived artifacts; they do not rewrite history
  or confer new trust on old outputs.
- A suppression or deduplication choice is itself a derived record bound to the
  compared canonical manifests, rule and version, threshold, score, and reason.
  It may reduce forwarding or display density but cannot delete canonical source,
  suppress a critical event, or assert semantic equivalence.

### Code and Text Derivations

- Pin Tree-sitter core, Node binding, language grammars, query files, and parser
  limits. Inspect both `ERROR` and parser-inserted `MISSING` nodes. Parser
  absence, timeout, cancellation, crash, invalid encoding, recovery, unexpected
  grammar version, generated or mixed-language input, or uncertain language
  selection disables pruning for the affected canonical source.
- On disabled or uncertain pruning, provide deterministic lossless chunks from
  the canonical artifact. Include exact byte ranges and links, modes, renames,
  deletions, imports, side-effect-only code, configuration, migrations, generated
  files, binary changes, and cross-file dependency context when relevant. A
  caller may request narrower chunks, but the system never labels them complete.
- AST and diff views identify context selected and omitted. They cannot infer that
  unparsed macros, templates, build steps, runtime loading, or unchanged-looking
  declarations have no effect. A valid parse establishes syntax-tree production,
  not semantic completeness or safety.
- Log compaction preserves exact source range retrieval. Run counts identify each
  represented sequence and time range; error, denial, cancellation, crash,
  boundary, approval, and unknown-outcome records are never collapsed away.

### Visual and DOM Derivations

- Select and pin a perceptual-hash implementation separately. `sharp` may decode
  and deterministically normalize bounded images, but this ADR does not assume it
  supplies pHash. Bind normalization to decoder versions, orientation, color
  space and profile, alpha handling, dimensions, crop, viewport, device scale,
  animation frame, masks, and capture-plan digest.
- Use perceptual hashes and similarity thresholds only to propose non-critical
  telemetry grouping. They are not cryptographic identity, a semantic distance,
  a proof of unchanged UI, or grounds to discard a canonical frame. Critical
  text, approval state, policy state, errors, navigation, origin, authentication
  transitions, and before or after effect captures bypass visual suppression.
- Keep sanitized image, DOM, and accessibility artifacts as distinct canonical
  observations with their own provenance. A DOM delta cannot replace a frame,
  and a frame cannot establish hidden DOM, focus, accessibility, network, origin,
  or server state. Capture forbidden during authentication under ADR 0007 becomes
  a typed interval gap, never an inferred unchanged state.

### Approval, Display, Replay, and Lifecycle

- Bind any decision that requires evidence to the exact canonical manifest
  digests and required ranges in the immutable action plan. A derived view may
  help the owner navigate, but the UI must label its loss class, disclose
  coverage and omissions, verify current source availability, and provide exact
  canonical retrieval before approval. Missing required source makes the plan
  stale or ineligible; a thumbnail, pHash, summary, or prior display cannot
  substitute.
- Render remote, repository, log, and derived text as untrusted quoted data. Keep
  provenance, capture state, loss, gaps, source availability, and assurance in
  trusted UI outside content-controlled regions. Do not use one green or complete
  badge for a timeline containing missing or unverified intervals.
- Replay is an ordered view of observed events, not a recreation of reality.
  Order it by verified audit and capture sequence; wall-clock values are labels,
  not ordering authority. Reconstruct state only through a complete verified
  snapshot and delta chain. Stop reconstruction at the first gap, display the
  gap, and never interpolate screenshots, DOM, terminal output, effects, or
  outcomes.
- Govern canonical and derived artifacts through ADR 0008 retention, deletion,
  export, backup, and access-generation controls. Derived retention cannot exceed
  its canonical sources unless policy explicitly permits a non-authoritative
  residual record marked `SOURCE_UNAVAILABLE`. Deletion never allows an orphaned
  summary to become evidence, and restoration rechecks every source relationship.
- Export evidence only through a binary-safe manifest with exact files, digests,
  lifecycle states, gaps, derivation records, and an independent verifier. An
  export with unavailable canonical ranges states that limitation prominently.

## Consequences

Canonical evidence consumes bounded storage and requires reserved capacity,
retention, deletion, retrieval, and integrity management. Some effects will be
blocked when required evidence cannot be captured, and some timelines will show
gaps rather than polished continuity. Compression remains useful for navigation
and cost reduction, but it cannot become an authorization filter.

The specification's `sharp (pHash)` entry is not an implementation guarantee.
P9 must select, review, pin, and test a separate hash implementation or omit the
feature. Tree-sitter output is similarly a derived index whose successful parse
does not prove semantic completeness.

## Alternatives Rejected

- A global pHash threshold can miss a small critical region or transient state.
- A low hash distance does not prove that two frames are semantically equivalent.
- Checking only Tree-sitter `ERROR` nodes misses recovery represented by inserted
  `MISSING` nodes.
- A valid AST cannot establish complete runtime, configuration, generated-code,
  import, macro, template, or cross-file effects.
- Keeping only the first or last bytes of an overflow hides the omitted range and
  can break causal ordering.
- Reconstructing a plausible intermediate timeline presents invention as
  observation.
- A summary cannot become authoritative because the source expired, was deleted,
  or is inconvenient to retrieve.
- Hashing prohibited data before rejecting it still retains a derived identifier
  and violates the admission boundary.

## Evidence Required

P9 must use adversarial fixtures covering localized critical pixels, small text,
overlays, focus and accessibility changes, animations, color-profile and scale
variation, orientation and alpha, identical or colliding similarity decisions,
DOM and frame disagreement, navigation, origin, login capture gaps, and visual
transformer version drift.

Code fixtures must cover every supported grammar; `ERROR` and `MISSING` recovery;
unsupported, stale, mixed, generated, binary, malformed, macro, template,
configuration, migration, import-only, rename, mode, link, deletion, and
cross-file changes; parser timeout and crash; and source-transform digest
mismatch. Every fallback must reconstruct the permitted canonical bytes exactly.

Terminal and storage fixtures must cover binary and invalid UTF-8, split code
points, stdout and stderr interleaving, repetition, flood, truncation, queue and
disk exhaustion, crash during chunk commit, missing and corrupt chunks, digest
and manifest substitution, retention expiry, deletion and restore, stale cache,
transformer replacement, recursive summaries, and attempted approval from a
derived or unavailable artifact. Secret canaries may not enter any artifact,
digest, log, export, or failure record.

Replay tests must prove exact sequence ordering, honest clock uncertainty,
visible forbidden and unavailable intervals, reconstruction stop at the first
broken chain, unknown outcomes after crash or stop, and absence of invented
frames or state. An independent verifier must reject incomplete, reordered,
duplicated, corrupt, mis-versioned, and orphaned evidence exports.

## Non-Claims

- Canonical sanitized evidence proves which permitted bytes DOSAI captured; it
  does not prove source truth, completeness, intent, safety, or unobserved state.
- Sampling may miss states between captures even when every retained frame is
  exact.
- Sanitization and bounded capture are disclosed transformations, not access to
  forbidden ground truth.
- DOSAI minimizes live raw buffers but does not claim erasure from operating-
  system swap, crash dumps, or physical media outside its managed-copy boundary.
- Perceptual similarity is not semantic equivalence, and syntax is not behavior.

## Implementation References

- Tree-sitter query syntax and `ERROR`/`MISSING` nodes:
  <https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html>
- Node Tree-sitter `SyntaxNode` error properties:
  <https://tree-sitter.github.io/node-tree-sitter/interfaces/SyntaxNode.html>
- Sharp image processing API: <https://sharp.pixelplumbing.com/api-operation/>

## Revisit Conditions

Revisit capture schemas, bounds, transforms, thresholds, algorithms, or retention
only through versioned fixtures and a new ADR. A new source class, evidence use,
parser or image stack, model-based transform, approval dependency, export format,
or claim of semantic equivalence requires renewed threat review. Existing derived
artifacts never inherit changed trust semantics.
