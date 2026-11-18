#!/bin/sh
set -eu

# Run this launcher without holding codex-heavy. It obtains the lock separately
# for the temporary compile and the foreground SQLite integration tests.
[ "$#" -eq 1 ] || exit 2
case "$1" in
    /*/bin/node) node=$1 ;;
    *) exit 2 ;;
esac
[ "$("$node" --version)" = v24.18.0 ] || exit 2
cd -- "$(dirname -- "$0")/../.."
workdir=$(/usr/bin/mktemp -d /private/tmp/dosai-mtls-policy-v1.XXXXXXXX)
trap '/bin/rm -f -- "$workdir/offline-mtls-activation-v1"; /bin/rmdir -- "$workdir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$HOME/.local/bin/codex-heavy" /bin/sh -ec '
    . tests/source-only/offline-mtls-build-v1.sh
    build_offline_fixture offline-mtls-activation-v1 "$1"
' -- "$workdir/offline-mtls-activation-v1"

"$HOME/.local/bin/codex-heavy" /usr/bin/env -i PATH=/usr/bin:/bin \
    DOSAI_OFFLINE_MTLS_NATIVE="$workdir/offline-mtls-activation-v1" \
    /usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*)' \
    "$node" --test tests/source-only/offline-mtls-policy-v1.test.mjs
