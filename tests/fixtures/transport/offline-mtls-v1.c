// Standalone test fixture. TLS transports are bounded memory BIOs.
#include "../../../tools/mtls-device-test/protocol-v1.h"

static const time_t certificate_time = 1770000000;

typedef struct {
    Endpoint peers[ENDPOINTS];
    unsigned char frame[FRAME];
    size_t used;
    unsigned calls;
    unsigned now;
    unsigned last_tick;
    unsigned stage_deadline;
    unsigned policy_generation;
    bool stopped;
    bool paused;
    bool revoked;
    bool attempted;
    bool ready;
    Result result;
} Run;

static void release(Run *run)
{
    for (int i = 0; i < ENDPOINTS; ++i) release_endpoint(&run->peers[i]);
    OPENSSL_cleanse(run->frame, sizeof(run->frame));
    run->used = 0;
    run->ready = false;
}

static Result reject(Run *run, Result reason)
{
    release(run);
    return run->result = reason;
}

static bool abort_handshake(Run *run, Result reason)
{
    reject(run, reason);
    return false;
}

static bool spend(Run *run)
{
    if (run->calls == IO_LIMIT) return false;
    ++run->calls;
    return true;
}

static bool transfer(Run *run, int from, size_t chunk_limit)
{
    Endpoint *source = &run->peers[from];
    BIO *destination = run->peers[1 - from].wire;
    unsigned char chunk[1024];
    size_t count = BIO_ctrl_pending(source->wire);
    size_t space = BIO_ctrl_get_write_guarantee(destination);
    if (count > space) count = space;
    if (count > chunk_limit) count = chunk_limit;
    if (count > sizeof(chunk)) count = sizeof(chunk);
    if (count == 0) return true;
    if (count > WIRE_LIMIT - source->moved || IO_LIMIT - run->calls < 2) return false;
    run->calls += 2;
    CHECK(BIO_read(source->wire, chunk, (int)count) == (int)count);
    CHECK(BIO_write(destination, chunk, (int)count) == (int)count);
    source->moved += count;
    return true;
}

static bool drain(Run *run, int from)
{
    Endpoint *source = &run->peers[from];
    while (BIO_ctrl_pending(source->wire) != 0) {
        size_t before = source->moved;
        if (!transfer(run, from, BIO_LIMIT) || source->moved == before) return false;
    }
    return true;
}

static bool allowed(Run *run)
{
    if (run->now < run->last_tick) return false;
    run->last_tick = run->now;
    return !run->stopped && !run->paused && !run->revoked &&
        run->policy_generation == 1 && run->now < run->stage_deadline && run->now < 200;
}

static bool open_run(Run *run, const Config config[ENDPOINTS])
{
    if (run->attempted) return false;
    run->attempted = true;
    run->stage_deadline = 120;
    if (!config[M1].confirmed || !config[M4].confirmed || !allowed(run)) {
        reject(run, REJECT_GATE);
        return false;
    }
    for (int i = 0; i < ENDPOINTS; ++i) init_endpoint(&run->peers[i], &config[i], i, certificate_time);
    run->stage_deadline = run->now + 5;
    return true;
}

static bool drive_handshake(Run *run, size_t encrypted_chunk)
{
    bool complete[ENDPOINTS] = {false};
    while (!complete[M1] || !complete[M4]) {
        if (!allowed(run)) return abort_handshake(run, REJECT_GATE);
        size_t moved = run->peers[M1].moved + run->peers[M4].moved;
        bool completed_step = false;
        for (int i = 0; i < ENDPOINTS; ++i) {
            if (!complete[i]) {
                if (!spend(run)) return abort_handshake(run, REJECT_LIMIT);
                ERR_clear_error();
                SSL *tls = run->peers[i].tls;
                int outcome = SSL_do_handshake(tls);
                if (outcome == 1) {
                    complete[i] = completed_step = true;
                } else {
                    int reason = SSL_get_error(tls, outcome);
                    if (reason != SSL_ERROR_WANT_READ && reason != SSL_ERROR_WANT_WRITE)
                        return abort_handshake(run, REJECT_TLS);
                }
            }
            if (!transfer(run, i, encrypted_chunk)) return abort_handshake(run, REJECT_LIMIT);
        }
        if (!completed_step && moved == run->peers[M1].moved + run->peers[M4].moved)
            return abort_handshake(run, REJECT_LIMIT);
    }
    return true;
}

static bool activate_authenticated_session(Run *run)
{
    for (int i = 0; i < ENDPOINTS; ++i) {
        if (!exact_handshake(&run->peers[i], i)) return abort_handshake(run, REJECT_TLS);
    }
    for (int i = 0; i < ENDPOINTS; ++i) derive(&run->peers[i], i);
    CHECK(CRYPTO_memcmp(run->peers[M1].session, run->peers[M4].session, SESSION) == 0);
    CHECK(CRYPTO_memcmp(run->peers[M1].key, run->peers[M4].key, DIGEST) == 0);
    run->stage_deadline = run->now + 5;
    run->ready = true;
    return true;
}

static bool authenticate(Run *run, size_t encrypted_chunk)
{
    return drive_handshake(run, encrypted_chunk) && activate_authenticated_session(run);
}

static void write_request_bytes(Run *run, const unsigned char *bytes, size_t length)
{
    if (length == 0) return;
    size_t written = 0;
    CHECK(spend(run) && SSL_write_ex(run->peers[M1].tls, bytes, length, &written) == 1);
    CHECK(written == length && drain(run, M1));
}

static bool send_close(Run *run, int peer)
{
    if (!spend(run)) return false;
    int result = SSL_shutdown(run->peers[peer].tls);
    return result >= 0 && drain(run, peer);
}

static Result receive_request(Run *run)
{
    if (!run->ready) return run->result == REVIEW ? REJECT_GATE : run->result;
    if (!allowed(run)) return reject(run, REJECT_GATE);
    SSL *receiver = run->peers[M4].tls;
    for (;;) {
        if (!spend(run)) return reject(run, REJECT_LIMIT);
        size_t boundary = run->used < PREAMBLE ? PREAMBLE : FRAME;
        unsigned char trailing = 0;
        unsigned char *destination = run->used == FRAME ? &trailing : run->frame + run->used;
        size_t room = run->used == FRAME ? 1 : boundary - run->used;
        size_t read = 0;
        ERR_clear_error();
        int result = SSL_read_ex(receiver, destination, room, &read);
        if (result == 1) {
            if (run->used == FRAME) return reject(run, REJECT_FRAMING);
            run->used += read;
            if (run->used == PREAMBLE && memcmp(run->frame, preamble, PREAMBLE) != 0)
                return reject(run, REJECT_FRAMING);
            continue;
        }
        int reason = SSL_get_error(receiver, result);
        if (reason == SSL_ERROR_WANT_READ) return PENDING;
        if (reason != SSL_ERROR_ZERO_RETURN || !(SSL_get_shutdown(receiver) & SSL_RECEIVED_SHUTDOWN))
            return reject(run, REJECT_TLS);
        if (run->used != FRAME) return reject(run, REJECT_FRAMING);
        Result disposition = validate_frame(&run->peers[M4], run->frame);
        if (disposition != REVIEW) return reject(run, disposition);
        if (!allowed(run)) return reject(run, REJECT_GATE);
        if (!send_close(run, M4) || !spend(run)) return reject(run, REJECT_LIMIT);

        // The test endpoint sees a TLS alert only. No application response is sent.
        ERR_clear_error();
        SSL *sender = run->peers[M1].tls;
        int closed = SSL_read_ex(sender, &trailing, 1, &read);
        if (SSL_get_error(sender, closed) != SSL_ERROR_ZERO_RETURN ||
            !(SSL_get_shutdown(sender) & SSL_RECEIVED_SHUTDOWN) ||
            SSL_SESSION_has_ticket(SSL_get_session(sender))) return reject(run, REJECT_TLS);
        release(run);
        run->stage_deadline = run->now + 60;
        return run->result = REVIEW;
    }
}

static bool requires_local_approval(Run *run)
{
    if (run->result != REVIEW) return false;
    if (allowed(run)) return true;
    reject(run, REJECT_GATE);
    return false;
}

static Run fresh_run(void)
{
    return (Run){.policy_generation = 1};
}

static void standard_pair(Run *run)
{
    Identity client = new_identity(M1, certificate_time);
    Identity server = new_identity(M4, certificate_time);
    const Config config[] = {configuration(&client, &server), configuration(&server, &client)};
    CHECK(open_run(run, config));
    destroy_identity(&server);
    destroy_identity(&client);
}

static void standard_session(Run *run, size_t encrypted_chunk)
{
    standard_pair(run);
    CHECK(authenticate(run, encrypted_chunk));
}

static void test_all_splits(void)
{
    for (size_t split = 0; split <= FRAME; ++split) {
        Run run = fresh_run();
        standard_session(&run, split == 1 ? 1 : BIO_LIMIT);
        unsigned char frame[FRAME];
        make_frame(&run.peers[M1], frame);
        write_request_bytes(&run, frame, split);
        CHECK(receive_request(&run) == PENDING && !requires_local_approval(&run));
        write_request_bytes(&run, frame + split, FRAME - split);
        CHECK(receive_request(&run) == PENDING && !requires_local_approval(&run));
        CHECK(send_close(&run, M1));
        CHECK(receive_request(&run) == REVIEW && requires_local_approval(&run));
        CHECK(receive_request(&run) == REJECT_GATE && requires_local_approval(&run));
        CHECK(!run.ready && run.used == 0 && run.peers[M4].tls == NULL);
        OPENSSL_cleanse(frame, sizeof(frame));
    }
}

static void test_profile_mismatches(void)
{
    for (int i = 0; i < 6; ++i) {
        Run run = fresh_run();
        Identity client = new_identity(M1, certificate_time);
        Identity server = new_identity(M4, certificate_time);
        Config config[] = {configuration(&client, &server), configuration(&server, &client)};
        switch (i) {
        case 0: config[M1].omit_alpn = true; break;
        case 1: config[M1].wrong_alpn = true; break;
        case 2: config[M1].version = TLS1_2_VERSION; break;
        case 3: config[M1].suite = "TLS_AES_256_GCM_SHA384"; break;
        case 4: config[M1].group = "P-256"; break;
        case 5: config[M1].omit_certificate = true; break;
        }
        CHECK(open_run(&run, config));
        CHECK(!authenticate(&run, BIO_LIMIT));
        CHECK(run.result == REJECT_TLS && !requires_local_approval(&run));
        destroy_identity(&server);
        destroy_identity(&client);
    }
}

static X509 *corrupt_self_signature(X509 *cert)
{
    unsigned char bytes[CERT_LIMIT];
    unsigned char *cursor = bytes;
    int size = i2d_X509(cert, NULL);
    CHECK(size > 0 && size <= CERT_LIMIT && i2d_X509(cert, &cursor) == size);
    bytes[size - 1] ^= 1;
    const unsigned char *reader = bytes;
    X509 *corrupt = d2i_X509(NULL, &reader, size);
    CHECK(corrupt != NULL && reader == bytes + size);
    return corrupt;
}

static void test_certificate_failures(void)
{
    enum { WRONG_PIN, WRONG_TRUST, SAME_KEY_NEW_CERT, WRONG_ROLE, EXPIRED,
           FUTURE, BAD_SIGNATURE, TOO_LONG, OVERSIZED, CASES };
    for (int role = M1; role <= M4; ++role) {
        for (int scenario = 0; scenario < CASES; ++scenario) {
            Run run = fresh_run();
            Identity endpoint[] = {new_identity(M1, certificate_time), new_identity(M4, certificate_time)};
            Identity unrelated = new_identity(role, certificate_time);
            Config config[] = {configuration(&endpoint[M1], &endpoint[M4]),
                               configuration(&endpoint[M4], &endpoint[M1])};
            Identity substituted = endpoint[role];
            X509 *replacement = NULL;
            switch (scenario) {
            case WRONG_PIN: config[1 - role].pin = unrelated.cert; break;
            case WRONG_TRUST: config[1 - role].trust = unrelated.cert; break;
            case SAME_KEY_NEW_CERT:
                replacement = certificate(substituted.key, role, 25, certificate_time, -1, 599, false);
                break;
            case WRONG_ROLE: replacement = certificate(substituted.key, 1 - role, 25, certificate_time, -1, 599, false); break;
            case EXPIRED: replacement = certificate(substituted.key, role, 25, certificate_time, -601, -1, false); break;
            case FUTURE: replacement = certificate(substituted.key, role, 25, certificate_time, 1, 601, false); break;
            case BAD_SIGNATURE: replacement = corrupt_self_signature(substituted.cert); break;
            case TOO_LONG: replacement = certificate(substituted.key, role, 25, certificate_time, -1, 600, false); break;
            case OVERSIZED: replacement = certificate(substituted.key, role, 25, certificate_time, -1, 599, true); break;
            }
            if (replacement != NULL) {
                substituted.cert = replacement;
                config[role].identity = &substituted;
                config[1 - role].trust = replacement;
                if (scenario != SAME_KEY_NEW_CERT) config[1 - role].pin = replacement;
            }
            CHECK(open_run(&run, config));
            CHECK(!authenticate(&run, BIO_LIMIT));
            CHECK(run.result == REJECT_TLS && !requires_local_approval(&run));
            X509_free(replacement);
            destroy_identity(&unrelated);
            destroy_identity(&endpoint[M4]);
            destroy_identity(&endpoint[M1]);
        }
    }
}


static void test_frame_failures(void)
{
    enum { VERSION, SCHEMA, KIND, DIRECTION, LENGTH, SEQUENCE, SENDER, RECEIVER, NONCE,
           MESSAGE, CORRELATION, MAC, DIGEST_VALUE, AUTHORITY, TRUNCATED, TRAILING,
           SECOND_FRAME, BARE_EOF, CASES };
    for (int scenario = 0; scenario < CASES; ++scenario) {
        Run run = fresh_run();
        standard_session(&run, BIO_LIMIT);
        unsigned char frame[2 * FRAME];
        make_frame(&run.peers[M1], frame);
        size_t length = FRAME;
        Result expected = REJECT_FRAMING;
        switch (scenario) {
        case VERSION: frame[4] = 2; break;
        case SCHEMA: frame[5] = 2; break;
        case KIND: frame[6] = 2; break;
        case DIRECTION: frame[7] = 2; break;
        case LENGTH: frame[10] = 255; break;
        case SEQUENCE: frame[15] = 2; expected = REJECT_AUTH; break;
        case SENDER: frame[M1_PIN_AT] ^= 1; expected = REJECT_AUTH; break;
        case RECEIVER: frame[M4_PIN_AT] ^= 1; expected = REJECT_AUTH; break;
        case NONCE: memcpy(frame + NONCE_AT, frame + MESSAGE_AT, SESSION); expected = REJECT_AUTH; break;
        case MESSAGE: memset(frame + MESSAGE_AT, 0, SESSION); expected = REJECT_AUTH; break;
        case CORRELATION: frame[CORRELATION_AT] = 1; expected = REJECT_AUTH; break;
        case MAC: frame[TAG_AT] ^= 1; expected = REJECT_AUTH; break;
        case DIGEST_VALUE: frame[DIGEST_AT] ^= 1; expected = REJECT_PAYLOAD; break;
        case AUTHORITY: {
            const char extra[] = "{\"approval\":true}";
            memset(frame + PAYLOAD_AT, ' ', sizeof(payload) - 1);
            memcpy(frame + PAYLOAD_AT, extra, sizeof(extra) - 1);
            payload_digest(frame + PAYLOAD_AT, frame + DIGEST_AT);
            expected = REJECT_PAYLOAD;
            break;
        }
        case TRUNCATED: --length; break;
        case TRAILING: frame[length++] = 0; break;
        case SECOND_FRAME: memcpy(frame + FRAME, frame, FRAME); length *= 2; break;
        case BARE_EOF: expected = REJECT_TLS; break;
        }
        if (scenario != MAC) frame_mac(frame, run.peers[M1].key, frame + TAG_AT);
        write_request_bytes(&run, frame, length);
        if (scenario == BARE_EOF) {
            CHECK(receive_request(&run) == PENDING);
            CHECK(BIO_shutdown_wr(run.peers[M4].wire) == 1);
        } else {
            CHECK(send_close(&run, M1));
        }
        CHECK(receive_request(&run) == expected && !requires_local_approval(&run));
        CHECK(!run.ready && run.used == 0 && run.peers[M4].tls == NULL);
        OPENSSL_cleanse(frame, sizeof(frame));
    }
}

static void test_session_binding(void)
{
    Run old = fresh_run();
    standard_session(&old, BIO_LIMIT);
    unsigned char frame[FRAME];
    make_frame(&old.peers[M1], frame);
    for (int retry = 0; retry < 2; ++retry) {
        Run fresh = fresh_run();
        standard_session(&fresh, BIO_LIMIT);
        CHECK(CRYPTO_memcmp(old.peers[M1].session, fresh.peers[M1].session, SESSION) != 0);
        CHECK(CRYPTO_memcmp(old.peers[M1].key, fresh.peers[M1].key, DIGEST) != 0);
        if (retry == 1) {
            // A correct new tag and pins still cannot move the old session binding.
            digest_cert(SSL_get_certificate(fresh.peers[M1].tls), frame + M1_PIN_AT);
            memcpy(frame + M4_PIN_AT, fresh.peers[M1].pin, DIGEST);
            frame_mac(frame, fresh.peers[M1].key, frame + TAG_AT);
        }
        write_request_bytes(&fresh, frame, FRAME);
        CHECK(send_close(&fresh, M1) && receive_request(&fresh) == REJECT_AUTH);
        CHECK(!requires_local_approval(&fresh));
    }
    release(&old);
    OPENSSL_cleanse(frame, sizeof(frame));
}

static void mutate_gate(Run *run, int scenario)
{
    switch (scenario) {
    case 0: run->stopped = true; break;
    case 1: run->paused = true; break;
    case 2: run->revoked = true; break;
    case 3: ++run->policy_generation; break;
    case 4: run->now = run->stage_deadline; break;
    }
}

static void test_review_gates(void)
{
    for (int scenario = 0; scenario < 5; ++scenario) {
        for (int during_review = 0; during_review < 2; ++during_review) {
            Run run = fresh_run();
            standard_session(&run, BIO_LIMIT);
            unsigned char frame[FRAME];
            make_frame(&run.peers[M1], frame);
            write_request_bytes(&run, frame, FRAME);
            CHECK(receive_request(&run) == PENDING && send_close(&run, M1));
            if (during_review) CHECK(receive_request(&run) == REVIEW && requires_local_approval(&run));
            mutate_gate(&run, scenario);
            if (!during_review) CHECK(receive_request(&run) == REJECT_GATE);
            CHECK(!requires_local_approval(&run));
            run.paused = run.stopped = run.revoked = false;
            run.policy_generation = 1;
            run.now = 0;
            CHECK(!requires_local_approval(&run));
            OPENSSL_cleanse(frame, sizeof(frame));
        }
    }

    Identity client = new_identity(M1, certificate_time);
    Identity server = new_identity(M4, certificate_time);
    for (int scenario = 0; scenario < 3; ++scenario) {
        Run run = fresh_run();
        Config config[] = {configuration(&client, &server), configuration(&server, &client)};
        if (scenario == 2) run.now = 120;
        else config[scenario].confirmed = false;
        CHECK(!open_run(&run, config) && run.result == REJECT_GATE);
        config[M1].confirmed = config[M4].confirmed = true;
        run.now = 0;
        CHECK(!open_run(&run, config));
        CHECK(run.calls == 0 && run.peers[M1].tls == NULL && run.peers[M4].tls == NULL);
    }
    destroy_identity(&server);
    destroy_identity(&client);
}

static void test_limits(void)
{
    for (int scenario = 0; scenario < 5; ++scenario) {
        Run run = fresh_run();
        if (scenario == 4) run.now = 1;
        standard_pair(&run);
        switch (scenario) {
        case 0: run.calls = IO_LIMIT; break;
        case 1: run.peers[M1].moved = WIRE_LIMIT; break;
        case 2: break; // Withhold encrypted input to model a stalled transport.
        case 3: run.now = run.stage_deadline; break;
        case 4: run.now = 0; break;
        }
        CHECK(!authenticate(&run, scenario == 2 ? 0 : BIO_LIMIT));
        CHECK(run.result == (scenario >= 3 ? REJECT_GATE : REJECT_LIMIT));
        CHECK(!requires_local_approval(&run));
    }
}

static void consume_ticket(Run *run)
{
    CHECK(drain(run, M4) && spend(run));
    unsigned char unexpected = 0;
    size_t length = 0;
    ERR_clear_error();
    SSL *client = run->peers[M1].tls;
    int result = SSL_read_ex(client, &unexpected, 1, &length);
    CHECK(SSL_get_error(client, result) == SSL_ERROR_WANT_READ && length == 0);
}

static SSL_SESSION *seed_ticket(const Config config[ENDPOINTS], SSL_CTX **ticket_context)
{
    Run seed = fresh_run();
    CHECK(open_run(&seed, config));
    Endpoint *server = &seed.peers[M4];
    // Test control only. The actual fixture endpoint always starts with these
    // features disabled. This different context creates a real offer to reject.
    const unsigned char ticket_namespace[] = "DOSAI offline ticket control";
    CHECK(SSL_CTX_set_session_id_context(server->context, ticket_namespace,
          sizeof(ticket_namespace) - 1) == 1);
    SSL_CTX_clear_options(server->context, SSL_OP_NO_TICKET);
    SSL_CTX_set_options(server->context, SSL_OP_NO_ANTI_REPLAY);
    CHECK(SSL_CTX_set_num_tickets(server->context, 1) == 1);
    CHECK(SSL_CTX_set_max_early_data(server->context, 1024) == 1);
    SSL_free(server->tls);
    BIO_free(server->wire);
    attach_tls(server, &config[M4], M4);
    CHECK(drive_handshake(&seed, BIO_LIMIT));
    consume_ticket(&seed);

    SSL_SESSION *ticket = SSL_get1_session(seed.peers[M1].tls);
    CHECK(ticket != NULL && SSL_SESSION_has_ticket(ticket) &&
          SSL_SESSION_get_max_early_data(ticket) == 1024);
    CHECK(send_close(&seed, M1) && send_close(&seed, M4) && send_close(&seed, M1));
    CHECK(SSL_SESSION_is_resumable(ticket));
    CHECK(SSL_CTX_up_ref(server->context) == 1);
    *ticket_context = server->context;
    release(&seed);
    return ticket;
}

static void test_early_data_and_resumption(void)
{
    Identity client = new_identity(M1, certificate_time);
    Identity server = new_identity(M4, certificate_time);
    const Config config[] = {configuration(&client, &server), configuration(&server, &client)};
    SSL_CTX *ticket_context = NULL;
    SSL_SESSION *ticket = seed_ticket(config, &ticket_context);

    Run strict = fresh_run();
    CHECK(open_run(&strict, config));
    // Retain the ticket for the following misconfiguration control as well.
    SSL_SESSION *early_ticket = SSL_SESSION_dup(ticket);
    CHECK(early_ticket != NULL && SSL_set_session(strict.peers[M1].tls, early_ticket) == 1);
    size_t written = 0;
    CHECK(spend(&strict) && SSL_write_early_data(strict.peers[M1].tls, payload,
          sizeof(payload) - 1, &written) == 1 && written == sizeof(payload) - 1);
    CHECK(!authenticate(&strict, BIO_LIMIT) && strict.result == REJECT_TLS);
    CHECK(!requires_local_approval(&strict));
    SSL_SESSION_free(early_ticket);

    Run resumed = fresh_run();
    CHECK(open_run(&resumed, config));
    Endpoint *permissive = &resumed.peers[M4];
    SSL_free(permissive->tls);
    BIO_free(permissive->wire);
    SSL_CTX_free(permissive->context);
    permissive->context = ticket_context;
    attach_tls(permissive, &config[M4], M4);
    CHECK(SSL_set_session(resumed.peers[M1].tls, ticket) == 1);
    CHECK(drive_handshake(&resumed, BIO_LIMIT));
    CHECK(SSL_session_reused(resumed.peers[M1].tls) && SSL_session_reused(resumed.peers[M4].tls));
    CHECK(!activate_authenticated_session(&resumed) && resumed.result == REJECT_TLS);
    CHECK(!requires_local_approval(&resumed));
    SSL_SESSION_free(ticket);
    destroy_identity(&server);
    destroy_identity(&client);
}

int main(void)
{
    CHECK(OPENSSL_init_ssl(OPENSSL_INIT_NO_LOAD_CONFIG, NULL) == 1);
    CHECK(OpenSSL_version_num() == OPENSSL_VERSION_NUMBER);
    test_all_splits();
    puts("ok - 239 plaintext splits and authenticated TLS closure");
    test_profile_mismatches();
    puts("ok - six TLS profile and certificate-presence failures");
    test_certificate_failures();
    puts("ok - 18 peer pin, role and certificate failures");
    test_frame_failures();
    puts("ok - 18 frame, authority and TLS truncation failures");
    test_session_binding();
    puts("ok - old session and reauthenticated replay rejected");
    test_review_gates();
    puts("ok - missing consent and stop, pause, revoke, policy and expiry gates");
    test_limits();
    puts("ok - deadline, wire and I/O limits and stalled transport");
    test_early_data_and_resumption();
    puts("ok - real early data and resumed handshake rejected");
    return EXIT_SUCCESS;
}
