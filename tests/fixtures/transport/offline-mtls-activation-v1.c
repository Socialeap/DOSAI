#include "offline-mtls-driver-fixture-v1.h"
#include "../../../tools/mtls-device-test/activation-v1.h"
#include <unistd.h>

typedef struct {
    DeviceActivation sides[ENDPOINTS];
    Wire wires[ENDPOINTS];
    TestClock tick;
} ActivationFixture;

static void prepare(ActivationFixture *fixture)
{
    DriverClock clock = {&fixture->tick, test_elapsed};
    for (int role = M1; role <= M4; ++role)
        CHECK(activation_prepare(&fixture->sides[role], role, scope, start_utc, 7, clock));
    fixture->wires[M1] = (Wire){.other = &fixture->wires[M4],
        .endpoints = {scope.m1, scope.m4, 50100, scope.m4_port}};
    fixture->wires[M4] = (Wire){.other = &fixture->wires[M1],
        .endpoints = {scope.m4, scope.m1, scope.m4_port, 50100}};
}

static void run_steps(DeviceActivation *run, const OperatorDriver *operator)
{
    for (unsigned i = 0; i < OPERATOR_MAX_IO && operator->open; ++i) CHECK(activation_step(run));
    CHECK(!operator->open);
}

static void show_prompt(DeviceActivation *run, const OperatorDriver *operator)
{
    for (unsigned i = 0; i < OPERATOR_MAX_IO && operator->prompt_sent < operator->prompt_length; ++i)
        CHECK(activation_step(run));
    CHECK(operator->prompt_sent == operator->prompt_length);
}

static void reach_review(ActivationFixture *fixture)
{
    prepare(fixture);
    unsigned char leaves[ENDPOINTS][CERT_LIMIT];
    size_t sizes[ENDPOINTS];
    for (int role = M1; role <= M4; ++role) {
        sizes[role] = device_public_leaf(&fixture->sides[role].device, leaves[role]);
        CHECK(sizes[role] > 0);
    }
    fixture->tick.seconds = 1;
    for (int role = M1; role <= M4; ++role) {
        DeviceActivation *run = &fixture->sides[role];
        Terminal terminal = {.foreground = true, .step_read = 4};
        CHECK(activation_pair(run, console(&terminal), leaves[1 - role], sizes[1 - role]));
        CHECK(!activation_transport(run, stream(&fixture->wires[role])));
        show_prompt(run, &run->pairing);
        const char *line = strchr(terminal.display, '\n');
        CHECK(line != NULL && strncmp(line + 1, "PAIR ", 5) == 0);
        type_line(&terminal, line + 1);
        run_steps(run, &run->pairing);
        CHECK(run->device.stage == DEVICE_PAIRED && terminal.closes == 1);
    }
    fixture->tick.seconds = 2;
    for (int role = M1; role <= M4; ++role)
        CHECK(activation_transport(&fixture->sides[role], stream(&fixture->wires[role])));
    fixture->tick.seconds = 3;
    for (unsigned i = 0; i < 8192; ++i) {
        bool active = false;
        for (int role = M1; role <= M4; ++role) {
            DeviceActivation *run = &fixture->sides[role];
            if (run->transport.open) {
                active = true;
                CHECK(activation_step(run));
            }
        }
        if (!active) break;
    }
    CHECK(fixture->sides[M1].device.stage == DEVICE_SENT_DELIVERY_UNKNOWN);
    CHECK(fixture->wires[M1].closes == 1 && fixture->wires[M4].closes == 1);
    CHECK(activation_take_proposal(&fixture->sides[M1]) == DEVICE_NO_PROPOSAL);
    CHECK(activation_take_proposal(&fixture->sides[M4]) == DEVICE_UNTRUSTED_SUMMARIZE_FIXTURE);
    CHECK(activation_take_proposal(&fixture->sides[M4]) == DEVICE_NO_PROPOSAL);
}

static ActivationDecision review(ActivationFixture *fixture, const unsigned char plan[DIGEST],
                                 bool deny, bool stop_before, bool stop_after, bool expire,
                                 unsigned char binding[DIGEST])
{
    DeviceActivation *run = &fixture->sides[M4];
    Terminal terminal = {.foreground = true, .step_read = 3};
    CHECK(activation_review(run, console(&terminal), plan));
    CHECK(activation_take_decision(run, binding) == LOCAL_REVIEW_PENDING);
    show_prompt(run, &run->review);
    char hex[2 * DIGEST + 1], expected[OPERATOR_LINE];
    operator_hex(plan, hex);
    CHECK(snprintf(expected, sizeof(expected), "APPROVE %s\n", hex) == 73);
    const char *line = strchr(terminal.display, '\n');
    CHECK(line != NULL && strcmp(line + 1, expected) == 0);
    type_line(&terminal, deny ? "DENY\n" : expected);
    if (stop_before) activation_stop(run);
    else run_steps(run, &run->review);
    if (stop_after) activation_policy_changed(run, 8);
    if (expire) fixture->tick.seconds = 63;
    CHECK(terminal.closes == 1 && !run->device.has_plan && !run->review.open);
    ActivationDecision decision = activation_take_decision(run, binding);
    CHECK(activation_take_decision(run, binding) == LOCAL_REVIEW_PENDING);
    return decision;
}

static void read_plan(unsigned char plan[DIGEST])
{
    size_t offset = 0;
    while (offset < DIGEST) {
        ssize_t count = read(3, plan + offset, DIGEST - offset);
        CHECK(count > 0);
        offset += (size_t)count;
    }
    unsigned char trailing;
    CHECK(read(3, &trailing, 1) == 0);
}

static void write_record(const unsigned char *bytes, size_t size)
{
    while (size > 0) {
        ssize_t count = write(4, bytes, size);
        CHECK(count > 0);
        bytes += count;
        size -= (size_t)count;
    }
}

int main(int argc, char **argv)
{
    CHECK(OPENSSL_init_ssl(OPENSSL_INIT_NO_LOAD_CONFIG, NULL) == 1);
    CHECK(OpenSSL_version_num() == OPENSSL_VERSION_NUMBER);
    if (argc == 1) {
        const unsigned char plan[DIGEST] = {1};
        for (int scenario = 0; scenario < 5; ++scenario) {
            ActivationFixture fixture = {0};
            reach_review(&fixture);
            unsigned char binding[DIGEST] = {0};
            ActivationDecision outcome = review(&fixture, plan, scenario == 1,
                                                scenario == 2, scenario == 3, scenario == 4, binding);
            CHECK(outcome == (scenario == 0 ? LOCAL_REVIEW_CONFIRMED :
                             scenario == 1 ? LOCAL_REVIEW_DENIED : LOCAL_REVIEW_STOPPED));
            const unsigned char empty[DIGEST] = {0};
            CHECK(CRYPTO_memcmp(binding, scenario >= 2 ? empty : plan, DIGEST) == 0);
        }
        puts("ok - one-shot activation, M4-only review, exact plan, denial and late stop");
        return EXIT_SUCCESS;
    }
    CHECK(argc == 2 && (strcmp(argv[1], "approve") == 0 || strcmp(argv[1], "deny") == 0 ||
                       strcmp(argv[1], "late-stop") == 0));
    ActivationFixture fixture = {0};
    reach_review(&fixture);
    write_record((const unsigned char *)"P", 1);
    unsigned char decision[1 + DIGEST] = {0};
    unsigned char plan[DIGEST];
    read_plan(plan);
    ActivationDecision outcome = review(&fixture, plan, strcmp(argv[1], "deny") == 0,
                                        false, strcmp(argv[1], "late-stop") == 0, false, decision + 1);
    OPENSSL_cleanse(plan, sizeof(plan));
    CHECK(outcome != LOCAL_REVIEW_PENDING);
    decision[0] = outcome == LOCAL_REVIEW_CONFIRMED ? 'C' :
                  outcome == LOCAL_REVIEW_DENIED ? 'D' : 'S';
    write_record(decision, sizeof(decision));
    OPENSSL_cleanse(decision, sizeof(decision));
    return EXIT_SUCCESS;
}
