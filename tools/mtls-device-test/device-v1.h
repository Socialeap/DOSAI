// Standalone endpoint candidate. The driver supplies only bounded encrypted
// bytes and trusted local events. This file owns no network or filesystem I/O.
#ifndef DOSAI_FIXTURE_MTLS_DEVICE_V1
#define DOSAI_FIXTURE_MTLS_DEVICE_V1

#include "protocol-v1.h"

typedef struct {
    uint32_t m1;
    uint32_t m4;
    uint16_t m4_port;
} DeviceScope;

typedef struct {
    DeviceScope scope;
    unsigned char pins[ENDPOINTS][DIGEST];
} LocalPairing;

typedef enum {
    DEVICE_PAIRING, DEVICE_PAIRED, DEVICE_HANDSHAKE, DEVICE_SEND, DEVICE_RECEIVE,
    DEVICE_CLOSE_M1, DEVICE_CLOSE_M4, DEVICE_DRAIN_M4, DEVICE_LOCAL_REVIEW,
    DEVICE_SENT_DELIVERY_UNKNOWN, DEVICE_DENIED, DEVICE_LOCAL_CONFIRMATION_ONLY,
    DEVICE_FAILED
} DeviceStage;

typedef enum { DEVICE_NO_PROPOSAL, DEVICE_UNTRUSTED_SUMMARIZE_FIXTURE } DeviceProposal;

typedef struct {
    Endpoint endpoint;
    Identity identity;
    X509 *peer_cert;
    DeviceScope scope;
    time_t start_utc;
    unsigned tick;
    unsigned deadline;
    unsigned policy_generation;
    size_t inbound;
    size_t outbound;
    unsigned calls;
    int role;
    DeviceStage stage;
    size_t frame_size;
    unsigned char frame[FRAME];
    unsigned char plan[DIGEST];
    bool has_plan;
    bool initialized;
} Device;

static bool private_ipv4(uint32_t address)
{
    return address >> 24 == 10 || address >> 20 == 0xac1 || address >> 16 == 0xc0a8;
}

static bool same_scope(DeviceScope a, DeviceScope b)
{
    return a.m1 == b.m1 && a.m4 == b.m4 && a.m4_port == b.m4_port;
}

static void device_release_transport(Device *device)
{
    release_endpoint(&device->endpoint);
    destroy_identity(&device->identity);
    device->identity = (Identity){0};
    X509_free(device->peer_cert);
    device->peer_cert = NULL;
    OPENSSL_cleanse(device->frame, sizeof(device->frame));
    device->frame_size = 0;
}

static void device_finish(Device *device, DeviceStage outcome)
{
    device_release_transport(device);
    OPENSSL_cleanse(device->plan, sizeof(device->plan));
    device->has_plan = false;
    device->stage = outcome;
}

static bool device_fail(Device *device)
{
    device_finish(device, DEVICE_FAILED);
    return false;
}

static bool device_time(Device *device, unsigned elapsed)
{
    if (device->stage >= DEVICE_SENT_DELIVERY_UNKNOWN) return false;
    if (elapsed < device->tick || elapsed >= device->deadline || elapsed >= 200)
        return device_fail(device);
    device->tick = elapsed;
    return true;
}

static void device_stop(Device *device)
{
    if (device->stage < DEVICE_SENT_DELIVERY_UNKNOWN) device_fail(device);
}

static void device_policy_changed(Device *device, unsigned current)
{
    if (current != device->policy_generation) device_stop(device);
}

static bool device_init(Device *device, int role, DeviceScope scope, time_t start_utc,
                        unsigned policy_generation)
{
    if (device->initialized) return false;
    *device = (Device){.stage = DEVICE_FAILED, .initialized = true};
    if ((role != M1 && role != M4) || !private_ipv4(scope.m1) || !private_ipv4(scope.m4) ||
        scope.m1 == scope.m4 || scope.m4_port < 1024 ||
        start_utc <= 1 || start_utc > INT64_MAX - 600 || policy_generation == 0) return false;
    device->scope = scope;
    device->role = role;
    device->start_utc = start_utc;
    device->policy_generation = policy_generation;
    device->identity = new_identity(role, start_utc);
    device->deadline = 120;
    device->stage = DEVICE_PAIRING;
    return true;
}

static size_t device_public_leaf(const Device *device, unsigned char output[CERT_LIMIT])
{
    if (!device->initialized || device->stage != DEVICE_PAIRING || output == NULL) return 0;
    int size = i2d_X509(device->identity.cert, NULL);
    if (size <= 0 || size > CERT_LIMIT) return 0;
    unsigned char *cursor = output;
    if (i2d_X509(device->identity.cert, &cursor) != size) return 0;
    return (size_t)size;
}

// Only the trusted local driver can submit the comparison made on its local
// prompt. A transport record has no pairing or owner-decision message type.
static bool device_confirm(Device *device, const unsigned char *der, size_t size,
                           const LocalPairing *confirmed, unsigned elapsed)
{
    if (!device_time(device, elapsed)) return false;
    if (device->stage != DEVICE_PAIRING || der == NULL || size == 0 || size > CERT_LIMIT ||
        confirmed == NULL || !same_scope(device->scope, confirmed->scope)) return device_fail(device);

    const unsigned char *cursor = der;
    device->peer_cert = d2i_X509(NULL, &cursor, (long)size);
    if (device->peer_cert == NULL || cursor != der + size) return device_fail(device);
    unsigned char canonical[CERT_LIMIT];
    unsigned char *encoded = canonical;
    if (i2d_X509(device->peer_cert, NULL) != (int)size ||
        i2d_X509(device->peer_cert, &encoded) != (int)size ||
        CRYPTO_memcmp(canonical, der, size) != 0) return device_fail(device);

    unsigned char pins[ENDPOINTS][DIGEST];
    digest_cert(device->identity.cert, pins[device->role]);
    digest_cert(device->peer_cert, pins[1 - device->role]);
    if (CRYPTO_memcmp(pins, confirmed->pins, sizeof(pins)) != 0 ||
        CRYPTO_memcmp(pins[M1], pins[M4], DIGEST) == 0) return device_fail(device);
    device->stage = DEVICE_PAIRED;
    return true;
}

// The caller supplies verified metadata for an already-selected stream. The
// source candidate cannot open a stream or attest to OS endpoint ownership.
static bool device_attach(Device *device, uint32_t local, uint32_t peer, uint16_t m4_port,
                          unsigned elapsed)
{
    if (!device_time(device, elapsed)) return false;
    DeviceScope scope = device->role == M1 ? (DeviceScope){local, peer, m4_port}
                                          : (DeviceScope){peer, local, m4_port};
    if (device->stage != DEVICE_PAIRED || !same_scope(device->scope, scope))
        return device_fail(device);

    time_t utc = device->start_utc + elapsed;
    const Identity peer_input = {.cert = device->peer_cert};
    const Config config = configuration(&device->identity, &peer_input);
    init_endpoint(&device->endpoint, &config, device->role, utc);
    device->stage = DEVICE_HANDSHAKE;
    device->deadline = elapsed + 5;
    return true;
}

static bool device_spend(Device *device)
{
    if (device->calls >= IO_LIMIT) return device_fail(device);
    ++device->calls;
    return true;
}

static bool device_wire_active(const Device *device)
{
    return device->stage >= DEVICE_HANDSHAKE && device->stage <= DEVICE_DRAIN_M4;
}

static size_t device_input_space(const Device *device)
{
    return device_wire_active(device) ? BIO_ctrl_get_write_guarantee(device->endpoint.wire) : 0;
}

static bool device_input(Device *device, const unsigned char *bytes, size_t size, unsigned elapsed)
{
    if (!device_time(device, elapsed) || !device_wire_active(device)) return false;
    if (bytes == NULL || size == 0 || size > device_input_space(device) ||
        size > WIRE_LIMIT - device->inbound) return device_fail(device);
    if (!device_spend(device)) return false;
    if (BIO_write(device->endpoint.wire, bytes, (int)size) != (int)size) return device_fail(device);
    device->inbound += size;
    return true;
}

static size_t device_output(Device *device, unsigned char *output, size_t capacity, unsigned elapsed)
{
    if (!device_time(device, elapsed) || !device_wire_active(device) || capacity == 0) return 0;
    size_t size = BIO_ctrl_pending(device->endpoint.wire);
    if (size > capacity) size = capacity;
    if (size == 0) return 0;
    if (output == NULL || size > WIRE_LIMIT - device->outbound) {
        device_fail(device);
        return 0;
    }
    if (!device_spend(device)) return 0;
    if (BIO_read(device->endpoint.wire, output, (int)size) != (int)size) {
        device_fail(device);
        return 0;
    }
    device->outbound += size;
    return size;
}

static void device_missing_input(Device *device, unsigned elapsed)
{
    if (!device_time(device, elapsed) || !device_wire_active(device)) return;
    if (!device_spend(device)) return;
    if (BIO_shutdown_wr(device->endpoint.wire) != 1) device_fail(device);
}

static bool device_retry_or_fail(Device *device, int result)
{
    int cause = SSL_get_error(device->endpoint.tls, result);
    if (cause == SSL_ERROR_WANT_READ || cause == SSL_ERROR_WANT_WRITE) return true;
    return device_fail(device);
}

static bool device_handshake(Device *device)
{
    Endpoint *endpoint = &device->endpoint;
    int result = SSL_do_handshake(endpoint->tls);
    if (result != 1) return device_retry_or_fail(device, result);
    if (!exact_handshake(endpoint, device->role)) return device_fail(device);

    time_t now = device->start_utc + device->tick;
    X509 *remote = SSL_get0_peer_certificate(endpoint->tls);
    if (X509_cmp_time(X509_get0_notBefore(remote), &now) != -1 ||
        X509_cmp_time(X509_get0_notAfter(remote), &now) != 1) return device_fail(device);
    derive(endpoint, device->role);
    destroy_identity(&device->identity);
    device->identity = (Identity){0};
    X509_free(device->peer_cert);
    device->peer_cert = NULL;
    device->deadline = device->tick + 5;
    if (device->role == M1) {
        make_frame(endpoint, device->frame);
        device->stage = DEVICE_SEND;
    } else {
        device->stage = DEVICE_RECEIVE;
    }
    return true;
}

static bool device_send(Device *device)
{
    size_t sent = 0;
    int outcome = SSL_write_ex(device->endpoint.tls, device->frame, FRAME, &sent);
    if (outcome != 1) return device_retry_or_fail(device, outcome);
    if (sent != FRAME) return device_fail(device);
    OPENSSL_cleanse(device->frame, sizeof(device->frame));
    device->stage = DEVICE_CLOSE_M1;
    return true;
}

static bool device_receive(Device *device)
{
    size_t used = device->frame_size;
    size_t boundary = used < PREAMBLE ? PREAMBLE : FRAME;
    unsigned char trailing = 0;
    unsigned char *output = used == FRAME ? &trailing : device->frame + used;
    size_t room = used == FRAME ? 1 : boundary - used;
    size_t length = 0;
    SSL *tls = device->endpoint.tls;
    int outcome = SSL_read_ex(tls, output, room, &length);
    if (outcome == 1) {
        if (used == FRAME || length == 0) return device_fail(device);
        device->frame_size += length;
        if (device->frame_size == PREAMBLE && memcmp(device->frame, preamble, PREAMBLE) != 0)
            return device_fail(device);
        return true;
    }
    if (SSL_get_error(tls, outcome) != SSL_ERROR_ZERO_RETURN) return device_retry_or_fail(device, outcome);
    if (!(SSL_get_shutdown(tls) & SSL_RECEIVED_SHUTDOWN) || used != FRAME ||
        validate_frame(&device->endpoint, device->frame) != REVIEW) return device_fail(device);
    device->stage = DEVICE_CLOSE_M4;
    return true;
}

static bool device_close_sender(Device *device)
{
    SSL *tls = device->endpoint.tls;
    if (!(SSL_get_shutdown(tls) & SSL_SENT_SHUTDOWN)) {
        int outcome = SSL_shutdown(tls);
        return outcome >= 0 || device_retry_or_fail(device, outcome);
    }
    unsigned char unexpected = 0;
    size_t length = 0;
    int outcome = SSL_read_ex(tls, &unexpected, sizeof(unexpected), &length);
    if (outcome == 1) return device_fail(device);
    if (SSL_get_error(tls, outcome) != SSL_ERROR_ZERO_RETURN) return device_retry_or_fail(device, outcome);
    if (!(SSL_get_shutdown(tls) & SSL_RECEIVED_SHUTDOWN) ||
        SSL_SESSION_has_ticket(SSL_get_session(tls)) ||
        BIO_ctrl_pending(device->endpoint.wire) != 0) return device_fail(device);
    device_finish(device, DEVICE_SENT_DELIVERY_UNKNOWN);
    return true;
}

static bool device_step(Device *device, unsigned elapsed)
{
    if (!device_time(device, elapsed) || !device_wire_active(device)) return false;
    if (device->stage == DEVICE_DRAIN_M4) return true;
    if (!device_spend(device)) return false;
    ERR_clear_error();
    switch (device->stage) {
    case DEVICE_HANDSHAKE: return device_handshake(device);
    case DEVICE_SEND: return device_send(device);
    case DEVICE_RECEIVE: return device_receive(device);
    case DEVICE_CLOSE_M1: return device_close_sender(device);
    case DEVICE_CLOSE_M4: {
        SSL *tls = device->endpoint.tls;
        int outcome = SSL_shutdown(tls);
        if (outcome < 0) return device_retry_or_fail(device, outcome);
        if (outcome != 1) return device_fail(device);
        device->stage = DEVICE_DRAIN_M4;
        return true;
    }
    default: return device_fail(device);
    }
}

// The local driver calls this after delivering the closing alert to the
// stream and closing its owned transport. Empty BIOs alone cannot admit.
static bool device_transport_closed(Device *device, unsigned elapsed)
{
    if (!device_time(device, elapsed)) return false;
    if (device->stage != DEVICE_DRAIN_M4 || BIO_ctrl_pending(device->endpoint.wire) != 0)
        return device_fail(device);
    device_release_transport(device);
    device->stage = DEVICE_LOCAL_REVIEW;
    device->deadline = elapsed + 60;
    return true;
}

static DeviceProposal device_review_proposal(Device *device, unsigned elapsed)
{
    if (!device_time(device, elapsed) || device->stage != DEVICE_LOCAL_REVIEW) return DEVICE_NO_PROPOSAL;
    return DEVICE_UNTRUSTED_SUMMARIZE_FIXTURE;
}

// The trusted local driver supplies a digest prepared by the existing local
// policy layer. This interlock cannot create a plan, grant, or evaluation.
static bool device_bind_local_plan(Device *device, const unsigned char digest[DIGEST], unsigned elapsed)
{
    const unsigned char empty[DIGEST] = {0};
    if (device_review_proposal(device, elapsed) == DEVICE_NO_PROPOSAL) return false;
    if (device->has_plan || digest == NULL || CRYPTO_memcmp(digest, empty, DIGEST) == 0)
        return device_fail(device);
    memcpy(device->plan, digest, DIGEST);
    device->has_plan = true;
    return true;
}

static bool device_finish_local_review(Device *device, bool confirmed, const unsigned char digest[DIGEST],
                                       unsigned elapsed)
{
    if (device_review_proposal(device, elapsed) == DEVICE_NO_PROPOSAL) return false;
    if (!confirmed) {
        device_finish(device, DEVICE_DENIED);
        return true;
    }
    if (!device->has_plan || digest == NULL || CRYPTO_memcmp(digest, device->plan, DIGEST) != 0)
        return device_fail(device);
    device_finish(device, DEVICE_LOCAL_CONFIRMATION_ONLY);
    return true;
}

#endif
