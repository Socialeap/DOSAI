// Shared in-memory stream and terminal for the standalone native tests.
#ifndef DOSAI_OFFLINE_MTLS_DRIVER_FIXTURE_V1
#define DOSAI_OFFLINE_MTLS_DRIVER_FIXTURE_V1

#include "../../../tools/mtls-device-test/operator-v1.h"

static const time_t start_utc = 1770000000;
static const DeviceScope scope = {0xc0a80111, 0xc0a80112, 49017};

typedef struct {
    unsigned seconds;
    bool unavailable;
} TestClock;

static bool test_elapsed(void *context, unsigned *seconds)
{
    TestClock *clock = context;
    if (clock->unavailable) return false;
    *seconds = clock->seconds;
    return true;
}

typedef struct Wire Wire;
struct Wire {
    Wire *other;
    StreamEndpoints endpoints;
    unsigned char data[167];
    size_t size;
    unsigned closes;
    unsigned writes;
    unsigned partial;
    bool stall;
    bool fail_close;
    bool write_error;
};

static bool wire_observe(void *context, StreamEndpoints *endpoints)
{
    Wire *wire = context;
    *endpoints = wire->endpoints;
    return true;
}

static ptrdiff_t wire_read(void *context, unsigned char *bytes, size_t capacity)
{
    Wire *wire = context;
    if (wire->size == 0) return wire->other->closes ? 0 : DRIVER_AGAIN;
    size_t size = wire->size < capacity ? wire->size : capacity;
    if (size > 31) size = 31;
    memcpy(bytes, wire->data, size);
    memmove(wire->data, wire->data + size, wire->size - size);
    wire->size -= size;
    return (ptrdiff_t)size;
}

static ptrdiff_t wire_write(void *context, const unsigned char *bytes, size_t count)
{
    Wire *wire = context;
    if (wire->write_error || wire->closes || wire->other->closes) return DRIVER_IO_ERROR;
    if (wire->stall || ++wire->writes % 3 == 0) return DRIVER_AGAIN;
    size_t room = sizeof(wire->other->data) - wire->other->size;
    if (room == 0) return DRIVER_AGAIN;
    size_t size = count < room ? count : room;
    if (size > 19) size = 19;
    if (size < count) ++wire->partial;
    memcpy(wire->other->data + wire->other->size, bytes, size);
    wire->other->size += size;
    return (ptrdiff_t)size;
}

static bool wire_close(void *context)
{
    Wire *wire = context;
    CHECK(++wire->closes == 1);
    return !wire->fail_close;
}

static OwnedStream stream(Wire *wire)
{
    return (OwnedStream){wire, wire_observe, wire_read, wire_write, wire_close};
}

typedef struct {
    bool foreground;
    bool eof;
    bool close_fails;
    unsigned closes;
    unsigned discards;
    unsigned reads;
    unsigned writes;
    unsigned char line[2 * OPERATOR_LINE];
    size_t size;
    size_t read_at;
    char display[OPERATOR_PROMPT + 1];
    size_t display_size;
    size_t step_read;
} Terminal;

static bool tty_foreground(void *context)
{
    return ((Terminal *)context)->foreground;
}

static bool tty_discard(void *context)
{
    Terminal *terminal = context;
    terminal->size = terminal->read_at = 0;
    ++terminal->discards;
    return true;
}

static ptrdiff_t tty_read(void *context, unsigned char *bytes, size_t capacity)
{
    Terminal *terminal = context;
    ++terminal->reads;
    size_t available = terminal->size - terminal->read_at;
    if (available == 0) return terminal->eof ? 0 : DRIVER_AGAIN;
    size_t moved = capacity < available ? capacity : available;
    if (terminal->step_read != 0 && moved > terminal->step_read) moved = terminal->step_read;
    memcpy(bytes, terminal->line + terminal->read_at, moved);
    terminal->read_at += moved;
    return (ptrdiff_t)moved;
}

static ptrdiff_t tty_write(void *context, const unsigned char *bytes, size_t count)
{
    Terminal *terminal = context;
    if (++terminal->writes % 3 == 0) return DRIVER_AGAIN;
    if (count > 17) count = 17;
    CHECK(count <= OPERATOR_PROMPT - terminal->display_size);
    memcpy(terminal->display + terminal->display_size, bytes, count);
    terminal->display_size += count;
    return (ptrdiff_t)count;
}

static bool tty_close(void *context)
{
    Terminal *terminal = context;
    CHECK(++terminal->closes == 1);
    return !terminal->close_fails;
}

static OwnedTerminal console(Terminal *terminal)
{
    return (OwnedTerminal){terminal, tty_foreground, tty_discard, tty_read, tty_write, tty_close};
}

static void type_line(Terminal *terminal, const char *line)
{
    size_t count = strlen(line);
    CHECK(count <= sizeof(terminal->line));
    memcpy(terminal->line, line, count);
    terminal->size = count;
    terminal->read_at = 0;
}

#endif
