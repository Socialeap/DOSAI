# DOSAI Guest Build Inputs

This directory contains reviewed textual inputs for the future Linux guest
supply chain. It does not contain source archives, compilers, guest binaries,
images, or a runnable guest recipe.

## Toolchain Provider Configuration Proof

`buildroot-external/configs/dosai_toolchain_proof_defconfig` is a deliberately
non-buildable Kconfig fixture. It tests only the ADR 0017 source-provider branch
for an arm64, musl, static target under the accepted Linux/x86-64 builder model.
It is not the future full DOSAI guest defconfig.

The external tree's `external.mk` unconditionally rejects empty, build, package,
and source-fetch goals. Only configuration, defconfig listing, and package-check
goals are admitted. Copy the external tree outside the DOSAI Git worktree before
local simulation so Buildroot's metadata probe does not inspect or refresh the
repository index.

After applying the accepted patch to authenticated Buildroot `2025.02.16`, the
configuration-only procedure is:

```sh
cp -R guest-build/buildroot-external /tmp/dosai-buildroot-external-proof
make -C /path/to/buildroot O=/tmp/dosai-buildroot-config-proof \
  HOSTARCH=x86_64 \
  BR2_EXTERNAL=/tmp/dosai-buildroot-external-proof \
  dosai_toolchain_proof_defconfig
node scripts/verify-buildroot-toolchain-config.mjs \
  --requested guest-build/buildroot-external/configs/dosai_toolchain_proof_defconfig \
  --resolved /tmp/dosai-buildroot-config-proof/.config \
  --evaluation-host-os darwin
```

On macOS this is only a Kconfig simulation with `HOSTARCH=x86_64` supplied as
the accepted builder input. It is not evidence from a physical Linux/x86-64
builder and does not compile Kconfig-selected packages or the Go toolchain.

Running `make`, `make source`, `make toolchain`, or a package target with this
external tree must fail with
`DOSAI toolchain configuration proof cannot build or fetch sources`.

The full guest recipe, package closure, sealed source bundle, Linux-builder
proofs, reproducibility, SPDX, artifact composition, and runtime eligibility
remain separate gates.
