#!/bin/sh
set -eu

# The offline proof uses the exact installed arm64 Homebrew static archives.
# No install, dependency resolution, network I/O or app build.
[ "$#" -eq 0 ] || exit 2
cd -- "$(dirname -- "$0")/../.."
. tests/source-only/offline-mtls-build-v1.sh

workdir=$(/usr/bin/mktemp -d /private/tmp/dosai-mtls-v1.XXXXXXXX)
trap '/bin/rm -f -- "$workdir/offline-mtls-v1" "$workdir/offline-mtls-device-v1" "$workdir/offline-mtls-drivers-v1" "$workdir/offline-mtls-activation-v1"; /bin/rmdir -- "$workdir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for fixture in offline-mtls-v1 offline-mtls-device-v1 offline-mtls-drivers-v1 offline-mtls-activation-v1; do
    build_offline_fixture "$fixture" "$workdir/$fixture"
    # Apply a per-process OS sandbox. Refuse to run if it cannot be installed.
    /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/sandbox-exec \
        -p '(version 1) (allow default) (deny network*) (deny file-write*) (deny process-fork)' \
        "$workdir/$fixture"
done
