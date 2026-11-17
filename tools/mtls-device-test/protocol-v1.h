// Internal v1 protocol primitives for the standalone fixture tools.
#ifndef DOSAI_FIXTURE_MTLS_PROTOCOL_V1
#define DOSAI_FIXTURE_MTLS_PROTOCOL_V1

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include <openssl/err.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>
#include <openssl/ssl.h>
#include <openssl/x509v3.h>

#if OPENSSL_VERSION_MAJOR != 3 || OPENSSL_VERSION_MINOR != 6 || OPENSSL_VERSION_PATCH != 4
#error "Expected OpenSSL 3.6.4 headers"
#endif

enum {
    M1, M4, ENDPOINTS,
    DIGEST = 32, SESSION = 16, PREAMBLE = 12, FRAME = 238,
    CERT_LIMIT = 4096, BIO_LIMIT = 8192, WIRE_LIMIT = 65536, IO_LIMIT = 262144,
    SEQUENCE_AT = 12, SESSION_AT = 16, M1_PIN_AT = 32, M4_PIN_AT = 64,
    MESSAGE_AT = 96, CORRELATION_AT = 112, NONCE_AT = 128, DIGEST_AT = 144,
    PAYLOAD_AT = 176, TAG_AT = 206
};

static const unsigned char alpn[] = "dosai-fixture-lan/1";
static const char action[] = "SUMMARIZE_FIXTURE";
static const unsigned char payload[] = "{\"action\":\"SUMMARIZE_FIXTURE\"}";
static const unsigned char preamble[PREAMBLE] = {
    'D', 'S', 'F', '1', 1, 1, 1, 1, 0, PAYLOAD_AT, 0, sizeof(payload) - 1
};
static const unsigned char sequence[] = {0, 0, 0, 1};
static const unsigned char zeros[SESSION] = {0};

#define CHECK(condition) do { \
    if (!(condition)) { \
        fprintf(stderr, "not ok - fixture assertion at source line %d\n", __LINE__); \
        exit(EXIT_FAILURE); \
    } \
} while (0)

_Static_assert(sizeof(alpn) == 20, "ALPN size");
_Static_assert(PAYLOAD_AT + sizeof(payload) - 1 == TAG_AT, "payload size");
_Static_assert(TAG_AT + DIGEST == FRAME, "frame size");

typedef struct {
    EVP_PKEY *key;
    X509 *cert;
} Identity;

typedef struct {
    const Identity *identity;
    X509 *trust;
    X509 *pin;
    const char *group;
    const char *suite;
    int version;
    bool omit_certificate;
    bool omit_alpn;
    bool wrong_alpn;
    bool confirmed;
} Config;

typedef struct {
    SSL_CTX *context;
    SSL *tls;
    BIO *wire;
    size_t moved;
    unsigned char pin[DIGEST];
    unsigned char key[DIGEST];
    unsigned char session[SESSION];
} Endpoint;

typedef enum {
    PENDING, REVIEW, REJECT_GATE, REJECT_LIMIT, REJECT_TLS,
    REJECT_FRAMING, REJECT_AUTH, REJECT_PAYLOAD
} Result;

static void add_extension(X509 *cert, int nid, const char *value)
{
    X509_EXTENSION *extension = X509V3_EXT_conf_nid(NULL, NULL, nid, value);
    CHECK(extension != NULL && X509_add_ext(cert, extension, -1) == 1);
    X509_EXTENSION_free(extension);
}

static X509 *certificate(EVP_PKEY *key, int role, long serial, time_t reference, int start, int end, bool large)
{
    X509 *cert = X509_new();
    CHECK(cert != NULL && X509_set_version(cert, 2) == 1);
    CHECK(ASN1_INTEGER_set(X509_get_serialNumber(cert), serial) == 1);
    CHECK(ASN1_TIME_set(X509_getm_notBefore(cert), reference + start) != NULL);
    CHECK(ASN1_TIME_set(X509_getm_notAfter(cert), reference + end) != NULL);
    X509_NAME *name = X509_get_subject_name(cert);
    CHECK(X509_NAME_add_entry_by_txt(name, "CN", MBSTRING_ASC,
          (const unsigned char *)"DOSAI offline synthetic leaf", -1, -1, 0) == 1);
    CHECK(X509_set_issuer_name(cert, name) == 1 && X509_set_pubkey(cert, key) == 1);
    add_extension(cert, NID_basic_constraints, "critical,CA:FALSE");
    add_extension(cert, NID_key_usage, "critical,digitalSignature");
    add_extension(cert, NID_ext_key_usage, role == M1 ? "clientAuth" : "serverAuth");
    if (large) {
        const unsigned char padding[CERT_LIMIT] = {0};
        ASN1_OCTET_STRING *value = ASN1_OCTET_STRING_new();
        CHECK(value != NULL && ASN1_OCTET_STRING_set(value, padding, sizeof(padding)) == 1);
        X509_EXTENSION *extra = X509_EXTENSION_create_by_NID(NULL, NID_netscape_comment, 0, value);
        CHECK(extra != NULL && X509_add_ext(cert, extra, -1) == 1);
        X509_EXTENSION_free(extra);
        ASN1_OCTET_STRING_free(value);
    }
    CHECK(X509_sign(cert, key, EVP_sha256()) > 0);
    return cert;
}

static Identity new_identity(int role, time_t reference)
{
    EVP_PKEY *key = EVP_PKEY_Q_keygen(NULL, NULL, "EC", "P-256");
    CHECK(key != NULL);
    return (Identity){key, certificate(key, role, role + 1, reference, -1, 599, false)};
}

static void destroy_identity(Identity *identity)
{
    X509_free(identity->cert);
    EVP_PKEY_free(identity->key);
}

static void digest_cert(X509 *cert, unsigned char digest[DIGEST])
{
    unsigned size = 0;
    CHECK(X509_digest(cert, EVP_sha256(), digest, &size) == 1 && size == DIGEST);
}

static bool leaf_matches(SSL *tls, int role, const unsigned char pin[DIGEST])
{
    X509 *leaf = SSL_get0_peer_certificate(tls);
    STACK_OF(X509) *sent = SSL_get_peer_cert_chain(tls);
    STACK_OF(X509) *verified = SSL_get0_verified_chain(tls);
    if (leaf == NULL || SSL_get_verify_result(tls) != X509_V_OK ||
        (sent == NULL ? 0 : sk_X509_num(sent)) != (role == M1 ? 1 : 0) ||
        verified == NULL || sk_X509_num(verified) != 1) return false;

    int der_size = i2d_X509(leaf, NULL);
    int days = 0, seconds = 0;
    if (der_size <= 0 || der_size > CERT_LIMIT ||
        X509_get_signature_nid(leaf) != NID_ecdsa_with_SHA256 ||
        ASN1_TIME_diff(&days, &seconds, X509_get0_notBefore(leaf), X509_get0_notAfter(leaf)) != 1 ||
        days != 0 || seconds <= 0 || seconds > 600 ||
        X509_get_key_usage(leaf) != KU_DIGITAL_SIGNATURE) return false;

    char group[32];
    EVP_PKEY *key = X509_get0_pubkey(leaf);
    if (key == NULL || !EVP_PKEY_is_a(key, "EC") ||
        EVP_PKEY_get_group_name(key, group, sizeof(group), NULL) != 1 ||
        (strcmp(group, "prime256v1") != 0 && strcmp(group, "P-256") != 0)) return false;

    BASIC_CONSTRAINTS *constraints = X509_get_ext_d2i(leaf, NID_basic_constraints, NULL, NULL);
    bool end_entity = constraints != NULL && !constraints->ca && constraints->pathlen == NULL;
    BASIC_CONSTRAINTS_free(constraints);
    EXTENDED_KEY_USAGE *usage = X509_get_ext_d2i(leaf, NID_ext_key_usage, NULL, NULL);
    bool exact_role = usage != NULL && sk_ASN1_OBJECT_num(usage) == 1 &&
        OBJ_obj2nid(sk_ASN1_OBJECT_value(usage, 0)) ==
        (role == M1 ? NID_server_auth : NID_client_auth);
    EXTENDED_KEY_USAGE_free(usage);
    unsigned char actual[DIGEST];
    digest_cert(leaf, actual);
    return end_entity && exact_role && CRYPTO_memcmp(actual, pin, DIGEST) == 0;
}

static int choose_alpn(SSL *tls, const unsigned char **out, unsigned char *out_size,
                       const unsigned char *in, unsigned int in_size, void *arg)
{
    (void)tls;
    (void)arg;
    if (in_size != sizeof(alpn) || in[0] != sizeof(alpn) - 1 ||
        memcmp(in + 1, alpn, sizeof(alpn) - 1) != 0) return SSL_TLSEXT_ERR_ALERT_FATAL;
    *out = in + 1;
    *out_size = in[0];
    return SSL_TLSEXT_ERR_OK;
}

static Config configuration(const Identity *local, const Identity *peer)
{
    return (Config){
        .identity = local, .trust = peer->cert, .pin = peer->cert,
        .group = "X25519", .suite = "TLS_AES_128_GCM_SHA256",
        .version = TLS1_3_VERSION, .confirmed = true
    };
}

static void attach_tls(Endpoint *endpoint, const Config *config, int role)
{
    endpoint->tls = SSL_new(endpoint->context);
    CHECK(endpoint->tls != NULL);
    BIO *tls_io = NULL;
    CHECK(BIO_new_bio_pair(&tls_io, BIO_LIMIT, &endpoint->wire, BIO_LIMIT) == 1);
    SSL_set_bio(endpoint->tls, tls_io, tls_io);
    if (role == M1) {
        SSL_set_connect_state(endpoint->tls);
        unsigned char offer[sizeof(alpn)] = {sizeof(alpn) - 1};
        memcpy(offer + 1, alpn, sizeof(alpn) - 1);
        if (config->wrong_alpn) offer[1] = 'x';
        if (!config->omit_alpn) CHECK(SSL_set_alpn_protos(endpoint->tls, offer, sizeof(offer)) == 0);
    } else {
        SSL_set_accept_state(endpoint->tls);
    }
}

static void init_endpoint(Endpoint *endpoint, const Config *config, int role, time_t reference)
{
    SSL_CTX *ctx = endpoint->context = SSL_CTX_new(TLS_method());
    CHECK(ctx != NULL && SSL_CTX_set_min_proto_version(ctx, config->version) == 1);
    CHECK(SSL_CTX_set_max_proto_version(ctx, config->version) == 1);
    CHECK(SSL_CTX_set_ciphersuites(ctx, config->suite) == 1);
    CHECK(SSL_CTX_set1_groups_list(ctx, config->group) == 1);
    CHECK(SSL_CTX_set1_sigalgs_list(ctx, "ecdsa_secp256r1_sha256") == 1);
    SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER | (role == M4 ? SSL_VERIFY_FAIL_IF_NO_PEER_CERT : 0), NULL);
    SSL_CTX_set_session_cache_mode(ctx, SSL_SESS_CACHE_OFF);
    SSL_CTX_set_options(ctx, SSL_OP_NO_TICKET);
    SSL_CTX_clear_options(ctx, SSL_OP_IGNORE_UNEXPECTED_EOF);
    SSL_CTX_set_quiet_shutdown(ctx, 0);
    SSL_CTX_set_post_handshake_auth(ctx, 0);
    SSL_CTX_set_mode(ctx, SSL_MODE_NO_AUTO_CHAIN);
    SSL_CTX_set_max_cert_list(ctx, CERT_LIMIT + 9);
    CHECK(SSL_CTX_set_num_tickets(ctx, 0) == 1);
    CHECK(SSL_CTX_set_max_early_data(ctx, 0) == 1);
    CHECK(SSL_CTX_set_recv_max_early_data(ctx, 0) == 1);

    X509_VERIFY_PARAM *param = SSL_CTX_get0_param(ctx);
    X509_VERIFY_PARAM_set_time(param, reference);
    CHECK(X509_VERIFY_PARAM_set_flags(param, X509_V_FLAG_CHECK_SS_SIGNATURE) == 1);
    CHECK(X509_STORE_add_cert(SSL_CTX_get_cert_store(ctx), config->trust) == 1);
    if (!config->omit_certificate) {
        CHECK(SSL_CTX_use_certificate(ctx, config->identity->cert) == 1);
        CHECK(SSL_CTX_use_PrivateKey(ctx, config->identity->key) == 1);
        CHECK(SSL_CTX_check_private_key(ctx) == 1);
    }
    digest_cert(config->pin, endpoint->pin);
    if (role == M4) SSL_CTX_set_alpn_select_cb(ctx, choose_alpn, NULL);

    attach_tls(endpoint, config, role);
}

static void release_endpoint(Endpoint *peer)
{
    SSL_free(peer->tls);
    BIO_free(peer->wire);
    SSL_CTX_free(peer->context);
    OPENSSL_cleanse(peer, sizeof(*peer));
}

static bool exact_handshake(Endpoint *peer, int role)
{
    SSL *tls = peer->tls;
    const unsigned char *selected = NULL;
    unsigned length = 0;
    SSL_get0_alpn_selected(tls, &selected, &length);
    return SSL_version(tls) == TLS1_3_VERSION && !SSL_session_reused(tls) &&
        SSL_get_early_data_status(tls) == SSL_EARLY_DATA_NOT_SENT &&
        SSL_get_negotiated_group(tls) == NID_X25519 &&
        strcmp(SSL_get_cipher_name(tls), "TLS_AES_128_GCM_SHA256") == 0 &&
        length == sizeof(alpn) - 1 && memcmp(selected, alpn, length) == 0 &&
        leaf_matches(tls, role, peer->pin);
}

static void derive(Endpoint *peer, int role)
{
    unsigned char context[sizeof(alpn) + 2 * DIGEST + sizeof(action) - 1];
    memcpy(context, alpn, sizeof(alpn));
    CHECK(SSL_get0_peer_certificate(peer->tls) != NULL);
    digest_cert(SSL_get_certificate(peer->tls), context + sizeof(alpn) + role * DIGEST);
    digest_cert(SSL_get0_peer_certificate(peer->tls), context + sizeof(alpn) + (1 - role) * DIGEST);
    memcpy(context + sizeof(alpn) + 2 * DIGEST, action, sizeof(action) - 1);
    const char session_label[] = "EXPERIMENTAL DOSAI Fixture LAN v1 Session";
    const char request_label[] = "EXPERIMENTAL DOSAI Fixture LAN v1 M1 to M4";
    CHECK(SSL_export_keying_material(peer->tls, peer->session, SESSION,
          session_label, sizeof(session_label) - 1, context, sizeof(context), 1) == 1);
    CHECK(SSL_export_keying_material(peer->tls, peer->key, DIGEST,
          request_label, sizeof(request_label) - 1, context, sizeof(context), 1) == 1);
}

static void payload_digest(const unsigned char *data, unsigned char digest[DIGEST])
{
    size_t size = 0;
    CHECK(EVP_Q_digest(NULL, "SHA256", NULL, data, sizeof(payload) - 1, digest, &size) == 1);
    CHECK(size == DIGEST);
}

static void frame_mac(const unsigned char frame[FRAME], const unsigned char key[DIGEST],
                      unsigned char tag[DIGEST])
{
    const char domain[] = "DOSAI Fixture LAN v1 Request";
    unsigned char bytes[sizeof(domain) + TAG_AT];
    memcpy(bytes, domain, sizeof(domain));
    memcpy(bytes + sizeof(domain), frame, TAG_AT);
    unsigned size = 0;
    CHECK(HMAC(EVP_sha256(), key, DIGEST, bytes, sizeof(bytes), tag, &size) != NULL);
    CHECK(size == DIGEST);
    OPENSSL_cleanse(bytes, sizeof(bytes));
}

static void make_frame(const Endpoint *sender, unsigned char frame[FRAME])
{
    memset(frame, 0, FRAME);
    memcpy(frame, preamble, PREAMBLE);
    memcpy(frame + SEQUENCE_AT, sequence, sizeof(sequence));
    memcpy(frame + SESSION_AT, sender->session, SESSION);
    digest_cert(SSL_get_certificate(sender->tls), frame + M1_PIN_AT);
    memcpy(frame + M4_PIN_AT, sender->pin, DIGEST);
    CHECK(RAND_bytes(frame + MESSAGE_AT, SESSION) == 1);
    CHECK(RAND_bytes(frame + NONCE_AT, SESSION) == 1);
    memcpy(frame + PAYLOAD_AT, payload, sizeof(payload) - 1);
    payload_digest(frame + PAYLOAD_AT, frame + DIGEST_AT);
    frame_mac(frame, sender->key, frame + TAG_AT);
}

static Result validate_frame(const Endpoint *receiver, const unsigned char frame[FRAME])
{
    unsigned char expected[DIGEST];
    frame_mac(frame, receiver->key, expected);
    bool valid_mac = CRYPTO_memcmp(expected, frame + TAG_AT, DIGEST) == 0;
    OPENSSL_cleanse(expected, sizeof(expected));
    if (!valid_mac) return REJECT_AUTH;

    digest_cert(SSL_get_certificate(receiver->tls), expected);
    if (memcmp(frame + SEQUENCE_AT, sequence, sizeof(sequence)) != 0 ||
        CRYPTO_memcmp(frame + SESSION_AT, receiver->session, SESSION) != 0 ||
        CRYPTO_memcmp(frame + M1_PIN_AT, receiver->pin, DIGEST) != 0 ||
        CRYPTO_memcmp(frame + M4_PIN_AT, expected, DIGEST) != 0 ||
        memcmp(frame + CORRELATION_AT, zeros, SESSION) != 0 ||
        memcmp(frame + MESSAGE_AT, zeros, SESSION) == 0 ||
        memcmp(frame + NONCE_AT, zeros, SESSION) == 0 ||
        memcmp(frame + NONCE_AT, frame + MESSAGE_AT, SESSION) == 0) return REJECT_AUTH;

    payload_digest(frame + PAYLOAD_AT, expected);
    if (CRYPTO_memcmp(frame + DIGEST_AT, expected, DIGEST) != 0 ||
        memcmp(frame + PAYLOAD_AT, payload, sizeof(payload) - 1) != 0) return REJECT_PAYLOAD;
    return REVIEW;
}

#endif
