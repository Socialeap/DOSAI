// macOS adapters for caller-owned descriptors. These adapters create no
// descriptors and change no socket flags or terminal settings.
#ifndef DOSAI_FIXTURE_MTLS_MACOS_IO_V1
#define DOSAI_FIXTURE_MTLS_MACOS_IO_V1

#include "operator-v1.h"
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <termios.h>
#include <unistd.h>

typedef struct {
    uint64_t start_ns;
    uint64_t last_ns;
    time_t start_utc;
} MacClock;

static bool mac_clock_start(MacClock *clock)
{
    struct timespec wall;
    uint64_t now = clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW);
    if (now == 0 || clock_gettime(CLOCK_REALTIME, &wall) != 0 ||
        wall.tv_sec <= 1 || wall.tv_sec > INT64_MAX - 600) return false;
    *clock = (MacClock){now, now, wall.tv_sec};
    return true;
}

static bool mac_clock_elapsed(void *context, unsigned *seconds)
{
    MacClock *clock = context;
    uint64_t now = clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW);
    if (now == 0 || now < clock->last_ns || now < clock->start_ns) return false;
    uint64_t ticks = (now - clock->start_ns) / UINT64_C(1000000000);
    if (ticks >= 200) return false;
    struct timespec wall;
    if (clock_gettime(CLOCK_REALTIME, &wall) != 0) return false;
    double delta = difftime(wall.tv_sec, clock->start_utc + (time_t)ticks);
    if (delta < -2 || delta > 2) return false;
    clock->last_ns = now;
    *seconds = (unsigned)ticks;
    return true;
}

typedef struct {
    int fd;
    struct stat identity;
    bool owned;
} MacDescriptor;

static bool mac_descriptor_flags(int fd)
{
    if (fd < 3) return false;
    int fd_flags = fcntl(fd, F_GETFD);
    int status = fcntl(fd, F_GETFL);
    return fd_flags >= 0 && (fd_flags & FD_CLOEXEC) != 0 &&
        status >= 0 && (status & O_NONBLOCK) != 0 && (status & O_ACCMODE) == O_RDWR;
}

static bool mac_descriptor_same(const MacDescriptor *descriptor)
{
    struct stat current;
    return descriptor->owned && fstat(descriptor->fd, &current) == 0 &&
        current.st_dev == descriptor->identity.st_dev &&
        current.st_ino == descriptor->identity.st_ino &&
        current.st_rdev == descriptor->identity.st_rdev &&
        (current.st_mode & S_IFMT) == (descriptor->identity.st_mode & S_IFMT);
}

static bool mac_descriptor_close(void *context)
{
    MacDescriptor *descriptor = context;
    bool same = mac_descriptor_same(descriptor);
    int fd = descriptor->fd;
    *descriptor = (MacDescriptor){0};
    return same && close(fd) == 0;
}

static ptrdiff_t mac_result(ssize_t value)
{
    if (value >= 0) return value;
    return errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR
        ? DRIVER_AGAIN : DRIVER_IO_ERROR;
}

static bool mac_stream_observe(void *context, StreamEndpoints *endpoints)
{
    MacDescriptor *descriptor = context;
    if (!mac_descriptor_same(descriptor) || !mac_descriptor_flags(descriptor->fd) ||
        !S_ISSOCK(descriptor->identity.st_mode)) return false;
    int fd = descriptor->fd;
    int value = 0;
    socklen_t size = sizeof(value);
    if (getsockopt(fd, SOL_SOCKET, SO_TYPE, &value, &size) != 0 ||
        size != sizeof(value) || value != SOCK_STREAM) return false;
    size = sizeof(value);
    if (getsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &value, &size) != 0 ||
        size != sizeof(value) || value != 1) return false;
    size = sizeof(value);
    if (getsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &value, &size) != 0 ||
        size != sizeof(value)) return false;

    struct linger linger = {0};
    size = sizeof(linger);
    if (getsockopt(fd, SOL_SOCKET, SO_LINGER, &linger, &size) != 0 ||
        size != sizeof(linger) || linger.l_onoff != 0) return false;

    struct sockaddr_in local = {0}, peer = {0};
    socklen_t local_size = sizeof(local), peer_size = sizeof(peer);
    if (getsockname(fd, (struct sockaddr *)&local, &local_size) != 0 ||
        getpeername(fd, (struct sockaddr *)&peer, &peer_size) != 0 ||
        local_size != sizeof(local) || peer_size != sizeof(peer) ||
        local.sin_family != AF_INET || peer.sin_family != AF_INET) return false;
    *endpoints = (StreamEndpoints){ntohl(local.sin_addr.s_addr), ntohl(peer.sin_addr.s_addr),
                                   ntohs(local.sin_port), ntohs(peer.sin_port)};
    return true;
}

static ptrdiff_t mac_stream_read(void *context, unsigned char *bytes, size_t capacity)
{
    MacDescriptor *descriptor = context;
    if (!mac_descriptor_same(descriptor) || !mac_descriptor_flags(descriptor->fd))
        return DRIVER_IO_ERROR;
    return mac_result(recv(descriptor->fd, bytes, capacity, MSG_DONTWAIT));
}

static ptrdiff_t mac_stream_write(void *context, const unsigned char *bytes, size_t count)
{
    MacDescriptor *descriptor = context;
    if (!mac_descriptor_same(descriptor) || !mac_descriptor_flags(descriptor->fd))
        return DRIVER_IO_ERROR;
    return mac_result(send(descriptor->fd, bytes, count, MSG_DONTWAIT));
}

// A successful adoption transfers exclusive ownership. On failure the
// descriptor still belongs to the caller. No fallback descriptor is tried.
static bool mac_stream_adopt(MacDescriptor *descriptor, int fd, OwnedStream *stream)
{
    if (descriptor->owned || !mac_descriptor_flags(fd)) return false;
    MacDescriptor candidate = {.fd = fd, .owned = true};
    StreamEndpoints endpoints;
    if (fstat(fd, &candidate.identity) != 0 || !mac_stream_observe(&candidate, &endpoints)) return false;
    *descriptor = candidate;
    *stream = (OwnedStream){descriptor, mac_stream_observe, mac_stream_read, mac_stream_write,
                            mac_descriptor_close};
    return true;
}

static bool mac_terminal_foreground(void *context)
{
    MacDescriptor *descriptor = context;
    if (!mac_descriptor_same(descriptor) || !mac_descriptor_flags(descriptor->fd) ||
        !S_ISCHR(descriptor->identity.st_mode)) return false;
    int fd = descriptor->fd;
    struct termios attributes;
    pid_t session = getsid(0);
    return session > 0 && isatty(fd) == 1 && tcgetsid(fd) == session &&
        tcgetpgrp(fd) == getpgrp() && tcgetattr(fd, &attributes) == 0 &&
        (attributes.c_lflag & (ICANON | ISIG)) == (ICANON | ISIG);
}

static bool mac_terminal_discard(void *context)
{
    MacDescriptor *descriptor = context;
    return mac_terminal_foreground(context) && tcflush(descriptor->fd, TCIFLUSH) == 0;
}

static ptrdiff_t mac_terminal_read(void *context, unsigned char *bytes, size_t capacity)
{
    MacDescriptor *descriptor = context;
    if (!mac_terminal_foreground(context)) return DRIVER_IO_ERROR;
    return mac_result(read(descriptor->fd, bytes, capacity));
}

static ptrdiff_t mac_terminal_write(void *context, const unsigned char *bytes, size_t count)
{
    MacDescriptor *descriptor = context;
    if (!mac_terminal_foreground(context)) return DRIVER_IO_ERROR;
    return mac_result(write(descriptor->fd, bytes, count));
}

static bool mac_terminal_adopt(MacDescriptor *descriptor, int fd, OwnedTerminal *terminal)
{
    if (descriptor->owned || !mac_descriptor_flags(fd)) return false;
    MacDescriptor candidate = {.fd = fd, .owned = true};
    if (fstat(fd, &candidate.identity) != 0 || !mac_terminal_foreground(&candidate)) return false;
    *descriptor = candidate;
    *terminal = (OwnedTerminal){descriptor, mac_terminal_foreground, mac_terminal_discard,
        mac_terminal_read, mac_terminal_write, mac_descriptor_close};
    return true;
}

#endif
