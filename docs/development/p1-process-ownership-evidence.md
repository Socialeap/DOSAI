# P1.2 Process Ownership Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T16:25:02-04:00`<br>
**Decision basis:** Accepted ADR 0001<br>
**Review decision:** Owner accepted `2026-07-31T16:37:16-04:00`

This record covers source ownership and import direction for P1.2. It does not
activate workers or native helpers, create IPC, or satisfy the P1 exit gate.

## Enforced Ownership

| Boundary | Trust zone | Technical owner | Runtime state | Authority |
| --- | --- | --- | --- | --- |
| `src/contracts` | Cross-boundary contracts | `architecture-contracts` | Active type contracts | None |
| `src/renderer` | Z1 | `presentation` | Chromium sandbox | None |
| `src/preload` | Z2 | `bridge-adapters` | Sandboxed Electron preload | No independent authority |
| `src/main` | Z3 | `application-coordinator` | Electron main | Coordination only; no effect authority |
| `src/workers` | Z7 | `bounded-processing` | `NOT_IMPLEMENTED` reservation | None |
| `native-helpers/policy` | Z4 | `policy-kernel` | `RESERVED` for P2 | Policy decisions only after proof |
| `native-helpers/effect-brokers` | Z5 | `effect-broker-services` | `RESERVED` for P3-P4 | Scoped effects only with valid grants after proof |
| `native-helpers/audit` | Z6 | `audit-journal` | `RESERVED` for P2 | Audit signing only after proof |

The canonical machine-readable policy is
`docs/architecture/process-ownership-v1.json`. Every application source root
must have exactly one owner. Each boundary declares its allowed first-party and
external imports, and architecture tests walk every TypeScript source file to
enforce those declarations.

## Structural Changes

- Replaced the ambiguous `src/shared` root with `src/contracts`, which contains
  data contracts only.
- Split main-process development URL validation, session policy, window
  construction, and lifecycle bootstrap into separately owned modules under Z3.
- Split preload bridge construction from the context-bridge entry point under
  Z2. The bridge remains immutable and zero-IPC.
- Added a separately typechecked Z7 worker reservation with an explicit
  `NOT_IMPLEMENTED`, no-authority contract.
- Reserved distinct filesystem roots for future Z4, Z5, and Z6 native helpers.
  The root contains documentation only; executable files fail the architecture
  check.
- Added a fifth TypeScript surface for workers and a source-graph scanner that
  rejects forbidden layer imports, unowned roots, non-literal dynamic imports,
  and non-literal `require` calls.

## Validation Results

| Command or inspection | Result |
| --- | --- |
| `pnpm run typecheck` | PASS; tooling, main, preload, renderer, and workers checked independently |
| `pnpm run test` | PASS; nine architecture tests, including ownership, import direction, reservations, and uninspectable module-loading rejection |
| `pnpm run check` | PASS; all typechecks, tests, and three production Vite builds |
| `pnpm run package` | PASS; arm64 package, nine fuses, 11 ASAR entries, and least-privilege plist unchanged |
| Packaged launch | PASS; renderer loaded from the signed ASAR and exposed the expected zero-IPC runtime snapshot |
| `pnpm run dev` | PASS; renderer loaded from `127.0.0.1:5173`, main and preload development bundles loaded, and shutdown completed with exit code 0 |

## Faults Found and Remediated

1. Source-relative paths were initially applied to main-process runtime assets,
   but Vite bundles the split modules into `dist/main/index.cjs`. Preload and
   renderer paths now resolve from the output bundle location; packaged launch
   proves the correction.
2. Packaged state was initially passed through a mutable environment variable.
   It is now an explicit `createMainWindow(isPackaged)` input, avoiding hidden
   state and a truthiness error that would have disabled development DevTools.
3. The first ownership graph exposed a retired empty `src/shared` root and an
   omitted direct `react` dependency. The root was removed and the renderer's
   declared external imports now match its source.
4. Babel initially represented dynamic imports in a form the scanner did not
   reject. Native import-expression parsing plus adversarial tests now prove
   non-literal `import()` and `require()` cannot bypass inspection.

## Known Limitations

- Ownership tests enforce application TypeScript imports. They do not replace
  runtime sandbox, IPC sender, schema, crash, or compromise tests.
- P1.3 still owns CSP, constrained application protocol, typed allowlisted IPC,
  sender validation, and explicit subframe and worker integration settings.
- P1.4 still owns the broader forbidden-authority checks for filesystem,
  database, credentials, arbitrary IPC, and process APIs.
- Z7 workers and Z4-Z6 native helpers are declarations only. No runtime or
  capability claim is made, and every capability remains `UNVERIFIED`.
- Technical owner labels define architectural responsibility; repository review
  enforcement such as `CODEOWNERS` remains a later repository-governance choice.
