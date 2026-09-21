# P3 Watchdog LaunchAgent Static Package Evaluation

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-04T14:39:25-04:00`<br>
**Proposal validated:** `2026-08-04T14:43:23-04:00`<br>
**Owner accepted:** `2026-08-04T23:34:01-04:00`<br>
**Signing authorized:** `2026-08-05T14:04:01-04:00`<br>
**Implemented:** `2026-08-05T14:12:46-04:00`<br>
**Validated:** `2026-08-05T14:21:29-04:00`<br>
**Owner accepted v28:** `2026-08-05T19:01:24-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v26 over accepted v25<br>
**Accepted design gate:** Process ownership v27 over accepted v26<br>
**Accepted evidence generation:** Process ownership v28 over accepted v27

## Question

Choose the smallest step after the accepted source-plist proof that can establish
exact plist placement and signed package integrity without registering,
loading, launching, or connecting to the service.

## Current Boundary

Accepted process ownership v26 binds one source-only LaunchAgent plist and its
adversarial parser test. The plist declares only the fixed `Label`,
bundle-relative `BundleProgram`, and one true `MachServices` entry. It is absent
from the retained signed app.

Accepted process ownership v24 separately binds the signed named-service
executable under `Contents/Library/LaunchServices`. Its owner authorization did
not include a LaunchAgent plist. Adding that plist changes the signed outer app
contents and therefore requires a fresh, exact owner signing authorization.

## Options Evaluated

### Modify The Existing Named-Service Package Mode

Rejected. The accepted `--static-named-service-fixture` mode is evidence for a
plist-free package. Changing its semantics would blur the v24 baseline and make
regression comparison harder.

### Package And Register In One Step

Rejected. `SMAppService.register()` can make the helper eligible to launch
subject to user consent. Registration states and physical launch behavior need
their own owner-gated evidence after package structure is proven.

### Copy The Plist Without Signing The Result

Rejected. Apple requires apps using `SMAppService` to be code signed, and an
unsigned composition would not establish the intended nested/outer integrity
ordering.

### Add A Distinct Static Plist-Bearing Package Mode

Selected. After v27 acceptance and separate exact signing authorization, add
one new mode:

`--static-named-service-launch-agent-fixture`

The mode may build the already accepted named-service executable, copy the
accepted source plist to the exact LaunchAgents location, sign nested code
before the outer app, verify both signatures and the plist, and retain only the
local generated package. It may not invoke any packaged executable.

## Exact Package Contract

The package may contain exactly:

- executable:
  `Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture`;
- LaunchAgent declaration:
  `Contents/Library/LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist`.

The packaged plist must be byte-identical to source SHA-256
`b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5`
and parse to the accepted three-key value. The package script must preserve the
existing package modes and reject combined, unknown, or extra arguments.

The nested executable must retain identifier
`com.socialeap.dosai.execution-service-fixture`; the outer app must retain
identifier `com.socialeap.dosai`. Both signatures must use the exact
owner-authorized selector and observed TeamIdentifier, pass strict verification,
and satisfy exact designated requirements. The plist must be copied before the
outer app is signed.

## Implemented Files

- `scripts/package.mjs`
- `tests/security/p3-watchdog-launch-agent-packaging-candidate.test.mjs`

The package script preserves every accepted mode and adds only the exact
`--static-named-service-launch-agent-fixture` mode. The new security test proves
strict argument admission, input and copy integrity, signing order, exact final
layout, and absence of registration, launch, connection, or other effects.

## Required Signing Authorization

Implementation required the repository owner to explicitly authorize test-only
use of:

- signing selector `UMXN25Z493`;
- TeamIdentifier `3RD3TADLRY`;
- nested identifier `com.socialeap.dosai.execution-service-fixture`; and
- containing app identifier `com.socialeap.dosai` with the accepted LaunchAgent
  plist at the exact path above.

The owner granted that authorization on `2026-08-05T14:04:01-04:00`. It applies
only to the fixed local test package mode and does not authorize production
signing, registration, launch, or broader use of the identity.

## Required Implementation Checks

After both gates are satisfied, the implementation must prove:

1. argument admission selects only the distinct fixed mode;
2. the accepted source plist and all accepted Swift inputs match their hashes;
3. only the exact nested executable and plist are added under
   `Contents/Library`;
4. the packaged plist is a regular non-symlink file, byte-identical to source,
   and parses to exactly the accepted value;
5. nested signing completes before plist copy and outer signing, and both final
   signatures pass strict and designated-requirement verification;
6. no anonymous fixture, LaunchDaemon plist, extra LaunchAgent plist, or
   executable invocation exists; and
7. no Service Management, `launchctl`, registration, unregistration, load,
   launch, or application connection occurs.

## Authority Boundary

Accepted v27 defines package-script and adversarial-test scope only. The
separate signing authorization opened and has now been consumed only for that
implementation and local proof. Neither v27 nor accepted v28 authorizes:

- `ServiceManagement` imports or `SMAppService` calls;
- `launchctl` or direct launchd operations;
- installation, registration, unregistration, loading, or launch;
- DOSAI application connection or runtime use;
- VM, process, filesystem-data, network, journal, reconciliation,
  ownership-release, or production behavior.

The plist is declarative and would become eligible for later registration only
after package composition. Merely placing it in an unregistered local test app
does not constitute registration evidence.

## Proposal Validation Evidence

Proposal validation proved:

1. v27 is hash-bound to immutable accepted v26 SHA-256
   `757879f93a098b52432cf853dd7ad5b89a1a3d7abe7b0509d6d3095e8f7e87fb`;
2. v27 changes only the package proposal fields and four invariants;
3. all ten immutable source/package inputs and two proposal guard updates match;
4. the package script remains SHA-256
   `f02a4fcc91af64d7a44d52354b24c033673bcf5143f6ef62fb9becf348a3a4fb`;
5. the new package mode and security test remain absent;
6. the retained v24 package hashes and plist-free layout remain unchanged; and
7. pinned typecheck, full tests, and production build pass.

The validated proposed process ownership v27 had SHA-256
`83e334410e6b7becf070b9534ccf1b71a54ef28c57535e97221d6bdbeb5770c3`.
The focused v25-v27 ownership suite passes all 15 tests. The pinned full
validation passes eight TypeScript projects, all 393 repository tests, and all
three production builds. JSON parsing, immutable-input and proposal-guard
hashes, proposed-file absence, retained-package layout and hashes, whitespace,
and secret-pattern checks pass.

The retained v24 package remains plist-free. Its nested executable SHA-256 is
`9e5c9770efaca692f06696fc2e082a13733c3706eeb8799974bf5b9b03b26eec`,
outer executable SHA-256 is
`3f0ee1b7e035369efc70a234f454164ac2d1da5e7bc36efbb3f6f280c9b95c02`,
and `Info.plist` SHA-256 is
`6661b003e633cff83c1e6311a387ce205c93538801043c4fe5065ab52dc219e7`.
No identity lookup, signing, package-script invocation, package mutation,
registration, launch, or application connection occurred during this proposal
validation. Pnpm emitted its existing stale `node_modules` warning; dependency
files and lock state were not changed.

## Implementation Evidence

The authorized implementation produced one retained local test package through
the exact command:

```text
node scripts/package.mjs --static-named-service-launch-agent-fixture
```

The script validated all accepted Swift and plist source hashes, built and
signed the nested service first, copied the accepted plist, and signed the outer
app last. It then verified strict signatures, exact designated requirements,
identifier and TeamIdentifier bindings, arm64 architecture, minimum macOS 15,
linked libraries, and the complete two-entry `Contents/Library` tree. No
packaged executable was invoked.

The retained package evidence is:

| Artifact | SHA-256 or CDHash |
| --- | --- |
| Nested named-service executable | `3ccacfdcc6b26f09ad35f830e536c3ab326ee2a6a4dee538d66a7190580529d9` |
| Packaged LaunchAgent plist | `b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5` |
| Outer DOSAI executable | `933d34625252b585e507b448787d3bbed6a9bc2d6ba22039934bbf40cb82adf4` |
| Outer `Info.plist` | `6661b003e633cff83c1e6311a387ce205c93538801043c4fe5065ab52dc219e7` |
| Nested signature CDHash | `fa71d6d109ae21ac3edafbe73b541c824817db8a` |
| Outer signature CDHash | `576df4913a3a202aca20bec2a57e2fa7702e6f79` |

Both signatures report TeamIdentifier `3RD3TADLRY` and the exact authorized
identifiers. The packaged plist is a mode-`0644` regular non-symlink file,
byte-identical to the accepted source, and parses to exactly its three accepted
keys. The only `Contents/Library` entries are its LaunchAgents path and the
nested LaunchServices executable; there is no LaunchDaemon.

A read-only strict `codesign` verification from the restricted validation shell
reported `CSSMERR_TP_NOT_TRUSTED` because that shell could not see normal
Keychain trust. The same immutable package passed strict and exact designated-
requirement verification with normal Keychain access, as it also did during the
authorized package command. This is an environment visibility limitation, not
a concealed signature failure.

Accepted process ownership v28 binds:

- package implementation SHA-256
  `f5691b71a94d99f2800cb7cba58cfc7fc58545d79fb57d1bda21d385119d840c`;
- adversarial package-test SHA-256
  `817daa4c5653c3d583e5b663a2d81cbfd54854e81d14226e3b4b639855682813`;
- fifteen narrow successor-aware historical guard remediations; and
- the generated artifact identities, trust-context disclosure, and all
  no-effect observations.

Its validated proposal SHA-256 was
`896f06890e49fd35bcdb097f179ce9a3bbebf2f5c7d81ad46295afa49c740c17`.
After owner acceptance, its final immutable SHA-256 is
`11e2595b60f765a3368606f835a2a245f69b98ade60800df37ad409bb3f4edd9`.

Pinned Node `24.18.0` and pnpm `11.18.0` validation passes:

```text
pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
403 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

Pnpm repeated the documented stale `node_modules` workspace warning and used
the installed lockfile dependencies without modifying dependency or lock files.

## Known Limitations

- Static package composition does not prove `SMAppService` lookup,
  registration, user approval, denial/disable states, on-demand launch, named
  XPC messaging, crash behavior, or service lifetime.
- Development signing proves only the exact local test identities, not hardened
  runtime, release signing, notarization, or production eligibility.
- The generated app can be manually launched outside this workflow; the
  proposed implementation prevents invocation during evidence generation but
  does not claim the artifact is a system sandbox.

## Owner Decision

The owner accepted process ownership v27 on `2026-08-04T23:34:01-04:00`.
That design-acceptance state had SHA-256
`189e1761c3a9f354d6df473d14fbb40fd37191ed922bffcf230b27ac51830b85`.
Post-acceptance validation on `2026-08-04T23:37:50-04:00` passed all 15
focused ownership tests, eight TypeScript projects, 393 repository tests, and
three production builds with the pinned Node 24.18.0 and pnpm 11.18.0
toolchain.

On `2026-08-05T14:04:01-04:00`, the owner granted the separately required
test-only authorization for the exact P3.4 scope listed above. The accepted
authorization-state v27 has SHA-256
`932ad6f09d2e852469ba72b9dc340c857ee37752d071967b2159a387752e4374`.
The authorization permits the two proposed implementation changes and exact
local signing proof only. It does not authorize registration, loading, launch,
application connection, production signing, or any broader identity use.

The exact authorized implementation and physical static-package proof completed
on `2026-08-05T14:12:46-04:00`; full validation completed on
`2026-08-05T14:21:29-04:00`. The owner accepted process ownership v28 on
`2026-08-05T19:01:24-04:00`. Registration, loading, launch, application
connection, and production use remain unimplemented and unauthorized.
