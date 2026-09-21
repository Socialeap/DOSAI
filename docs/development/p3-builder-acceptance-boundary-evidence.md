# P3 Builder Acceptance Boundary Evidence

**Status:** `ACCEPTED`  
**Recorded:** `2026-08-11T18:40:22-04:00`  
**Validated:** `2026-08-11T18:42:46-04:00`  
**Accepted:** `2026-08-11T18:59:17-04:00`  
**Scope:** P3.3 governance-only clarification  
**Related artifacts:** `docs/architecture/schema-registry-v16.json`, schema registry v17, schema registry v18, and `docs/development/p3-linux-builder-snapshot-contract-remediation.md`

## Purpose

This no-effect slice prevents a later accepted registry from being mistaken for
owner acceptance of the P3 Linux builder remedy preserved inside it. Registry
v16 and Linux builder manifest v2 remain proposed for owner review. Registry
v17 and registry v18 retain the exact v2 entry only so their separately accepted
audit-journal and watchdog contracts have an immutable schema baseline.

The distinction matters because the v2 schema is intentionally capable of
describing a future builder input. It does not authorize package resolution,
downloads, signature verification, image preparation, compilation, guest
execution, or any other builder operation.

## Enforcement

`tests/governance/p3-builder-acceptance-boundary.test.mjs` requires all of the
following:

- registry v16 remains `PROPOSED_FOR_OWNER_REVIEW` at its fixed SHA-256;
- accepted registry v17 and registry v18 preserve the exact v16 builder entry
  without changing it;
- the P3.3 live-plan row and existing accepted watchdog evidence continue to
  describe v16 and builder manifest v2 as owner-review-only; and
- Electron Main, preload, and renderer source cannot import or reference the
  unaccepted builder contract.

The adversarial cases reject both a false v16 promotion and a later registry
that mutates the preserved builder entry. The check is intentionally static: it
does not resolve a package, inspect a package index, access the network, create
an image, compile a guest, start a process, or invoke a VM.

## Validation

The repository-pinned Node `24.18.0` and pnpm `11.18.0` produced:

```text
node --test tests/governance/p3-builder-acceptance-boundary.test.mjs
3 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
474 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

`git diff --check` passed for the modified tracked plan; the repository's
existing Git fsmonitor IPC warning was the only output. A high-confidence scan
of this slice found no credential or private-key pattern. pnpm reported that
the existing `node_modules` workspace state is out of sync with the lockfile;
no dependency installation or lockfile change was performed.

## Remaining Gate

This guard does not accept registry v16 or builder manifest v2. The next P3.3
capability step remains the owner's review and explicit acceptance decision for
the snapshot remediation. Only after that decision may a separately proposed,
read-only supply-chain resolution gate be evaluated. The P3.4 physical status
proof remains independently owner-gated.
