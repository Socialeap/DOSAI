# P2.4 Packaged Secure Enclave Helper Evidence

**Status:** `[~] IN_PROGRESS`<br>
**Evidence captured:** `2026-07-31T19:56:41-04:00`<br>
**Engineering result:** `PASS_PACKAGED_READ_ONLY_PROOF`<br>
**Review decision:** `ACCEPTED_PACKAGED_HELPER_BASELINE` at `2026-07-31T20:04:03-04:00`<br>
**Phase completion:** Not claimed

This record covers a packaged, standalone Swift Security-framework proof helper.
It compiles and appears outside `app.asar`, but Electron cannot invoke it and it
has no production checkpoint API, database path, network authority, stdin
protocol, or arbitrary-message signing operation. Only read-only and deliberately
rejected invocations were executed. No Keychain query, key creation, signature,
or deletion operation was reached.

## Accepted Packaged Helper Baseline

| Artifact | State | SHA-256 |
| --- | --- | --- |
| Process ownership v5 | Accepted | `6417976e00bd8ea6db597f5020b8558ccb32244cb19e08469652d51469d53d87` |
| Swift proof helper | Implemented, live lifecycle disabled by gate | `107bc4eab839068bd192c10a6e0ecc3cc3b21e0dcc38ad693a5da8879d4473c1` |
| Reproducible helper build driver | Implemented | `a9e062431bccf1e82c1e8364125198b4ee28c09d17633314e65e28f8148e3846` |
| Package assembly and verification | Updated | `cdc672ddb1f754ece490011568697bbff94176835aaca7cf4cd6429faa3d0670` |
| Package command surface | Updated | `0e89beae789dfb1b96038a0f7ec8a54a80701e4585ad4aaf85a3d184f57062aa` |
| Package architecture tests | Updated | `6af55edfdeddbca1fefe56507dafba82731cf180e1bc5e8d8c26b81d017e2bb3` |
| Ownership and isolation tests | Updated | `590d1342f93f77c07cd61c91e365d00e3a225768cb506f9f51aac778a6873798` |
| Helper security tests | Implemented | `4bfe56385218402f9cde4a7293353aba4eda13962c2f8658098d2299c53f56ed` |
| Packaged read-only audit | Implemented | `7603fd96e17b0c24461ac2aec110d4f24916998843ee7b2e10db3652484d5ec3` |

Accepted process ownership v4 remains byte-identical at SHA-256
`0d86608f3b71ce4b5af317d05978fb4d33c83c13df6ddb3f56e409fa967ea992`.

## Bounded Protocol

- `describe` reports protocol, target, operation, and non-claim metadata without
  touching Security-framework state.
- `exercise-test-lifecycle` accepts only one canonical UUID plus the exact,
  non-secret owner-authorization phrase. It creates one permanent Secure Enclave
  P-256 test key under a fixed UUID-derived application-tag namespace, signs one
  internally constructed domain-separated challenge, verifies the signature and
  private-key export failure, then deletes and re-queries the exact tag.
- `cleanup-test-key` is the separately authorized recovery path for a process
  interruption. It can address only the same UUID-derived proof namespace and
  must verify absence before reporting success.
- The authorization phrase prevents accidental invocation; it is public source
  text and is not an authentication secret. The operative authorization control
  is owner approval of the exact local command and run identifier.
- The helper exports no production signing call. Public-key SPKI may be emitted
  by a future authorized lifecycle proof, but no private-key bytes can be output.

## Packaged Result

| Property | Result |
| --- | --- |
| Helper artifact | arm64 64-bit Mach-O outside `app.asar` |
| Minimum deployment target | macOS 15.0 |
| Swift toolchain | Apple Swift 6.3.3, swiftlang 6.3.3.1.3 |
| Packaged helper SHA-256 | `20bd400d1e2baa3cc3aecb43aa2fd2e7f5f1630bd907a6418ba775dde250d06c` |
| Packaged helper code identity | ad hoc linker signature; full CDHash `bf327a951553be36c8a5add71e6578b83f59e66d806298cdd8cb7ee5ad3459de` |
| Packaged `app.asar` SHA-256 | `c74a532826def9b9667a0be2f9f07f62ef4cd45575f77488f4d107f1b62ec5ab` |
| Electron archive SHA-256 | `ad4a0ae3c37ee05aa06c7e2ed0627608389790f0505a2b0d20319efbe33ffe28` |
| Archive verification source | Exact `electron@43.2.0` package `checksums.json`; match required before offline use |
| Read-only packaged audit | PASS; 12 assertions, `mutation_performed: false`, secret scan PASS |

Two clean helper compilations produced the same SHA-256 on the current host.
The package command used the cached Electron archive only after matching the
checksum owned by the exact pinned Electron dependency; a missing or mismatched
archive retains the existing checksummed download path.

## Faults Found and Remediated

1. Swift 6 rejected the initial single-file `@main` compile and compiler caches
   could fall outside the bounded build directory. The fixed driver uses
   `-parse-as-library`, an isolated module cache, fixed target and framework
   arguments, bounded output, and sanitized build environment.
2. `@electron/get` found the cached Electron archive but deliberately fetched a
   fresh checksum file, preventing sandboxed repeat packaging. Packaging now uses
   a cached archive only after its SHA-256 matches the checksum shipped by the
   exact pinned Electron package; no unchecked offline fallback exists.
3. A process interruption after test-key creation could leave the proof item in
   Keychain. The protocol now includes an explicitly authorized, exact-namespace
   cleanup operation and verifies absence after normal or recovery deletion.

## Validation

| Command or inspection | Result |
| --- | --- |
| `pnpm run check` under Node 24.18.0 and pnpm 11.18.0 | PASS; seven typechecks, 107 tests, three production builds |
| `pnpm run build:secure-enclave-helper` twice | PASS; identical helper digest |
| `pnpm run package` with checksum-verified local Electron archive | PASS; nine fuses, 11 ASAR entries, helper description, plist |
| `pnpm run audit:p2:secure-enclave-helper` | PASS; 12 packaged assertions and secret scan |
| Empty, unknown, extra, missing, unauthorized, and malformed protocol calls | PASS; rejected before any key operation |
| Architecture and source scans | PASS; no application reachability, stdin, network, generic signing, or production checkpoint API |
| `codesign --verify --strict`, `lipo`, `vtool`, and undefined-symbol scan | PASS for current ad hoc arm64/macOS 15 artifact |
| Existing packaged GUI audit | Not rerun; local app-launch approval was unavailable after the package check |
| Runtime capability matrix | Unchanged; every P2 runtime capability remains `UNVERIFIED` |

## Remaining Gates and Limitations

- Process ownership v5 and this implementation set await synchronized owner
  review. Acceptance would not authorize a Keychain mutation by itself.
- The packaged lifecycle command has not run. Secure Enclave availability,
  persistence, token attributes, signing, private-key non-exportability, exact
  cleanup, and recovery cleanup are therefore unproven on this Mac.
- The helper has an ad hoc linker signature, no Team ID, and no hardened-runtime,
  notarization, entitlement, or distribution-profile proof. P11 owns those gates.
- A forced termination can leave a proof key until the owner-authorized cleanup
  command runs. No automatic cleanup service or startup reconciliation exists.
- The helper is a lifecycle probe, not a production checkpoint authority. It
  does not bind journal state, persist checkpoint lineage, rotate production
  keys, or supply hardware assurance to the TypeScript evaluator.
- Apple supplies local token and non-exportability evidence, not portable remote
  attestation for this key. Hardware assurance remains a local platform claim.
- No TUF trust bootstrap, Rekor network request, public entry, receipt, trusted
  time, or independent log-monitor proof was added or authorized.

## Gate Decision

The owner accepted the process v5 boundary and packaged proof-only helper as the
next P2.4 test generation while keeping P2.4 incomplete and capabilities
unchanged. The next gate is one exact packaged lifecycle run with a fresh
recorded UUID, followed by an independently invoked cleanup check for that same
UUID. Public-log work remains separately evidence-gated after the hardware proof.
