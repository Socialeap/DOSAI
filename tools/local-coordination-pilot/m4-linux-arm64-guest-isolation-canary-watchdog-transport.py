"""Inactive Linux watchdog timer and authenticated, reduce-only fixture transport."""

import ctypes as c
import errno
import hmac
import os
import re
from secrets import token_bytes
import socket
import struct
import time
from typing import NamedTuple


TFD_TIMER_ABSTIME = 1
NS_PER_SECOND = 1_000_000_000
_MAGIC = b'DOSAIWD1'
_VERSION = 1
_TAG_DOMAIN = b'DOSAI_CANARY_WATCHDOG_TO_TERMINATOR_V1\0'
_FRAME = struct.Struct('!8sBBQ16s32s')
_FRAME_BYTES = _FRAME.size + 32
_PHASES = {'GRACEFUL': 1, 'FORCE': 2}
_PEER_CREDENTIALS = struct.Struct('=iII')


def _require_linux_arm64():
    platform = os.uname()
    if (platform.sysname, platform.machine) != ('Linux', 'aarch64'):
        raise OSError('Linux ARM64 is required for native watchdog bindings.')


def _monotonic_ns():
    return time.clock_gettime_ns(time.CLOCK_MONOTONIC)


class _Timespec(c.Structure):
    _fields_ = [('seconds', c.c_long), ('nanoseconds', c.c_long)]


class _Itimerspec(c.Structure):
    _fields_ = [('interval', _Timespec), ('value', _Timespec)]


class LinuxArm64WatchdogTimer:
    """One owned monotonic timerfd, created only by an explicit supervisor call."""

    def __init__(self):
        _require_linux_arm64()
        libc = c.CDLL(None, use_errno=True)
        create = libc.timerfd_create
        create.argtypes = [c.c_int, c.c_int]
        create.restype = c.c_int
        self._settime = libc.timerfd_settime
        self._settime.argtypes = [c.c_int, c.c_int, c.POINTER(_Itimerspec), c.POINTER(_Itimerspec)]
        self._settime.restype = c.c_int
        self._fd = create(time.CLOCK_MONOTONIC, os.O_NONBLOCK | os.O_CLOEXEC)
        if self._fd < 0:
            raise OSError(c.get_errno(), 'Watchdog timer unavailable.')
        self._armed = False

    def fileno(self):
        if self._fd < 0:
            raise ValueError('Watchdog timer closed.')
        return self._fd

    def arm(self, deadline_ns):
        if deadline_ns is not None and (type(deadline_ns) is not int or not 0 < deadline_ns < 2**64):
            raise ValueError('Invalid watchdog deadline.')
        fd = self.fileno()
        seconds, nanoseconds = divmod(deadline_ns or 0, NS_PER_SECOND)
        setting = _Itimerspec(_Timespec(0, 0), _Timespec(seconds, nanoseconds))
        if self._settime(fd, TFD_TIMER_ABSTIME, c.byref(setting), None) != 0:
            raise OSError(c.get_errno(), 'Watchdog timer could not be armed.')
        self._armed = deadline_ns is not None

    def consume(self):
        fd = self.fileno()
        try:
            data = os.read(fd, 8)
        except BlockingIOError as exc:
            if exc.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
                return False
            raise
        if not self._armed or len(data) != 8 or struct.unpack('=Q', data)[0] != 1:
            raise ValueError('Invalid watchdog timer expiration.')
        self._armed = False
        return True

    def close(self):
        if self._fd < 0:
            return
        owned, self._fd = self._fd, -1
        self._armed = False
        os.close(owned)


class WatchdogTimerDispatch:
    """Serialized adapter for an independent readiness and Stop dispatcher."""

    def __init__(self, watchdog, timer, clock_ns=None):
        self._watchdog = watchdog
        self._timer = timer
        self._clock_ns = clock_ns if clock_ns is not None else _monotonic_ns

    def _clock(self):
        try:
            return self._clock_ns()
        except Exception:
            return None

    def _rearm(self, result):
        try:
            self._timer.arm(self._watchdog.next_deadline_ns())
        except Exception:
            return self._watchdog.timer_unavailable()
        return result

    def update(self, *, inventory=None):
        return self._rearm(self._watchdog.poll(self._clock(), inventory=inventory))

    def ready(self, *, inventory=None):
        try:
            if not self._timer.consume():
                return None
        except Exception:
            return self._rearm(self._watchdog.timer_unavailable())
        return self.update(inventory=inventory)

    def stop(self, binding):
        result = self._watchdog.stop(binding, self._clock())
        if result['reason'] == 'WATCHDOG_BINDING_REJECTED':
            return result
        return self._rearm(result)


class FixtureTerminationSession(NamedTuple):
    origin: str
    nonce: bytes
    binding_digest: bytes


def _bytes_of_size(value, size):
    return type(value) is bytes and len(value) == size


def _socket_identity(channel):
    if (channel.family != socket.AF_UNIX
            or channel.getsockopt(socket.SOL_SOCKET, socket.SO_TYPE) != socket.SOCK_SEQPACKET
            or channel.get_inheritable()):
        raise ValueError('Invalid watchdog termination endpoint.')
    channel.getpeername()
    descriptor = channel.fileno()
    if type(descriptor) is not int or descriptor < 0:
        raise ValueError('Invalid watchdog termination endpoint.')
    metadata = os.fstat(descriptor)
    return metadata.st_dev, metadata.st_ino


class LinuxArm64TerminationTransport:
    """One authenticated frame per inherited termination lane."""

    def __init__(self, session, key, graceful, force, *, role):
        if (type(session) is not FixtureTerminationSession or type(session.origin) is not str
                or session.origin != 'SYNTHETIC_ONLY' or not _bytes_of_size(session.nonce, 16)
                or not _bytes_of_size(session.binding_digest, 32) or not _bytes_of_size(key, 32)
                or type(role) is not str or role not in ('WATCHDOG', 'TERMINATOR')):
            raise ValueError('Invalid synthetic termination session.')
        _require_linux_arm64()
        self._identities = {'GRACEFUL': _socket_identity(graceful), 'FORCE': _socket_identity(force)}
        if self._identities['GRACEFUL'] == self._identities['FORCE']:
            raise ValueError('Watchdog termination lanes must be distinct.')
        self._channels = {'GRACEFUL': graceful, 'FORCE': force}
        self._role = role
        self._binding_digest = session.binding_digest
        self._frames = {}
        for phase, number in _PHASES.items():
            body = _FRAME.pack(_MAGIC, _VERSION, number, number, session.nonce, session.binding_digest)
            self._frames[phase] = body + hmac.digest(key, _TAG_DOMAIN + body, 'sha256')
        self._sent = set()
        self._received = set()

    def _channel(self, phase):
        channel = self._channels[phase]
        if _socket_identity(channel) != self._identities[phase]:
            raise OSError('Watchdog termination endpoint changed.')
        return channel

    def send(self, phase, binding_digest):
        if (self._role != 'WATCHDOG' or type(phase) is not str or phase not in _PHASES
                or not _bytes_of_size(binding_digest, 32)
                or not hmac.compare_digest(binding_digest, self._binding_digest)):
            raise ValueError('Watchdog termination binding rejected.')
        if phase in self._sent:
            raise ValueError('Watchdog termination lane consumed.')
        self._sent.add(phase)
        if phase == 'FORCE':
            self._sent.add('GRACEFUL')
        frame = self._frames[phase]
        flags = socket.MSG_DONTWAIT | socket.MSG_NOSIGNAL
        try:
            sent = self._channel(phase).send(frame, flags)
        except (OSError, ValueError):
            raise OSError('Watchdog termination delivery uncertain.') from None
        if sent != len(frame):
            raise OSError('Watchdog termination delivery uncertain.')

    def _receive(self, phase):
        if phase in self._received:
            return 'CLOSED'
        try:
            body, ancillary, flags, _ = self._channel(phase).recvmsg(_FRAME_BYTES, 0, socket.MSG_DONTWAIT)
        except BlockingIOError as exc:
            if exc.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
                return 'PENDING'
            self._received.add(phase)
            return 'REJECTED'
        except (OSError, ValueError):
            self._received.add(phase)
            return 'REJECTED'
        self._received.add(phase)
        if (ancillary or flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC)
                or not _bytes_of_size(body, _FRAME_BYTES) or not hmac.compare_digest(body, self._frames[phase])):
            return 'REJECTED'
        if phase == 'FORCE':
            self._received.add('GRACEFUL')
        return 'ACCEPTED'

    def receive_priority(self):
        if self._role != 'TERMINATOR':
            raise ValueError('Watchdog termination role rejected.')
        for phase in ('FORCE', 'GRACEFUL'):
            result = self._receive(phase)
            if result in ('ACCEPTED', 'REJECTED'):
                return phase, result
        return None

    def retire(self):
        self._sent.update(_PHASES)
        self._received.update(_PHASES)
        self._frames.clear()


class FixtureProcessPin(NamedTuple):
    generation: str
    pid: int
    uid: int
    gid: int
    start_ticks: int


class FixtureSocketPin(NamedTuple):
    device: int
    inode: int


class FixtureTerminationRolePin(NamedTuple):
    process: FixtureProcessPin
    graceful: FixtureSocketPin
    force: FixtureSocketPin


class FixtureTerminationEnrollmentPlan(NamedTuple):
    origin: str
    generation: str
    binding_digest: bytes
    watchdog: FixtureTerminationRolePin
    terminator: FixtureTerminationRolePin
    admission_deadline_ns: int


class FixtureTerminationLanes(NamedTuple):
    graceful: object
    force: object


class FixtureEnrolledTermination(NamedTuple):
    watchdog: LinuxArm64TerminationTransport
    terminator: LinuxArm64TerminationTransport

    def retire(self):
        self.watchdog.retire()
        self.terminator.retire()


def _fixture_generation(value):
    return type(value) is str and re.fullmatch(r'fixture-[a-z0-9-]{1,48}', value) is not None


def _unsigned(value, limit):
    return type(value) is int and 0 <= value < limit


def _valid_role_pin(role):
    if type(role) is not FixtureTerminationRolePin or type(role.process) is not FixtureProcessPin:
        return False
    process = role.process
    return (_fixture_generation(process.generation) and _unsigned(process.pid, 2**31) and process.pid > 0
            and all(_unsigned(item, 2**32 - 1) and item > 0 for item in (process.uid, process.gid))
            and _unsigned(process.start_ticks, 2**64) and process.start_ticks > 0
            and all(type(pin) is FixtureSocketPin and _unsigned(pin.device, 2**64)
                    and _unsigned(pin.inode, 2**64) and pin.inode > 0 for pin in (role.graceful, role.force)))


def _valid_enrollment_plan(plan):
    if (type(plan) is not FixtureTerminationEnrollmentPlan or type(plan.origin) is not str
            or plan.origin != 'SYNTHETIC_ONLY' or not _fixture_generation(plan.generation)
            or not _bytes_of_size(plan.binding_digest, 32) or not _unsigned(plan.admission_deadline_ns, 2**64)
            or not _valid_role_pin(plan.watchdog) or not _valid_role_pin(plan.terminator)):
        return False
    watchdog, terminator = plan.watchdog, plan.terminator
    return (watchdog.process.pid != terminator.process.pid
            and len({plan.generation, watchdog.process.generation, terminator.process.generation}) == 3
            and len({watchdog.graceful, watchdog.force, terminator.graceful, terminator.force}) == 4)


def _check_enrollment_lanes(lanes, role, peer):
    for channel, pin in zip(lanes, (role.graceful, role.force)):
        if _socket_identity(channel) != pin:
            raise ValueError('Watchdog endpoint pin rejected.')
        raw = channel.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, _PEER_CREDENTIALS.size)
        if (not _bytes_of_size(raw, _PEER_CREDENTIALS.size)
                or _PEER_CREDENTIALS.unpack(raw) != (peer.pid, peer.uid, peer.gid)):
            raise ValueError('Watchdog peer credentials rejected.')


def prepare_fixture_termination_enrollment(plan, watchdog_lanes, terminator_lanes, read_ownership, *,
                                           clock_ns=None, random_bytes=None):
    """Prepare one attempt to enroll preconnected, independently registered fixture endpoints."""
    clock = _monotonic_ns if clock_ns is None else clock_ns
    random = token_bytes if random_bytes is None else random_bytes
    if (not _valid_enrollment_plan(plan) or type(watchdog_lanes) is not FixtureTerminationLanes
            or type(terminator_lanes) is not FixtureTerminationLanes or not callable(read_ownership)
            or not callable(clock) or not callable(random)):
        raise ValueError('Invalid synthetic watchdog enrollment.')

    consumed = False
    last_tick = None

    def check_clock():
        nonlocal last_tick
        now = clock()
        if (not _unsigned(now, 2**64) or now >= plan.admission_deadline_ns
                or (last_tick is not None and now < last_tick)):
            raise ValueError('Watchdog enrollment clock rejected.')
        last_tick = now

    def require_ownership():
        readback = read_ownership()
        if not _valid_enrollment_plan(readback) or readback != plan:
            raise ValueError('Watchdog ownership rejected.')

    def verify_endpoints():
        check_clock()
        require_ownership()
        _check_enrollment_lanes(watchdog_lanes, plan.watchdog, plan.terminator.process)
        _check_enrollment_lanes(terminator_lanes, plan.terminator, plan.watchdog.process)
        require_ownership()
        check_clock()

    def enroll():
        nonlocal consumed
        if consumed:
            raise ValueError('Synthetic watchdog enrollment consumed.')
        consumed = True
        watchdog = terminator = None
        try:
            _require_linux_arm64()
            verify_endpoints()
            nonce = random(16)
            if not _bytes_of_size(nonce, 16):
                raise ValueError('Watchdog session nonce rejected.')
            key = random(32)
            session = FixtureTerminationSession(plan.origin, nonce, plan.binding_digest)
            watchdog = LinuxArm64TerminationTransport(session, key, *watchdog_lanes, role='WATCHDOG')
            terminator = LinuxArm64TerminationTransport(session, key, *terminator_lanes, role='TERMINATOR')
            verify_endpoints()
            return FixtureEnrolledTermination(watchdog, terminator)
        except Exception:
            for endpoint in (watchdog, terminator):
                if endpoint is not None:
                    endpoint.retire()
            raise OSError('Synthetic watchdog enrollment rejected.') from None

    return enroll
