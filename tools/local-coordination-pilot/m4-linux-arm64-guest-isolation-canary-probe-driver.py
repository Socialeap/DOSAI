"""Fixed canary driver and inactive Linux ARM64 bindings."""

from contextlib import contextmanager
import errno
import os
from os import O_CLOEXEC, O_DIRECTORY, O_NOFOLLOW, O_NONBLOCK, O_RDONLY
import re
import socket
from socket import AF_INET, SOCK_STREAM
from stat import S_IMODE, S_ISREG
from threading import current_thread
from time import monotonic_ns
from typing import NamedTuple


MARKER_BYTES = 32
PROBE_BUDGET_NS = 250_000_000
EGRESS_PEER = ('192.0.2.31', 38473)
LOOPBACK_PEER = ('127.0.0.1', 38473)
READ_FLAGS = O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK
DIRECTORY_FLAGS = READ_FLAGS | O_DIRECTORY
EXEC_RESULTS = ('PERMISSION_ERROR', 'NOT_FOUND', 'TIMED_OUT', 'UNAVAILABLE')


class FileIdentity(NamedTuple):
    device: int
    inode: int
    owner_uid: int


class FixtureProbePins(NamedTuple):
    origin: str
    file_identity: FileIdentity
    file_marker: bytes
    egress_marker: bytes
    loopback_marker: bytes
    executable_digest: str


class ProbePrimitives(NamedTuple):
    open_file: object
    stat_file: object
    read_file: object
    close_file: object
    open_socket: object
    observe_owned_exec: object
    monotonic_ns: object


class OwnedExecObservation(NamedTuple):
    executable_digest: str
    result: str
    cleanup_verified: bool


class _SocketOperations(NamedTuple):
    settimeout: object
    connect: object
    getpeername: object
    recv: object


def _valid_pins(pins):
    if (type(pins) is not FixtureProbePins or type(pins.origin) is not str
            or pins.origin != 'SYNTHETIC_ONLY' or type(pins.file_identity) is not FileIdentity):
        return False
    identity = pins.file_identity
    markers = (pins.file_marker, pins.egress_marker, pins.loopback_marker)
    return (all(type(value) is int and 0 < value < 2**64 for value in identity)
            and identity.owner_uid < 2**32 - 1
            and all(type(marker) is bytes and len(marker) == MARKER_BYTES for marker in markers)
            and len(set(markers)) == len(markers)
            and type(pins.executable_digest) is str
            and re.fullmatch(r'[0-9a-f]{64}', pins.executable_digest) is not None)


@contextmanager
def _directory(ops, name, **scope):
    descriptor = ops.open_file(name, DIRECTORY_FLAGS, **scope)
    try:
        yield descriptor
    finally:
        ops.close_file(descriptor)


def _access_error(exc):
    if exc.errno in (errno.EPERM, errno.EACCES):
        return 'PERMISSION_ERROR'
    if exc.errno in (errno.ENOENT, errno.ENOTDIR):
        return 'NOT_FOUND'
    if exc.errno == errno.ECONNREFUSED:
        return 'REFUSED'
    if isinstance(exc, TimeoutError) or exc.errno == errno.ETIMEDOUT:
        return 'TIMED_OUT'
    return 'UNAVAILABLE'


def _file_snapshot(metadata):
    return (metadata.st_dev, metadata.st_ino, metadata.st_uid, metadata.st_mode,
            metadata.st_nlink, metadata.st_size, metadata.st_mtime_ns, metadata.st_ctime_ns)


def _read_marker(ops, pins, deadline):
    with _directory(ops, '/run') as run:
        _remaining_seconds(ops.monotonic_ns, deadline)
        with _directory(ops, 'dosai-isolation-fixture', dir_fd=run) as directory:
            _remaining_seconds(ops.monotonic_ns, deadline)
            try:
                descriptor = ops.open_file('host-marker', READ_FLAGS, dir_fd=directory)
            except OSError as exc:
                return _access_error(exc)
            try:
                _remaining_seconds(ops.monotonic_ns, deadline)
                before = _file_snapshot(ops.stat_file(descriptor))
                if (before[:3] != pins.file_identity or not S_ISREG(before[3])
                        or S_IMODE(before[3]) != 0o400 or before[4:6] != (1, MARKER_BYTES)):
                    return 'UNAVAILABLE'
                _remaining_seconds(ops.monotonic_ns, deadline)
                try:
                    data = ops.read_file(descriptor, MARKER_BYTES + 1)
                except OSError as exc:
                    return _access_error(exc)
                _remaining_seconds(ops.monotonic_ns, deadline)
                after = _file_snapshot(ops.stat_file(descriptor))
                if type(data) is not bytes or data != pins.file_marker or before != after:
                    return 'UNAVAILABLE'
                return 'EXPECTED_MARKER_READ'
            finally:
                ops.close_file(descriptor)


def _remaining_seconds(clock, deadline):
    remaining = deadline - clock()
    if remaining <= 0:
        raise TimeoutError('Canary deadline reached.')
    return remaining / 1_000_000_000


def _connect_marker(ops, peer, marker, success, deadline):
    with ops.open_socket(AF_INET, SOCK_STREAM) as connection:
        connection.settimeout(_remaining_seconds(ops.monotonic_ns, deadline))
        try:
            connection.connect(peer)
        except OSError as exc:
            return _access_error(exc)
        if connection.getpeername() != peer:
            return 'UNAVAILABLE'

        data = bytearray()
        while len(data) <= MARKER_BYTES:
            capacity = MARKER_BYTES + 1 - len(data)
            connection.settimeout(_remaining_seconds(ops.monotonic_ns, deadline))
            chunk = connection.recv(capacity)
            if type(chunk) is not bytes or len(chunk) > capacity:
                return 'UNAVAILABLE'
            if not chunk:
                break
            data.extend(chunk)
        return success if data == marker else 'UNAVAILABLE'


def _observe_exec(ops, digest, deadline):
    observation = ops.observe_owned_exec(digest, deadline)
    if (type(observation) is not OwnedExecObservation or type(observation.executable_digest) is not str
            or observation.executable_digest != digest or observation.cleanup_verified is not True
            or type(observation.result) is not str):
        return 'UNAVAILABLE'
    if observation.result == 'STARTED':
        return 'EXPECTED_PROBE_EXEC_OBSERVED'
    return observation.result if observation.result in EXEC_RESULTS else 'UNAVAILABLE'


def make_fixture_probe_driver(pins, ops):
    """Return a driver with no native defaults and no execution authority."""
    if not _valid_pins(pins) or type(ops) is not ProbePrimitives or not all(callable(op) for op in ops):
        raise ValueError('Invalid synthetic canary probe configuration.')

    probes = {
        'HOST_FILE_READ': lambda deadline: _read_marker(ops, pins, deadline),
        'EGRESS_CONNECT': lambda deadline: _connect_marker(
            ops, EGRESS_PEER, pins.egress_marker, 'EXPECTED_EGRESS_PEER_CONNECTED', deadline),
        'LOOPBACK_CONNECT': lambda deadline: _connect_marker(
            ops, LOOPBACK_PEER, pins.loopback_marker, 'EXPECTED_LOOPBACK_PEER_CONNECTED', deadline),
        'SUBPROCESS_EXEC': lambda deadline: _observe_exec(ops, pins.executable_digest, deadline),
    }

    def probe(canary):
        operation = probes.get(canary) if type(canary) is str else None
        if operation is None:
            return 'UNAVAILABLE'
        try:
            deadline = ops.monotonic_ns() + PROBE_BUDGET_NS
            result = operation(deadline)
            _remaining_seconds(ops.monotonic_ns, deadline)
            return result
        except TimeoutError:
            return 'TIMED_OUT'
        except Exception:
            # Exceptions from metadata, socket setup/read or cleanup never model denial.
            return 'UNAVAILABLE'

    return probe


def prepare_linux_arm64_canary_attempt(pins, canary, scope_active, observe_owned_exec):
    """Prepare one native attempt for a separately authorized, in-process supervisor."""
    if (not _valid_pins(pins) or type(canary) is not str
            or canary not in ('HOST_FILE_READ', 'EGRESS_CONNECT', 'LOOPBACK_CONNECT', 'SUBPROCESS_EXEC')
            or not callable(scope_active) or not callable(observe_owned_exec)):
        raise ValueError('Invalid native canary binding configuration.')
    platform = os.uname()
    if (platform.sysname, platform.machine) != ('Linux', 'aarch64'):
        raise OSError('Linux ARM64 is required for native canaries.')

    owner = current_thread()

    def require_scope():
        try:
            active = current_thread() is owner and scope_active(canary) is True
        except Exception:
            active = False
        if not active:
            # The driver's permission outcome is reserved for the actual probe syscall.
            raise OSError(errno.ECANCELED, 'Canary supervisor scope unavailable.')

    def guarded(operation):
        def invoke(*args, **kwargs):
            require_scope()
            return operation(*args, **kwargs)
        return invoke

    @contextmanager
    def open_socket(family, kind):
        require_scope()
        with socket.socket(family, kind, socket.IPPROTO_TCP) as connection:
            yield _SocketOperations(guarded(connection.settimeout), guarded(connection.connect),
                                    guarded(connection.getpeername), guarded(connection.recv))

    ops = ProbePrimitives(
        open_file=guarded(os.open),
        stat_file=guarded(os.fstat),
        read_file=guarded(os.read),
        # Owned cleanup remains available after the scope is revoked.
        close_file=os.close,
        open_socket=open_socket,
        observe_owned_exec=guarded(observe_owned_exec),
        monotonic_ns=guarded(monotonic_ns),
    )
    probe = make_fixture_probe_driver(pins, ops)
    used = False

    def attempt():
        nonlocal used
        if used or current_thread() is not owner:
            return 'UNAVAILABLE'
        used = True
        return probe(canary)

    return attempt
