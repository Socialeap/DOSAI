# Sourced by the two fixed offline fixture launchers.
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

build_offline_fixture() {
    /usr/bin/clang -mmacosx-version-min=26.0 -std=c17 -O2 -Wall -Wextra -Werror \
        -isystem "$openssl_prefix/include" "tests/fixtures/transport/$1.c" \
        "$ssl_archive" "$crypto_archive" -o "$2"
}
