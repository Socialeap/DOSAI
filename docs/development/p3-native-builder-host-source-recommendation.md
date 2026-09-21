# P3 native Linux builder host-source recommendation

**Status:** Proposed for owner review  
**Recorded:** 2026-09-21 01:20 EDT  
**Scope:** Host-feasibility observation only; no workflow or runner action

## Outcome

Two standard GitHub-hosted `ubuntu-24.04` jobs are a credible zero-charge
candidate for the two fresh native-x64 host environments required by ADR 0018.
They are not yet accepted or verified DOSAI builders. GitHub documents the
standard public-repository runner as a fresh VM for each job, with x64
architecture, and currently makes standard runner usage free for public
repositories. DOSAI is currently public, repository Actions are enabled, all
actions are allowed, and the repository has no workflow file.

The exact recommendation is recorded in
`docs/architecture/p3-native-builder-host-source-recommendation.json`. It
proposes only one later, separately authorized, manual host-observation run with
two jobs. It does not propose loading the future builder image, acquiring guest
inputs, compiling anything, or treating hosted-runner availability as builder
evidence.

Primary sources:

- [GitHub-hosted runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Runner context reference](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Official runner-image repository](https://github.com/actions/runner-images/blob/main/README.md)

## Required fail-closed observation

The future observation, if accepted and authorized, must be a
`workflow_dispatch`-only workflow with no permissions, checkout, actions,
secrets, cache, artifact upload, paid runner, builder image, container, or guest
execution. Each of two jobs records the workflow/job identity, runner context,
exact hosted image version, kernel, `x86_64` machine value, Docker server
architecture, active `binfmt_misc` state, and DMI product UUID.

GitHub explicitly warns that `runner.name` may not be unique, so it cannot prove
independence. Both DMI UUIDs must be present and different. Missing or equal
identities, a non-x64 layer, an active emulation interpreter, missing image
version, any paid runner class, or any unexpected charge stops the path. Failure
means DOSAI needs another native-amd64 provider; it does not permit weakening
ADR 0018.

Even a successful observation proves only that two candidate native host VMs
were available. It cannot produce either builder receipt. The accepted,
digest-pinned OCI archive and sealed source bundle must first exist, and the
later build run must separately prove `--pull never`, network isolation,
read-only inputs, immutable root, dropped capabilities, fresh writable state,
cleanup, exact outputs, and report comparison.

## Cost and authority

The repository was public when observed, and GitHub's current documentation
states standard hosted runners are free for public repositories. The proposed
observation therefore has a hard `$0` ceiling and must not use larger runners or
retained Actions storage. This is separate from, and does not consume, DOSAI's
120-credit operational ceiling. Billing and repository visibility are mutable
external facts and must be rechecked immediately before any run.

All workflow, runner, network, image, build, artifact, provider-spend, and
production authorities remain false. Owner acceptance of the recommendation and
a separate exact authorization are required before even the host observation.

**Release classification:** Research, recommendation, governance test, and
documentation only. No Lovable action is required. No frontend Publish is
required.
