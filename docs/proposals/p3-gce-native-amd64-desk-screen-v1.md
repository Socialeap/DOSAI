# Compute Engine native AMD64 builder desk screen

**Source-only candidate. Intake incomplete. Native-builder readiness NO_GO.**

Run this lane independently of the
[M4 Linux ARM64 Claude candidate](m4-linux-arm64-claude-worker-qualification-v1.md).
The observed standard GitHub x64 runner class failed the single-mount gate.
Keep that rejection in force. Review a preprovisioned clean native pair
using the existing [native-host profile](../architecture/p3-native-host-profile-v1.json),
[writer-boundary design](../architecture/p3-native-writer-boundary-design-v1.json),
and [ADR 0018](../decisions/0018-native-linux-independent-builders.md).
No pair is selected or available on the evidence reviewed here.

## Candidate and current evidence

Google documents the x86 N2 class and the x86 Debian 13 family,
`debian-cloud/debian-13`. Use two distinct `n2-standard-4` instances
as the sizing example for a possible read-only observation. The
family documents 4 vCPU and 16 GB per instance. Actual availability,
build fit, architecture inside both instances and the native Docker
server remain to be established. An image family is a moving pointer.
Exact image ID, build, deployed kernel package, source and patch digest
are prerequisites for a later profile review.

[Compute machine families](https://docs.cloud.google.com/compute/docs/general-purpose-machines#n2_machine_series) ·
[Compute OS images](https://docs.cloud.google.com/compute/docs/images/os-details)

| Gate | Desk-screen result and next evidence |
| --- | --- |
| Account and zero incremental cost | **Unknown.** The general Free Tier lists one eligible `e2-micro`, which supplies no entitlement for a pair of N2 instances. Free Trial eligibility requires no prior paid Google Cloud, Maps Platform or Firebase use and no prior trial. An attached payment method does not establish eligibility. Before advancing, require authorized read-only proof of the exact account's eligible, unexpired entitlement for both instances and associated storage, networking and cleanup. Hold if any cost can reach the user. |
| Native independent pair | **Unknown.** Require two fresh distinct native x86-64 instances with native Docker AMD64. Verify pinned image and kernel, distinct instance identities, and separate writable disks, daemons, caches and directories. Keep provisioning, package installs, and workloads out of a read-only observation. |
| Single effective registry | **Unknown.** Require present topology evidence for exactly one full-root `binfmt_misc` mount at the target, no submounts, zero registrations and the same effective registry the build would use. A provider image label, filtered mount view or synthetic empty mount cannot qualify. Keep registry-removal authority unavailable. |
| Full-interval writer exclusion | **Unknown.** Require an enforceable boundary covering privileged writers and host/provider administrative paths for the entire interval. Bind namespace, registry, kernel, policy version, writer inventory, epoch, generation, and independently verified clock. Boot integrity telemetry and snapshots cannot establish runtime writer exclusion. |
| Independent evidence | **Unknown.** An independently authorized control-plane inventory can propose exact project, zone and immutable instance ID bindings from the provider. An instance identity assertion identifies an instance. It carries no proof of writer state, mount topology or host approval. A separate issuer must establish provenance, freshness and replay controls for the exact observer and reviewed profile. Keep the build workers free of provider credentials and metadata-service access. |

[Google Cloud Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features) ·
[Compute instance identity](https://docs.cloud.google.com/compute/docs/instances/verifying-instance-identity) ·
[Compute read-only instance record](https://docs.cloud.google.com/compute/docs/reference/rest/v1/instances/get) ·
[Boot integrity monitoring](https://docs.cloud.google.com/compute/shielded-vm/docs/integrity-monitoring)

## Next qualification gate

Reuse the [existing intake worksheet](p3-native-builder-intake-template-v1.json).
Its 24 required fields remain unknown for this candidate. Public
platform documentation provides a candidate and a way to ask for proof.
It cannot mark any of the instance-bound fields complete. Hold before
host selection until an available pair, a verified zero-cost basis,
and a credible single-mount and writer-exclusion design are documented.

After those prerequisites and separate owner authorization, prepare the
smallest provider-specific read-only projection with equivalent existing
predicates. Require exact host labels, pinned image and kernel
evidence, observer scope, cost, and independent issuer requirements
before considering activation. Older GitHub dispatch authority is
consumed. No host changes, provisioning, dispatch, guest execution, build,
provider spend or model requests are authorized by this screen.

The path has **0 of 2 qualifying receipts**. Two accepted build and
cleanup receipts, P3 physical acceptance, and supervised owner QA
remain separate gates. No migration, backend configuration, deployment,
Lovable action or Publish step is required for this source review.
