# P1.1 Runtime and Packaging Baseline

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T15:15:03-04:00`<br>
**Platform profile:** `MACOS_ARM64_V1`<br>
**Review decision:** Owner accepted `2026-07-31T16:17:50-04:00`

This record covers the P1.1 Electron shell scaffold. It does not satisfy the P1
exit gate, implement an agent execution path, or upgrade a capability from
`UNVERIFIED`.

## Exact Baseline

| Component | Exact version or state | Evidence |
| --- | --- | --- |
| Development Node | `24.18.0` LTS | `.node-version`, `package.json`, official archive SHA-256 verified as `e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1` |
| pnpm | `11.18.0` | `packageManager`, exact engine, and `pnpm-lock.yaml` |
| Electron | `43.2.0` | Exact dependency pin and packaged runtime observation |
| Chromium | `150.0.7871.129` | Packaged preload snapshot rendered by the launched application |
| Electron Node | `24.18.0` | Packaged preload snapshot rendered by the launched application |
| V8 | `15.0.1240245-electron.0` | Packaged preload snapshot rendered by the launched application |
| CDP implementation | Chromium `150.0.7871.129`; no debugger attached | P6 must select the requested protocol version and method allowlist before CDP is available |
| Native application modules | None | Direct dependency and ASAR inventory |
| Vite | `8.2.0` | Exact dependency pin |
| React | `19.2.8` | Exact dependency pin |
| TypeScript | `7.0.2` | Exact dependency pin |
| Package target | macOS `arm64`, minimum macOS `15.0` | Mach-O inspection and packaged `Info.plist` assertion |

The lockfile contains integrity records. pnpm 11 revalidates every locked entry
against a 24-hour minimum release age, blocks exotic transitive sources, allows
only the explicitly named Electron build, and uses exact direct versions.

## Implemented Boundary

- Separate main, preload, shared-contract, and renderer source roots and
  TypeScript configurations.
- Sandboxed renderer with context isolation, Node integration disabled, web
  security enabled, development-only DevTools, denied permissions, denied new
  windows, and restricted navigation.
- An immutable zero-IPC preload snapshot containing only runtime identity.
- No process-execution import anywhere under `src`; no agent execution path.
- A production ASAR containing only `package.json` and compiled application
  assets. Production source maps are excluded.
- All nine Electron 43 fuse states are declared and verified after packaging.
  Run-as-Node, Node options, CLI inspection, and non-ASAR application loading are
  disabled; cookie encryption and embedded ASAR integrity are enabled.
- The inherited Electron plist declarations for arbitrary network loads, audio,
  Bluetooth, camera, and microphone access are removed. The resulting app is
  ad-hoc signed after fuse and plist changes.

## Validation Results

| Command or inspection | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile passed supply-chain policy and exact graph restored |
| `pnpm run check` | PASS; four TypeScript configurations, five architecture tests, and three production Vite builds |
| `pnpm run package` | PASS; one arm64 `.app`, nine fuses verified, 11 ASAR entries accepted, least-privilege plist verified |
| `codesign --verify --deep --strict --verbose=2 out/DOSAI-darwin-arm64/DOSAI.app` | PASS; bundle valid on disk and satisfies its ad-hoc designated requirement |
| `file out/DOSAI-darwin-arm64/DOSAI.app/Contents/MacOS/DOSAI` | PASS; Mach-O 64-bit executable arm64 |
| Packaged `LSMinimumSystemVersion` assertion | PASS; `15.0` |
| Packaged launch and accessibility inspection | PASS; expected local-shell empty state and exact runtime versions visible, with no permission prompt or unexpected navigation |

## Faults Found and Remediated

1. Electron Forge 7 pulled an exotic transitive Git dependency rejected by the
   pnpm supply-chain policy. The scaffold uses Electron-maintained
   `@electron/packager`, `@electron/fuses`, and `@electron/asar` instead of
   weakening policy or adopting a prerelease Forge major.
2. Electron 42 and later no longer download their binary through `postinstall`.
   The development launcher now starts through Electron's CLI so the official
   checksum-verified on-demand installer runs on a clean checkout.
3. Packager returns a platform output directory, not the nested `.app` path. The
   fuse target now resolves and asserts the exact bundle, executable, ASAR, and
   plist paths.
4. The first ASAR whitelist modeled only files and rejected legitimate directory
   records. Directory and payload-file allowlists are now separate, while source
   maps and unexpected entries remain rejected.
5. Electron's stock plist exposed unused permission descriptions and arbitrary
   transport loads. Structured plist sanitation removes them before re-signing.
6. Electron's stock plist declared macOS 12. The package now asserts the accepted
   `MACOS_ARM64_V1` minimum of macOS 15.0.

## Known Limitations

- The bundle is ad-hoc signed for local proof. Developer ID signing, Hardened
  Runtime entitlements, notarization, update signing, and release distribution
  remain P11 work.
- The bundle is Apple Silicon only and has been smoke-tested on the current Mac;
  minimum-macOS physical-hardware proof remains outstanding.
- The shell intentionally exposes no operational IPC, workers, native helpers,
  persistence, browser inspection, Git, skills, packets, or agent execution.
- The packaged renderer currently loads over `file://`, so
  `GrantFileProtocolExtraPrivileges` remains enabled. P1.3 must introduce a
  constrained application protocol and disable this fuse before `P1.EXIT`.
- P1.2 through P1.4 and `P1.EXIT` remain incomplete. All 36 acceptance suites
  remain `NOT_IMPLEMENTED`, and every runtime capability remains `UNVERIFIED`.
- Product branding, a final icon, the full Tailwind/Lucide dashboard, crash and
  recovery testing, accessibility conformance, and performance baselines remain
  future work.
