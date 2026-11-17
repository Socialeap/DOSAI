// Bounded, nonblocking driver for an already-owned stream. No socket opener.
#ifndef DOSAI_FIXTURE_MTLS_TRANSPORT_V1
#define DOSAI_FIXTURE_MTLS_TRANSPORT_V1

#include "device-v1.h"
#include <stddef.h>

enum { DRIVER_AGAIN = -1, DRIVER_IO_ERROR = -2, DRIVER_CHUNK = 1024 };

typedef struct {
    void *context;
    bool (*elapsed)(void *context, unsigned *seconds);
} DriverClock;

typedef struct {
    uint32_t local;
    uint32_t peer;
    uint16_t local_port;
    uint16_t peer_port;
} StreamEndpoints;

typedef struct {
    void *context;
    bool (*observe)(void *context, StreamEndpoints *endpoints);
    ptrdiff_t (*read)(void *context, unsigned char *bytes, size_t capacity);
    ptrdiff_t (*write)(void *context, const unsigned char *bytes, size_t count);
    bool (*close)(void *context);
} OwnedStream;

typedef struct {
    Device *device;
    DriverClock clock;
    OwnedStream stream;
    unsigned char outgoing[DRIVER_CHUNK];
    size_t offset;
    size_t pending;
    unsigned iterations;
    bool used;
    bool open;
    bool input_ended;
} TransportDriver;

static bool transport_close(TransportDriver *driver)
{
    if (!driver->open) return false;
    driver->open = false;
    OPENSSL_cleanse(driver->outgoing, sizeof(driver->outgoing));
    driver->offset = driver->pending = 0;
    return driver->stream.close(driver->stream.context);
}

static bool transport_fail(TransportDriver *driver)
{
    device_stop(driver->device);
    if (driver->open) transport_close(driver);
    return false;
}

static void transport_stop(TransportDriver *driver)
{
    if (driver->used) transport_fail(driver);
}

// Ownership transfers once this function accepts the stream contract. The
// driver closes that stream on both success and failure.
static bool transport_start(TransportDriver *driver, Device *device,
                            OwnedStream stream, DriverClock clock)
{
    if (driver->used || device == NULL || stream.observe == NULL || stream.read == NULL ||
        stream.write == NULL || stream.close == NULL || clock.elapsed == NULL) return false;
    *driver = (TransportDriver){.device = device, .clock = clock, .stream = stream,
                               .used = true, .open = true};
    StreamEndpoints endpoints = {0};
    unsigned elapsed;
    if (!clock.elapsed(clock.context, &elapsed) || !stream.observe(stream.context, &endpoints) ||
        endpoints.local_port == 0 || endpoints.peer_port == 0) return transport_fail(driver);
    uint16_t m4_port = device->role == M1 ? endpoints.peer_port : endpoints.local_port;
    if (!device_attach(device, endpoints.local, endpoints.peer, m4_port, elapsed))
        return transport_fail(driver);
    return true;
}

static bool transport_flush(TransportDriver *driver, unsigned elapsed)
{
    Device *device = driver->device;
    if (driver->pending == 0) {
        driver->offset = 0;
        driver->pending = device_output(device, driver->outgoing, sizeof(driver->outgoing), elapsed);
    }
    if (device->stage == DEVICE_FAILED) return false;
    if (driver->pending == 0) return true;
    ptrdiff_t written = driver->stream.write(driver->stream.context,
        driver->outgoing + driver->offset, driver->pending);
    if (written == DRIVER_AGAIN) return true;
    if (written <= 0 || (size_t)written > driver->pending) return false;
    driver->offset += (size_t)written;
    driver->pending -= (size_t)written;
    return true;
}

static bool transport_read(TransportDriver *driver, unsigned elapsed)
{
    Device *device = driver->device;
    if (driver->input_ended || device->stage >= DEVICE_CLOSE_M4) return true;
    unsigned char incoming[DRIVER_CHUNK];
    size_t capacity = device_input_space(device);
    if (capacity > sizeof(incoming)) capacity = sizeof(incoming);
    if (capacity == 0) return true;
    ptrdiff_t count = driver->stream.read(driver->stream.context, incoming, capacity);
    if (count == DRIVER_AGAIN) return true;
    if (count < 0 || (size_t)count > capacity) return false;
    if (count == 0) {
        driver->input_ended = true;
        device_missing_input(device, elapsed);
        return device->stage != DEVICE_FAILED;
    }
    return device_input(device, incoming, (size_t)count, elapsed);
}

// One bounded pump turn. The caller owns readiness scheduling and observes
// local stop independently of this nonblocking I/O path.
static bool transport_step(TransportDriver *driver)
{
    if (!driver->open) return false;
    Device *device = driver->device;
    unsigned elapsed;
    if (driver->iterations == IO_LIMIT || !driver->clock.elapsed(driver->clock.context, &elapsed) ||
        !device_time(device, elapsed)) return transport_fail(driver);
    ++driver->iterations;
    if (!transport_flush(driver, elapsed) || !transport_read(driver, elapsed) ||
        !device_step(device, elapsed)) return transport_fail(driver);

    if (device->stage == DEVICE_SENT_DELIVERY_UNKNOWN) {
        bool drained = driver->pending == 0;
        if (!transport_close(driver) || !drained) return device_fail(device);
        return true;
    }
    if (device->stage != DEVICE_DRAIN_M4 || driver->pending != 0 ||
        BIO_ctrl_pending(device->endpoint.wire) != 0) return true;

    if (!transport_close(driver) || !driver->clock.elapsed(driver->clock.context, &elapsed))
        return device_fail(device);
    return device_transport_closed(device, elapsed);
}

#endif
