#!/bin/sh
set -eu

# The offline proof uses the exact installed arm64 Homebrew static archives.
# No install, dependency resolution, network I/O or app build.
[ "$#" -eq 0 ] || exit 2
cd -- "$(dirname -- "$0")/../.."
openssl_prefix=/opt/homebrew/Cellar/openssl@3/3.6.4
ssl_archive=$openssl_prefix/lib/libssl.a
crypto_archive=$openssl_prefix/lib/libcrypto.a
if ! printf '%s  %s\n' \
    a3065132277d7507ff9cbc5252f0d80c47d919efb5a403d9510b459cf3f32402 "$ssl_archive" \
    f7614ff9568acfceaf8fe328139e03a2f14eae6755e6fc7c3da52c97134470ee "$crypto_archive" |
    /usr/bin/shasum -a 256 -c --status; then
    printf '%s\n' 'Expected pinned OpenSSL 3.6.4 archives are absent or changed.' >&2
    exit 2
fi

workdir=$(/usr/bin/mktemp -d /private/tmp/dosai-mtls-v1.XXXXXXXX)
trap '/bin/rm -f -- "$workdir/offline-mtls-v1" "$workdir/offline-mtls-device-v1"; /bin/rmdir -- "$workdir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for fixture in offline-mtls-v1 offline-mtls-device-v1; do
    /usr/bin/clang -mmacosx-version-min=26.0 -std=c17 -O2 -Wall -Wextra -Werror \
        -isystem "$openssl_prefix/include" "tests/fixtures/transport/$fixture.c" \
        "$ssl_archive" "$crypto_archive" -o "$workdir/$fixture"
    # Apply a per-process OS sandbox. Refuse to run if it cannot be installed.
    /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/sandbox-exec \
        -p '(version 1) (allow default) (deny network*) (deny file-write*) (deny process-fork)' \
        "$workdir/$fixture"
done
