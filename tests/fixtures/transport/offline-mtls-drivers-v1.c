#include "offline-mtls-driver-fixture-v1.h"
#include "../../../tools/mtls-device-test/macos-io-v1.h"

static const unsigned char digest[DIGEST] = {1};

static const char *finish_prompt(OperatorDriver *driver, Terminal *terminal)
{
    while (driver->prompt_sent < driver->prompt_length) CHECK(operator_step(driver));
    CHECK(terminal->reads == 0);
    const char *line = strchr(terminal->display, '\n');
    CHECK(line != NULL);
    return line + 1;
}

static bool finish_input(OperatorDriver *driver)
{
    for (unsigned i = 0; i < OPERATOR_LINE + 1 && driver->open; ++i) {
        if (!operator_step(driver)) return false;
    }
    CHECK(!driver->open);
    return true;
}

typedef struct {
    Device devices[ENDPOINTS];
    TransportDriver drivers[ENDPOINTS];
    Wire wires[ENDPOINTS];
    TestClock tick;
} Ceremony;

static void pair(Ceremony *ceremony)
{
    ceremony->tick.seconds = 1;
    unsigned char leaves[ENDPOINTS][CERT_LIMIT];
    size_t sizes[ENDPOINTS];
    for (int role = M1; role <= M4; ++role) {
        CHECK(device_init(&ceremony->devices[role], role, scope, start_utc, 7));
        sizes[role] = device_public_leaf(&ceremony->devices[role], leaves[role]);
        CHECK(sizes[role] > 0);
    }
    char pairing_line[OPERATOR_LINE] = {0};
    for (int role = M1; role <= M4; ++role) {
        Terminal terminal = {.foreground = true, .step_read = 3};
        type_line(&terminal, "old terminal input\n");
        OperatorDriver driver = {0};
        CHECK(operator_pair(&driver, &ceremony->devices[role], console(&terminal),
            (DriverClock){&ceremony->tick, test_elapsed}, leaves[1 - role], sizes[1 - role]));
        CHECK(terminal.discards == 1 && terminal.size == 0);
        const char *input = finish_prompt(&driver, &terminal);
        CHECK(strncmp(input, "PAIR ", 5) == 0 && strlen(input) == 136 - 1);
        if (role == M1) strcpy(pairing_line, input);
        else CHECK(strcmp(pairing_line, input) == 0);
        type_line(&terminal, input);
        CHECK(finish_input(&driver) && ceremony->devices[role].stage == DEVICE_PAIRED);
        CHECK(terminal.closes == 1 && driver.leaf_size == 0);
    }

    ceremony->wires[M1] = (Wire){.other = &ceremony->wires[M4],
        .endpoints = {scope.m1, scope.m4, 50100, scope.m4_port}};
    ceremony->wires[M4] = (Wire){.other = &ceremony->wires[M1],
        .endpoints = {scope.m4, scope.m1, scope.m4_port, 50100}};
}

static void start(Ceremony *ceremony)
{
    pair(ceremony);
    ceremony->tick.seconds = 2;
    for (int role = M1; role <= M4; ++role) {
        CHECK(transport_start(&ceremony->drivers[role], &ceremony->devices[role],
            stream(&ceremony->wires[role]), (DriverClock){&ceremony->tick, test_elapsed}));
    }
    ceremony->tick.seconds = 3;
}

static void pump(Ceremony *ceremony, bool hold_close)
{
    bool released = !hold_close;
    unsigned held = 0;
    for (unsigned i = 0; i < 8192; ++i) {
        Device *receiver = &ceremony->devices[M4];
        if (!released && receiver->stage == DEVICE_DRAIN_M4) {
            ceremony->wires[M4].stall = true;
            CHECK(device_review_proposal(receiver, 3) == DEVICE_NO_PROPOSAL);
            CHECK(ceremony->wires[M4].closes == 0);
            if (++held == 4) {
                CHECK(ceremony->drivers[M4].pending > 0);
                ceremony->wires[M4].stall = false;
                released = true;
            }
        }
        if (!ceremony->drivers[M1].open && !ceremony->drivers[M4].open) {
            CHECK(released);
            return;
        }
        for (int role = M1; role <= M4; ++role) {
            if (ceremony->drivers[role].open) CHECK(transport_step(&ceremony->drivers[role]));
        }
    }
    CHECK(false);
}

static void test_transport_and_local_decisions(void)
{
    for (int decision = 0; decision < 3; ++decision) {
        Ceremony ceremony = {0};
        start(&ceremony);
        pump(&ceremony, true);
        CHECK(ceremony.wires[M1].partial && ceremony.wires[M4].partial);
        CHECK(ceremony.wires[M1].closes == 1 && ceremony.wires[M4].closes == 1);
        CHECK(ceremony.devices[M1].stage == DEVICE_SENT_DELIVERY_UNKNOWN);
        Device *receiver = &ceremony.devices[M4];
        CHECK(device_review_proposal(receiver, 3) == DEVICE_UNTRUSTED_SUMMARIZE_FIXTURE);

        Terminal terminal = {.foreground = true, .step_read = 2};
        OperatorDriver operator = {0};
        CHECK(operator_review(&operator, receiver, console(&terminal),
            (DriverClock){&ceremony.tick, test_elapsed}, digest));
        const char *line = finish_prompt(&operator, &terminal);
        CHECK(strncmp(line, "APPROVE 01", 10) == 0 && strlen(line) == 73);
        type_line(&terminal, decision == 0 ? "DENY\n" : line);
        if (decision == 2) {
            transport_stop(&ceremony.drivers[M4]);
            CHECK(!operator_step(&operator) && receiver->stage == DEVICE_FAILED);
        } else {
            CHECK(finish_input(&operator));
            CHECK(receiver->stage == (decision == 0 ? DEVICE_DENIED : DEVICE_LOCAL_CONFIRMATION_ONLY));
        }
        CHECK(terminal.closes == 1 && !operator_step(&operator));
        CHECK(device_review_proposal(receiver, 3) == DEVICE_NO_PROPOSAL);
        CHECK(ceremony.wires[M4].closes == 1);
    }
}

static void test_transport_failures(void)
{
    for (int variant = 0; variant < 2; ++variant) {
        Ceremony ceremony = {0};
        pair(&ceremony);
        if (variant == 0) ++ceremony.wires[M4].endpoints.peer;
        else ++ceremony.wires[M4].endpoints.local_port;
        CHECK(!transport_start(&ceremony.drivers[M4], &ceremony.devices[M4],
            stream(&ceremony.wires[M4]), (DriverClock){&ceremony.tick, test_elapsed}));
        CHECK(ceremony.wires[M4].closes == 1 && ceremony.devices[M4].stage == DEVICE_FAILED);
        CHECK(!transport_start(&ceremony.drivers[M4], &ceremony.devices[M4],
            stream(&ceremony.wires[M4]), (DriverClock){&ceremony.tick, test_elapsed}));
        device_stop(&ceremony.devices[M1]);
    }
    for (int scenario = 0; scenario < 6; ++scenario) {
        Ceremony ceremony = {0};
        start(&ceremony);
        TransportDriver *m1 = &ceremony.drivers[M1];
        TransportDriver *m4 = &ceremony.drivers[M4];
        switch (scenario) {
        case 0:
            transport_stop(m1); // Bare EOF before the handshake.
            CHECK(!transport_step(m4)); break;
        case 1:
            CHECK(transport_step(m1));
            ceremony.wires[M1].write_error = true;
            CHECK(!transport_step(m1)); break;
        case 2:
            ceremony.tick.seconds = 7;
            CHECK(!transport_step(m4)); break;
        case 3:
            ceremony.tick.unavailable = true;
            CHECK(!transport_step(m4)); break;
        case 4:
            m4->iterations = IO_LIMIT;
            CHECK(!transport_step(m4)); break;
        default:
            ceremony.wires[M4].fail_close = true;
            for (unsigned i = 0; i < 8192 && m4->open; ++i) {
                if (m1->open) CHECK(transport_step(m1));
                transport_step(m4);
            }
            CHECK(ceremony.devices[M4].stage == DEVICE_FAILED);
            break;
        }
        transport_stop(m1);
        transport_stop(m4);
        CHECK(ceremony.wires[M1].closes == 1 && ceremony.wires[M4].closes == 1);
        CHECK(device_review_proposal(&ceremony.devices[M4], 3) == DEVICE_NO_PROPOSAL);
    }
}

static void test_operator_failures(void)
{
    for (int scenario = 0; scenario < 9; ++scenario) {
        Ceremony ceremony = {0};
        start(&ceremony);
        pump(&ceremony, false);
        Device *receiver = &ceremony.devices[M4];
        Terminal terminal = {.foreground = scenario != 0};
        OperatorDriver driver = {0};
        bool started = operator_review(&driver, receiver, console(&terminal),
            (DriverClock){&ceremony.tick, test_elapsed}, digest);
        if (scenario == 0) {
            CHECK(!started && terminal.reads == 0 && terminal.discards == 0);
        } else {
            CHECK(started);
            const char *input = finish_prompt(&driver, &terminal);
            type_line(&terminal, input);
            switch (scenario) {
            case 1: terminal.line[8] = 'f'; break;
            case 2: terminal.foreground = false; break;
            case 3: terminal.close_fails = true; break;
            case 4: ceremony.tick.seconds = 63; break;
            case 5: type_line(&terminal, "DENY\ntrailing\n"); break;
            case 6: terminal.size = 0; terminal.eof = true; break;
            case 7: device_policy_changed(receiver, 8); break;
            default:
                memset(terminal.line, 'a', OPERATOR_LINE);
                terminal.size = OPERATOR_LINE;
                break;
            }
            CHECK(!finish_input(&driver));
        }
        CHECK(terminal.closes == 1 && receiver->stage == DEVICE_FAILED && !receiver->has_plan);
    }
}

static void test_os_adapter_refusal(void)
{
    MacClock clock = {0};
    unsigned seconds = 200;
    CHECK(mac_clock_start(&clock) && mac_clock_elapsed(&clock, &seconds) && seconds < 2);
    MacDescriptor handle = {0};
    OwnedStream inherited = {0};
    OwnedTerminal terminal = {0};
    int fd[2];
    CHECK(pipe(fd) == 0);
    CHECK(!mac_stream_adopt(&handle, fd[0], &inherited));
    CHECK(!mac_terminal_adopt(&handle, fd[1], &terminal));
    CHECK(!mac_stream_adopt(&handle, -1, &inherited));
    CHECK(!mac_terminal_adopt(&handle, -1, &terminal));
    CHECK(!handle.owned && fcntl(fd[0], F_GETFD) >= 0 && fcntl(fd[1], F_GETFD) >= 0);
    CHECK(close(fd[0]) == 0 && close(fd[1]) == 0);
}

int main(void)
{
    CHECK(OPENSSL_init_ssl(OPENSSL_INIT_NO_LOAD_CONFIG, NULL) == 1);
    CHECK(OpenSSL_version_num() == OPENSSL_VERSION_NUMBER);
    test_transport_and_local_decisions();
    puts("ok - fragmented real mTLS, transport teardown, local denial, confirmation and revoke");
    test_transport_failures();
    puts("ok - scoped stream, deadline, I/O, EOF and failed teardown close once");
    test_operator_failures();
    puts("ok - foreground, exact plan, input limits, expiry and policy revocation");
    test_os_adapter_refusal();
    puts("ok - macOS clock samples and descriptor adapters refuse pipes and invalid descriptors");
    return EXIT_SUCCESS;
}
