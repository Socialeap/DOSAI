#include "../../../tools/mtls-device-test/device-v1.h"

static const time_t start_utc = 1770000000;
static const DeviceScope scope = {0xc0a80111, 0xc0a80112, 49017};
static const unsigned char plan_digest[DIGEST] = {1};

typedef struct {
    Device sides[ENDPOINTS];
    unsigned char leaves[ENDPOINTS][CERT_LIMIT];
    size_t sizes[ENDPOINTS];
    LocalPairing pair;
} Ceremony;

static void prepare(Ceremony *ceremony)
{
    ceremony->pair.scope = scope;
    for (int i = 0; i < ENDPOINTS; ++i) {
        CHECK(device_init(&ceremony->sides[i], i, scope, start_utc, 1));
        ceremony->sizes[i] = device_public_leaf(&ceremony->sides[i], ceremony->leaves[i]);
        CHECK(ceremony->sizes[i] > 0);
        CHECK(EVP_Q_digest(NULL, "SHA256", NULL, ceremony->leaves[i], ceremony->sizes[i],
              ceremony->pair.pins[i], NULL) == 1);
    }
}

static bool pair_side(Ceremony *ceremony, int role, unsigned tick)
{
    return device_confirm(&ceremony->sides[role], ceremony->leaves[1 - role],
                          ceremony->sizes[1 - role], &ceremony->pair, tick);
}

static void start(Ceremony *ceremony)
{
    prepare(ceremony);
    CHECK(pair_side(ceremony, M1, 1) && pair_side(ceremony, M4, 1));
    CHECK(device_attach(&ceremony->sides[M1], scope.m1, scope.m4, scope.m4_port, 2));
    CHECK(device_attach(&ceremony->sides[M4], scope.m4, scope.m1, scope.m4_port, 2));
}

static void move_wire(Device *source, Device *destination, size_t chunk_size, unsigned tick)
{
    unsigned char ciphertext[1024];
    size_t room = device_input_space(destination);
    if (room > sizeof(ciphertext)) room = sizeof(ciphertext);
    if (room > chunk_size) room = chunk_size;
    size_t size = device_output(source, ciphertext, room, tick);
    if (size != 0) CHECK(device_input(destination, ciphertext, size, tick));
}

static void drive(Ceremony *ceremony, size_t chunk_size, DeviceStage receiver_target)
{
    for (unsigned i = 0; i < 8192; ++i) {
        if (ceremony->sides[M4].stage == receiver_target) return;
        for (int role = M1; role <= M4; ++role) {
            Device *device = &ceremony->sides[role];
            if (device_wire_active(device)) {
                CHECK(device_step(device, 3));
                if (ceremony->sides[M4].stage == receiver_target) return;
                move_wire(device, &ceremony->sides[1 - role], chunk_size, 3);
                if (device->stage == DEVICE_DRAIN_M4 &&
                    BIO_ctrl_pending(device->endpoint.wire) == 0) {
                    CHECK(device_review_proposal(device, 3) == DEVICE_NO_PROPOSAL);
                    CHECK(device_transport_closed(device, 3));
                }
            }
        }
    }
    CHECK(false);
}

static void assert_released(const Device *device)
{
    unsigned char empty[DIGEST] = {0};
    CHECK(device->endpoint.context == NULL && device->endpoint.tls == NULL &&
          device->endpoint.wire == NULL && device->peer_cert == NULL &&
          device->identity.key == NULL && device->identity.cert == NULL &&
          CRYPTO_memcmp(device->endpoint.key, empty, DIGEST) == 0 &&
          CRYPTO_memcmp(device->endpoint.session, empty, SESSION) == 0 &&
          device->frame_size == 0);
}

static void test_ceremonies(void)
{
    unsigned char previous[ENDPOINTS][DIGEST] = {{0}};
    for (int requested = 0; requested < 3; ++requested) {
        Ceremony ceremony = {0};
        start(&ceremony);
        for (int role = M1; role <= M4; ++role) {
            CHECK(CRYPTO_memcmp(ceremony.pair.pins[role], previous[role], DIGEST) != 0);
        }
        memcpy(previous, ceremony.pair.pins, sizeof(previous));
        drive(&ceremony, requested == 0 ? 1 : 1024, DEVICE_DRAIN_M4);
        Device *sender = &ceremony.sides[M1];
        Device *receiver = &ceremony.sides[M4];

        // A fully received request still cannot enter review while the closure
        // output is pending. An offline driver pumps it before the final step.
        CHECK(device_review_proposal(receiver, 3) == DEVICE_NO_PROPOSAL);
        CHECK(BIO_ctrl_pending(receiver->endpoint.wire) > 0);
        CHECK(device_step(receiver, 3) && receiver->stage == DEVICE_DRAIN_M4);
        CHECK(!device_finish_local_review(receiver, true, plan_digest, 3));
        drive(&ceremony, 1024, DEVICE_LOCAL_REVIEW);
        if (sender->stage == DEVICE_CLOSE_M1) CHECK(device_step(sender, 3));
        CHECK(sender->stage == DEVICE_SENT_DELIVERY_UNKNOWN);
        CHECK(device_review_proposal(sender, 3) == DEVICE_NO_PROPOSAL);
        CHECK(device_review_proposal(receiver, 3) == DEVICE_UNTRUSTED_SUMMARIZE_FIXTURE);
        assert_released(sender);
        assert_released(receiver);

        CHECK(device_bind_local_plan(receiver, plan_digest, 3));
        if (requested == 0) {
            CHECK(device_finish_local_review(receiver, false, NULL, 4));
            CHECK(receiver->stage == DEVICE_DENIED);
        } else if (requested == 1) {
            CHECK(device_finish_local_review(receiver, true, plan_digest, 4));
            CHECK(receiver->stage == DEVICE_LOCAL_CONFIRMATION_ONLY);
        } else {
            device_stop(receiver);
            CHECK(receiver->stage == DEVICE_FAILED);
        }
        CHECK(device_review_proposal(receiver, 4) == DEVICE_NO_PROPOSAL);
        CHECK(!device_finish_local_review(receiver, true, plan_digest, 4));
        CHECK(!receiver->has_plan && CRYPTO_memcmp(receiver->plan, (unsigned char[DIGEST]){0}, DIGEST) == 0);
        CHECK(!device_init(receiver, M4, scope, start_utc, 1));
    }
}

static void test_scope_and_pairing(void)
{
    CHECK(!device_init(&(Device){0}, M1, (DeviceScope){0x08080808, scope.m4, scope.m4_port}, start_utc, 1));
    CHECK(!device_init(&(Device){0}, M1, (DeviceScope){scope.m1, scope.m4, 443}, start_utc, 1));
    CHECK(!device_init(&(Device){0}, M1, (DeviceScope){scope.m1, scope.m1, scope.m4_port}, start_utc, 1));
    CHECK(!device_init(&(Device){0}, M4, scope, start_utc, 0));
    for (int scenario = 0; scenario < 9; ++scenario) {
        Ceremony ceremony = {0};
        prepare(&ceremony);
        Device *receiver = &ceremony.sides[M4];
        bool accepted;
        switch (scenario) {
        case 0: accepted = device_attach(receiver, scope.m4, scope.m1, scope.m4_port, 1); break;
        case 1: ceremony.pair.pins[M1][0] ^= 1; accepted = pair_side(&ceremony, M4, 1); break;
        case 2: ++ceremony.pair.scope.m4_port; accepted = pair_side(&ceremony, M4, 1); break;
        case 3: ++ceremony.sizes[M1]; accepted = pair_side(&ceremony, M4, 1); break;
        case 4: accepted = pair_side(&ceremony, M4, 120); break;
        case 5: CHECK(pair_side(&ceremony, M4, 1)); accepted = pair_side(&ceremony, M4, 1); break;
        case 6:
            CHECK(pair_side(&ceremony, M4, 1));
            accepted = device_attach(receiver, scope.m4, scope.m1 + 1, scope.m4_port, 2);
            break;
        case 7:
            CHECK(pair_side(&ceremony, M4, 1));
            accepted = device_attach(receiver, scope.m4, scope.m1, scope.m4_port + 1, 2);
            break;
        default:
            CHECK(pair_side(&ceremony, M4, 1));
            accepted = device_attach(receiver, scope.m1, scope.m4, scope.m4_port, 2);
            break;
        }
        CHECK(!accepted && receiver->stage == DEVICE_FAILED);
        CHECK(!device_attach(receiver, scope.m4, scope.m1, scope.m4_port, 121));
        CHECK(device_output(receiver, ceremony.leaves[M4], CERT_LIMIT, 121) == 0);
        assert_released(receiver);
        device_stop(&ceremony.sides[M1]);
    }
}

static void test_review_binding(void)
{
    for (int scenario = 0; scenario < 6; ++scenario) {
        Ceremony ceremony = {0};
        start(&ceremony);
        drive(&ceremony, 1024, DEVICE_LOCAL_REVIEW);
        Device *receiver = &ceremony.sides[M4];
        bool accepted;
        if (scenario != 0) CHECK(device_bind_local_plan(receiver, plan_digest, 3));
        switch (scenario) {
        case 0: accepted = device_finish_local_review(receiver, true, plan_digest, 3); break;
        case 1: accepted = device_finish_local_review(receiver, true, (unsigned char[DIGEST]){2}, 3); break;
        case 2: accepted = device_finish_local_review(receiver, true, plan_digest, 63); break;
        case 3: accepted = device_finish_local_review(receiver, true, plan_digest, 2); break;
        case 4: accepted = device_bind_local_plan(receiver, plan_digest, 3); break;
        default:
            device_policy_changed(receiver, 2);
            accepted = device_finish_local_review(receiver, true, plan_digest, 3);
            break;
        }
        CHECK(!accepted && receiver->stage == DEVICE_FAILED);
        CHECK(!device_finish_local_review(receiver, true, plan_digest, 64));
        assert_released(receiver);
        device_stop(&ceremony.sides[M1]);
    }
}

static void test_transport_limits(void)
{
    for (int scenario = 0; scenario < 7; ++scenario) {
        Ceremony ceremony = {0};
        start(&ceremony);
        Device *sender = &ceremony.sides[M1];
        Device *receiver = &ceremony.sides[M4];
        unsigned char input = 0;
        switch (scenario) {
        case 0: device_missing_input(receiver, 3); CHECK(!device_step(receiver, 3)); break;
        case 1: CHECK(!device_step(receiver, 7)); break;
        case 2: receiver->inbound = WIRE_LIMIT; CHECK(!device_input(receiver, &input, 1, 3)); break;
        case 3: receiver->calls = IO_LIMIT; CHECK(!device_step(receiver, 3)); break;
        case 4: device_stop(receiver); break;
        case 5:
            drive(&ceremony, 1024, DEVICE_DRAIN_M4);
            CHECK(BIO_ctrl_pending(receiver->endpoint.wire) > 0);
            CHECK(!device_transport_closed(receiver, 3));
            break;
        default:
            drive(&ceremony, 1024, DEVICE_RECEIVE);
            // Send a full authenticated frame without sending the TLS close alert.
            CHECK(sender->stage == DEVICE_SEND || sender->stage == DEVICE_CLOSE_M1);
            if (sender->stage == DEVICE_SEND) CHECK(device_step(sender, 3));
            move_wire(sender, receiver, 1024, 3);
            for (int i = 0; i < 3; ++i) CHECK(device_step(receiver, 3));
            CHECK(receiver->frame_size == FRAME && receiver->stage == DEVICE_RECEIVE);
            CHECK(device_review_proposal(receiver, 3) == DEVICE_NO_PROPOSAL);
            device_missing_input(receiver, 3);
            CHECK(!device_step(receiver, 3));
            break;
        }
        CHECK(receiver->stage == DEVICE_FAILED && device_review_proposal(receiver, 3) == DEVICE_NO_PROPOSAL);
        assert_released(receiver);
        device_stop(sender);
    }
}

static void test_substitution(void)
{
    Ceremony intended = {0};
    Ceremony substitute = {0};
    prepare(&intended);
    prepare(&substitute);
    CHECK(pair_side(&intended, M4, 1));
    LocalPairing other = intended.pair;
    memcpy(other.pins[M1], substitute.pair.pins[M1], DIGEST);
    Device *sender = &substitute.sides[M1];
    Device *receiver = &intended.sides[M4];
    CHECK(device_confirm(sender, intended.leaves[M4], intended.sizes[M4], &other, 1));
    CHECK(device_attach(sender, scope.m1, scope.m4, scope.m4_port, 2));
    CHECK(device_attach(receiver, scope.m4, scope.m1, scope.m4_port, 2));

    // The substitute has the expected role and source address. The TLS
    // verification must still reject the different ephemeral certificate.
    for (int i = 0; i < 32 && receiver->stage != DEVICE_FAILED; ++i) {
        CHECK(device_step(sender, 3));
        move_wire(sender, receiver, 1024, 3);
        if (device_step(receiver, 3)) move_wire(receiver, sender, 1024, 3);
    }
    CHECK(receiver->stage == DEVICE_FAILED && device_review_proposal(receiver, 3) == DEVICE_NO_PROPOSAL);
    assert_released(receiver);
    device_stop(sender);
    device_stop(&substitute.sides[M4]);
    device_stop(&intended.sides[M1]);
}

int main(void)
{
    CHECK(OPENSSL_init_ssl(OPENSSL_INIT_NO_LOAD_CONFIG, NULL) == 1);
    CHECK(OpenSSL_version_num() == OPENSSL_VERSION_NUMBER);
    test_ceremonies();
    puts("ok - independent endpoints, denial, exact local confirmation and revocation");
    test_scope_and_pairing();
    puts("ok - exact private endpoint, pairing and single-attempt rejection");
    test_review_binding();
    puts("ok - missing, changed, duplicate, expired and revoked plan rejection");
    test_transport_limits();
    puts("ok - deadlines, encrypted-byte and I/O bounds, stop and authenticated EOF");
    test_substitution();
    puts("ok - TLS rejects a substituted leaf from the expected address");
    return EXIT_SUCCESS;
}
