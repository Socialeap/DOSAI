# M4 dedicated Claude Code login qualification v1

**Proposed. Source review only. No host qualification authorized.**

## Scope and current evidence

Qualify a dedicated, standard macOS login on the M4 for a startup-only check
of the owner's existing Claude subscription under [ADR 0022](../decisions/0022-one-run-existing-account-coordination-review.md).
The owner signs in directly through stock Claude Code after qualification.
The candidate sends zero model requests and starts no live review. All
existing Keychain and billing settings stay unchanged.

At merged baseline `015b332e911faca704dfa8c9f6c273757e9fc2b2`, the pinned
Claude Code `2.1.314` CLI confirmed subscription sign-in and the isolated
profile when Keychain access was available and networking was denied.
The profile had no credential file. With Keychain access denied, the
startup-only launcher stopped both processes after initialization and Claude
reported `SIGNED_OUT`. That result remains the hold for signed-in
cancellation. `CLAUDE_CONFIG_DIR` selects Claude's credential entry.
The supported boundary to qualify here is a separate macOS user login.
Apple also documents that a file-based Keychain search can include the
shared System keychain, so the separate login alone is insufficient.

[Claude credential storage](https://code.claude.com/docs/en/authentication#credential-management) ·
[Apple macOS Keychain architecture](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains?changes=_3_8) ·
[Apple standard users](https://support.apple.com/en-gb/guide/mac-help/mchl3e281fc9/26/mac/26)

## Gates in order

### 1. Source review and authorization

Review the exact M4 and macOS build, standard-user login plan, fixture
locations, pinned vendor executable and supervisor, receipt shape, and
cleanup scope. The owner separately authorizes the exact local account
setup or reuse and the no-inference fixture run before any host change.
The proposal itself grants neither. Hold if an existing account contains
other credentials or shares browser data, iCloud Keychain, Keychain files,
home directories, repositories, or mounted workspaces.

Keep the pinned CLI at the reviewed SHA-256
`21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed`.
Stage only reviewed artifacts readable by the dedicated user when later
authorized. No writable sharing with the owner's checkout or usual Claude
profile. A different binary, OS build, launcher, or credential boundary
requires fresh review.

### 2. Qualify an empty login with synthetic fixtures

Start the supervisor and worker inside the candidate login session.
Bind startup to actual OS user and login-session identity, exact process
start identity and executable, a private inherited channel, and a short
deadline. A name, `HOME`, `CLAUDE_CONFIG_DIR`, or CLI response alone
cannot establish these properties. Fail closed on an identity change,
logout, disconnect, unobserved readiness, or missing evidence.

The startup worker has an empty working directory, a private profile,
an explicit small environment, blocked off-profile file access and
child execution, and all network denied. Preserve the current
Keychain-denied launcher as the baseline. Review any exception to service
lookup for the new login as a distinct candidate. Do not grant unrestricted
credential-service access or use a shared user's Keychain search-list
setting as enforcement. The stock CLI continues to own its authentication.

| Check | Evidence required |
| --- | --- |
| Intended login | Positive readiness from the pinned process in the dedicated session. The wrong UID or login session, a stale worker, and a changed executable each fail before accepting readiness. |
| User Keychain confinement | The intended synthetic fixture is usable through the proposed scope. A synthetic fixture available from the control user is denied from the candidate login. Use control checks to distinguish denied access from a missing fixture. |
| System Keychain boundary | Identify the exact effective shared credential paths. Require an enforceable basis for blocking unauthorized System Keychain credential access and a representative negative fixture. A lack of visible items or a single denied query cannot prove the boundary. |
| Other host access | Verify denied reads and writes outside the profile, access to the ordinary user's home, subprocess launch, and outbound network including loopback. Keep the worker disconnected from Codex's profile and other agents. |
| Startup and Stop | Accept only the fixed startup control flow. Check process identity at readiness and prove Stop revokes authority, terminates the owned worker, and rejects late or replayed messages. Exercise the pre-readiness and post-readiness cancellation paths. |
| Evidence and cleanup | Store only a bounded local receipt. Verify fixture cleanup and process exit before closing the qualification window. Ambiguous ownership or cleanup keeps the gate held. |

Use synthetic credential and file canaries only. Use a disposable control
login for the cross-user fixture and leave the ordinary Keychain untouched.
Exercise a shared-System
canary in an independently authorized disposable environment if creating it
would require writing a System keychain. Do not create it in the M4's
existing System keychain. The disposable result can test the mechanism.
Admission on the M4 still requires matching enforcement and evidence for
its effective credential scope. If there is no enforceable System
credential denial for the stock worker, stop before sign-in. Do not query,
export, copy or inventory the owner's real Keychain items.

### 3. Sign in and verify startup only after all fixture checks pass

After fixture acceptance and owner approval of the exact session, the owner
signs in directly through the stock Claude Code vendor flow in the
dedicated login using the existing subscription. Use a fresh isolated
vendor profile and browser session. DOSAI does not handle tokens, OAuth
codes, credentials, or sign-in links. Keep the earlier everyday login
entry and Keychain settings untouched.

With all network denied, verify that native status reports Claude
subscription authentication for the admitted profile. Run only the fixed
initialization control message used by the [startup probe](../../tools/local-coordination-pilot/startup-only-launcher.py).
Require pinned readiness, process termination on Stop, and rejection of any
late or stale output within the same admitted login session. Capture separate
status and cancellation outcomes. A fallback auth method, an unavailable
credential store, or required provider traffic holds the check.

[Anthropic authentication and stock-client terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)

## Receipt and limits

Record plan version and source SHA, exact host and OS build, binary and
supervisor digests, local scope identifier, test results, denied branches,
startup authentication mode, Stop and cleanup results, and the zero
inference outcome. Record only proof of identity matches and bounded
results. Exclude raw auth output, personal identity, credential material,
and Keychain item names. Mark missing evidence as held.

A pass covers only this Claude startup session. Effective model tool access,
provider egress, and a protected cross-user connection to Codex need their
own reviewed evidence. No launch or spend authority follows. Keep PRs #52
and #53 in draft, and retain billing verification and explicit local owner
approval before any live run. [Native-builder admission](../decisions/0018-native-linux-independent-builders.md)
and all private-beta gates remain in effect. This plan requires no migration,
secret setup by DOSAI, deployment, Lovable action, or Publish.
