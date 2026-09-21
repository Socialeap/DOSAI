# P1.4 Renderer Authority Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T17:00:02-04:00`<br>
**Decision basis:** Accepted ADR 0001 and Baseline Contracts v1<br>
**Review decision:** Owner accepted `2026-07-31T17:04:44-04:00`

This record covers static architecture enforcement of the renderer's
no-authority contract. It does not activate a capability, introduce a new IPC
operation, or complete the P1 exit gate.

## Enforced Policy

The canonical policy is
`docs/architecture/renderer-authority-policy-v1.json`. Its AST enforcement runs
over every TypeScript and TSX file under `src/renderer` and rejects:

| Category | Rejected authority |
| --- | --- |
| `raw_process` | Every Node builtin plus process, module, require, Buffer, runtime globals, worker threads, clusters, and child processes |
| `filesystem` | Node and package filesystem clients, browser file pickers and handles, file readers, and literal file inputs |
| `database` | SQLite, SQL, ORM, and network-database clients plus IndexedDB, Cache Storage, local storage, and session storage |
| `credential` | Keychain clients, credential-provider imports, browser credential and clipboard APIs, cookies, safe storage, and literal password inputs |
| `arbitrary_ipc` | Electron imports, raw IPC objects, message channels, window messaging, message listeners, WebContents access, and computed protected-root access |
| `debugger` | Debugger statements, browser debugger properties, CDP clients, Playwright, and Puppeteer |

The policy also reserves every `dosai` member path. The renderer may directly
invoke only `window.dosai.runtime.getSnapshot()` with zero arguments. Aliasing,
destructuring, computed access, alternate global roots, unknown methods,
`.call`/`.apply` rebinding, and extra arguments fail the architecture test.

Protected browser roots cannot be aliased or accessed through computed keys.
This prevents forms such as `const browser = navigator`, `window[key]`,
`Reflect.get(window, ...)`, and nested alternate bridge roots from hiding
authority from the scanner.

## Validation Results

| Command or inspection | Result |
| --- | --- |
| `pnpm run test` | PASS; 20 tests total: nine prior architecture tests, five renderer-authority suites, and six runtime-security suites |
| Current renderer scan | PASS; every renderer TypeScript and TSX file has zero authority findings |
| Malicious fixture corpus | PASS; process, filesystem, database, credential, arbitrary IPC, debugger, import, global, property, computed-key, alias, input, and bridge misuse fixtures are rejected |
| False-positive corpus | PASS; comments, strings, inert object keys, and required TypeScript ambient declarations remain allowed |
| `pnpm run check` | PASS; five typecheck surfaces, all 20 tests, and all three production Vite builds |
| `pnpm run package` | PASS after approved network retry; nine fuses, 11 ASAR entries, and least-privilege plist verified |
| Clean packaged launch | PASS; `dosai://app/` loaded and returned the pinned runtime through the sole typed bridge operation |

## Faults Found and Remediated

1. The first scanner run interpreted TypeScript's `declare global` ambient
   module name as executable access to Node's `global` object. The scanner now
   exempts only the `TSModuleDeclaration` identifier position. A separate
   `global.process` fixture proves runtime use remains rejected.
2. Dynamic computed access initially discarded its object root while building
   a member path, so `window[key]` could evade the protected-root check. Dynamic
   properties now retain an explicit computed segment, and protected roots also
   cannot be aliased. Dedicated dynamic-key and alias fixtures prove the fix.
3. The first package run could not resolve GitHub from the filesystem sandbox
   while retrieving the pinned Electron archive. The identical command passed
   with approved network access; source, lockfile, and package policy were
   unchanged.

## Known Limitations

- The scanner is syntax-aware and intentionally strict, but it is not a
  whole-program dataflow or dependency-code analyzer. Source import allowlists,
  exact dependency locks, CSP, sandboxing, context isolation, and the typed
  preload boundary remain necessary independent controls.
- Literal JSX file and password inputs are rejected. Future dynamically built
  form controls require either new AST rules or a separately reviewed brokered
  component before use.
- Architecture tests enforce source policy when the test suite runs. Mandatory
  remote checks and protected-branch enforcement belong to P4 and P11.
- The packaged engineering corpus now passes and is recorded in
  `p1-exit-evidence.md`. Formal `P1.EXIT` remains blocked by the accepted
  catalog conflict, governed-runner work, and minimum-OS evidence gap.

## Result

Renderer authority remains zero. The only cross-boundary operation is the
accepted, read-only runtime snapshot method from P1.3, and every runtime
capability remains `UNVERIFIED`.
