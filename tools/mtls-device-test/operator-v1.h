// Pairing and plan-specific confirmation on a distinct local terminal path.
#ifndef DOSAI_FIXTURE_MTLS_OPERATOR_V1
#define DOSAI_FIXTURE_MTLS_OPERATOR_V1

#include "transport-v1.h"

enum { OPERATOR_LINE = 136, OPERATOR_PROMPT = 320, OPERATOR_MAX_IO = 2048 };

typedef struct {
    void *context;
    bool (*foreground)(void *context);
    bool (*discard_pending_input)(void *context);
    ptrdiff_t (*read)(void *context, unsigned char *bytes, size_t capacity);
    ptrdiff_t (*write)(void *context, const unsigned char *bytes, size_t count);
    bool (*close)(void *context);
} OwnedTerminal;

typedef struct {
    Device *device;
    DriverClock clock;
    OwnedTerminal terminal;
    LocalPairing pairing;
    unsigned char peer_leaf[CERT_LIMIT];
    size_t leaf_size;
    unsigned char digest[DIGEST];
    char expected[OPERATOR_LINE];
    size_t expected_length;
    unsigned char line[OPERATOR_LINE];
    size_t line_length;
    char prompt[OPERATOR_PROMPT];
    size_t prompt_length;
    size_t prompt_sent;
    bool used;
    bool open;
    bool review;
    unsigned calls;
} OperatorDriver;

static void operator_hex(const unsigned char digest[DIGEST], char out[2 * DIGEST + 1])
{
    const char alphabet[] = "0123456789abcdef";
    for (size_t i = 0; i < DIGEST; ++i) {
        out[2 * i] = alphabet[digest[i] >> 4];
        out[2 * i + 1] = alphabet[digest[i] & 15];
    }
    out[2 * DIGEST] = 0;
}

static bool operator_close(OperatorDriver *driver)
{
    if (!driver->open) return false;
    driver->open = false;
    OPENSSL_cleanse(driver->line, sizeof(driver->line));
    OPENSSL_cleanse(driver->prompt, sizeof(driver->prompt));
    OPENSSL_cleanse(driver->expected, sizeof(driver->expected));
    return driver->terminal.close(driver->terminal.context);
}

static void operator_forget(OperatorDriver *driver)
{
    OPENSSL_cleanse(driver->digest, sizeof(driver->digest));
    OPENSSL_cleanse(driver->peer_leaf, sizeof(driver->peer_leaf));
    OPENSSL_cleanse(&driver->pairing, sizeof(driver->pairing));
    driver->leaf_size = 0;
}

static bool operator_stop(OperatorDriver *driver)
{
    if (!driver->used) return false;
    device_stop(driver->device);
    if (driver->open) operator_close(driver);
    operator_forget(driver);
    return false;
}

static bool operator_open(OperatorDriver *driver, Device *device,
                          OwnedTerminal terminal, DriverClock clock)
{
    if (driver->used || device == NULL || terminal.foreground == NULL ||
        terminal.discard_pending_input == NULL || terminal.read == NULL ||
        terminal.write == NULL || terminal.close == NULL || clock.elapsed == NULL) return false;
    *driver = (OperatorDriver){.device = device, .clock = clock, .terminal = terminal,
                               .used = true, .open = true};
    if (!terminal.foreground(terminal.context)) return operator_stop(driver);
    return true;
}

static bool operator_prompt(OperatorDriver *driver, const char *heading)
{
    int length = snprintf(driver->prompt, sizeof(driver->prompt), "%s\n%s", heading, driver->expected);
    if (length < 0 || (size_t)length >= sizeof(driver->prompt) ||
        !driver->terminal.discard_pending_input(driver->terminal.context)) return operator_stop(driver);
    driver->prompt_length = (size_t)length;
    driver->expected_length = strlen(driver->expected);
    return true;
}

static bool operator_pair(OperatorDriver *driver, Device *device, OwnedTerminal terminal,
                          DriverClock clock, const unsigned char *peer_der, size_t size)
{
    if (!operator_open(driver, device, terminal, clock)) return false;
    unsigned elapsed;
    if (!clock.elapsed(clock.context, &elapsed) || !device_time(device, elapsed) ||
        device->stage != DEVICE_PAIRING || peer_der == NULL || size == 0 || size > CERT_LIMIT)
        return operator_stop(driver);

    driver->pairing.scope = device->scope;
    memcpy(driver->peer_leaf, peer_der, size);
    driver->leaf_size = size;
    digest_cert(device->identity.cert, driver->pairing.pins[device->role]);
    if (EVP_Q_digest(NULL, "SHA256", NULL, driver->peer_leaf, size,
                     driver->pairing.pins[1 - device->role], NULL) != 1) return operator_stop(driver);

    char m1[2 * DIGEST + 1], m4[2 * DIGEST + 1];
    operator_hex(driver->pairing.pins[M1], m1);
    operator_hex(driver->pairing.pins[M4], m4);
    int length = snprintf(driver->expected, sizeof(driver->expected), "PAIR %s %s\n", m1, m4);
    if (length < 0 || (size_t)length >= sizeof(driver->expected)) return operator_stop(driver);
    uint32_t m1_ip = device->scope.m1, m4_ip = device->scope.m4;
    char heading[160];
    length = snprintf(heading, sizeof(heading),
        "Fixture v1, local role M%d. M1 %u.%u.%u.%u to M4 %u.%u.%u.%u port %u. "
        "Compare both role-ordered fingerprints and type the exact line.",
        device->role == M1 ? 1 : 4,
        m1_ip >> 24, (m1_ip >> 16) & 255, (m1_ip >> 8) & 255, m1_ip & 255,
        m4_ip >> 24, (m4_ip >> 16) & 255, (m4_ip >> 8) & 255, m4_ip & 255,
        (unsigned)device->scope.m4_port);
    if (length < 0 || (size_t)length >= sizeof(heading)) return operator_stop(driver);
    return operator_prompt(driver, heading);
}

// The caller supplies the digest from the trusted local policy layer after
// preflight. Confirmation is returned only to that local caller. It never
// creates a plan, grant, execution result, or reply to the peer.
static bool operator_review(OperatorDriver *driver, Device *device, OwnedTerminal terminal,
                            DriverClock clock, const unsigned char digest[DIGEST])
{
    if (!operator_open(driver, device, terminal, clock)) return false;
    unsigned elapsed;
    if (!clock.elapsed(clock.context, &elapsed) || device->role != M4 ||
        !device_bind_local_plan(device, digest, elapsed)) return operator_stop(driver);
    driver->review = true;
    memcpy(driver->digest, digest, DIGEST);
    char plan[2 * DIGEST + 1];
    operator_hex(driver->digest, plan);
    int length = snprintf(driver->expected, sizeof(driver->expected), "APPROVE %s\n", plan);
    if (length < 0 || (size_t)length >= sizeof(driver->expected)) return operator_stop(driver);
    return operator_prompt(driver,
        "Local review: SUMMARIZE_FIXTURE, synthetic only. Type the exact approval line or DENY.");
}

static bool operator_step(OperatorDriver *driver)
{
    if (!driver->open) return false;
    OwnedTerminal *tty = &driver->terminal;
    Device *device = driver->device;
    unsigned elapsed;
    if (driver->calls == OPERATOR_MAX_IO || !tty->foreground(tty->context) ||
        !driver->clock.elapsed(driver->clock.context, &elapsed) || !device_time(device, elapsed))
        return operator_stop(driver);
    ++driver->calls;

    size_t remaining = driver->prompt_length - driver->prompt_sent;
    if (remaining != 0) {
        ptrdiff_t count = tty->write(tty->context,
            (const unsigned char *)driver->prompt + driver->prompt_sent, remaining);
        if (count == DRIVER_AGAIN) return true;
        if (count <= 0 || (size_t)count > remaining) return operator_stop(driver);
        driver->prompt_sent += (size_t)count;
        return true;
    }

    size_t capacity = sizeof(driver->line) - driver->line_length;
    if (capacity == 0) return operator_stop(driver);
    ptrdiff_t count = tty->read(tty->context, driver->line + driver->line_length, capacity);
    if (count == DRIVER_AGAIN) return true;
    if (count <= 0 || (size_t)count > capacity) return operator_stop(driver);
    driver->line_length += (size_t)count;
    const unsigned char *newline = memchr(driver->line, '\n', driver->line_length);
    if (newline == NULL) return true;
    if (newline != driver->line + driver->line_length - 1) return operator_stop(driver);
    bool exact = driver->line_length == driver->expected_length &&
        CRYPTO_memcmp(driver->line, driver->expected, driver->expected_length) == 0;
    bool denied = driver->review && driver->line_length == 5 && memcmp(driver->line, "DENY\n", 5) == 0;
    if ((!exact && !denied) || !tty->foreground(tty->context) || !operator_close(driver) ||
        !driver->clock.elapsed(driver->clock.context, &elapsed)) return operator_stop(driver);

    bool accepted = driver->review
        ? device_finish_local_review(device, exact, driver->digest, elapsed)
        : device_confirm(device, driver->peer_leaf, driver->leaf_size, &driver->pairing, elapsed);
    operator_forget(driver);
    return accepted;
}

#endif
