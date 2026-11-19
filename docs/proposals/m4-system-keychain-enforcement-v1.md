# M4 System Keychain enforcement design v1

**Proposed. Source-only. The System Keychain gate remains held.**

## Selected candidate

Keep Keychain service access at `DENY_ALL`. Qualify only a stock Claude Code
worker that can authenticate its existing subscription from a vendor-created
credential file inside the dedicated profile. The M4 candidate avoids granting
the worker any System Keychain path in the first place. The opaque credential
remains under the vendor client's control. The supervisor handles only
nonsecret path and file identity metadata.

A standard macOS user separates login Keychains. Apple also documents a
shared System store in the file-based search list. A profile name selects the
vendor's credential entry, and a search-list query describes its caller's
scope. Neither constrains the stock worker's ability to reach the shared
store. A broad Mach allow rule, a supervisor query narrowed with
`kSecMatchSearchList`, and metadata that omits the System store all leave the
gate held. Existing Keychain settings, access lists and default search lists
stay unchanged.

[Apple Keychain architecture](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains?changes=_3_8) ·
[Apple caller-scoped search](https://developer.apple.com/documentation/security/ksecmatchsearchlist)

## Required proof before startup qualification

| Gate | Required evidence |
| --- | --- |
| Vendor-backed sign-in | Confirm the exact reviewed stock client can save and use the owner's subscription in a scoped file through an officially supported sign-in flow. Keep equivalent provider terms under review. The earlier pinned login failed to save in the disposable profile. The successful login subsequently verified on the M4 was Keychain-backed. The file route remains unproven. |
| Profile file | The vendor creates the file in the private, owner-only profile. Validate metadata and bind the reviewed directory and credential file identity across startup. Reject redirects, multiple hard links, replacement or scope drift, broad permissions and shared mounts. One path check does not establish stable identity. Neither DOSAI nor its supervisor opens, copies or brokers credentials. |
| Deny all credential services | Prove effective denial for the exact worker. Block Keychain and relay service access, inherited credential-capable handles, helpers and fallback accounts. The existing startup fence is rehearsal evidence. Denying service lookup alone does not audit already inherited rights. |
| Deny direct store access | Independently prove that off-profile storage, System Keychain files and reachable aliases or mounts cannot supply credentials. Include the ordinary user's profile. Use no mutation, enumeration or content reads against real Keychain items. |
| Disposable negative control | In a separately approved disposable environment, show that the reference can read a harmless synthetic item and the candidate is denied that same item under the proposed policy. Missing-item and ambiguous errors hold. Bind the control to the reviewed policy digest. |
| Physical M4 binding | Before carrying any result forward, independently review the effective denial mechanism and bind it to the exact M4/OS build, approved standard-user session, pinned stock executable, same worker start identity and policy digest. Check before startup and at readiness. Disposable evidence alone has no physical scope. If an enforceable boundary cannot be shown, hold before sign-in. |
| No-inference startup and Stop | Under a separately approved plan, deny all network including loopback, execute only the startup handshake, revoke authority on Stop, terminate the owned process, and reject late or replayed output. A different credential mode, policy, platform, process or vendor digest requires fresh review. |

[Claude Code credential storage](https://code.claude.com/docs/en/authentication#credential-management) ·
[Anthropic stock-client authentication terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)

## Source rehearsal and stop condition

The [design model](../../tools/local-coordination-pilot/m4-system-keychain-enforcement-design.mjs)
accepts bounded synthetic assertions with the reviewed baseline, client pin,
and fictional policy scope. The [offline tests](../../tests/coordination/m4-system-keychain-enforcement.test.mjs)
cover invalid credential sources, Mach and file paths, missing positive
controls, disposable scope confusion, policy or process drift, and Stop.
A complete synthetic trace carries zero host, sign-in, launch, or builder
authority. The existing runner and credential denial policy are unchanged.

```sh
node --test tests/coordination/m4-system-keychain-enforcement.test.mjs
```

**Next feasibility gate:** confirm a supported file-backed subscription
route for the exact pinned client without Keychain or billing changes. If the
stock client provides only the Keychain-backed login in the admitted setup,
there is no reviewed conforming route. Stop before building a launcher or
loosening the existing fence.

No native execution, provisioning, host or Keychain changes, model requests,
or live run is authorized by this design. Preserve the physical qualification,
billing verification, explicit local approval, private-beta and native-builder
gates in the [qualification plan](m4-claude-login-qualification-v1.md).
PRs #52 and #53 remain drafts. No migration, deployment, Lovable action,
or Publish step is required.
