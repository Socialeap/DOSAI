"""Inactive reduce-only terminator for registered Linux ARM64 capsule handles."""

from contextlib import ExitStack, contextmanager
import ctypes as c
import errno
import fcntl
import os
import re
import signal
import stat
from typing import NamedTuple


ORIGIN = 'SYNTHETIC_ONLY'
CGROUP2_MAGIC = 0x63677270
PIDFS_MAGIC = 0x50494446
MAX_GRACEFUL_MEMBERS = 16


class FixtureHandlePin(NamedTuple):
    device: int
    inode: int


class FixtureOwnedMember(NamedTuple):
    process_start: str
    pidfd: FixtureHandlePin


class FixtureCapsuleBinding(NamedTuple):
    origin: str
    digest: bytes
    capsule_generation: str
    directory: FixtureHandlePin
    kill_control: FixtureHandlePin


class FixtureTerminationPlan(NamedTuple):
    capsule: FixtureCapsuleBinding
    members: tuple


class FixtureTerminationHandles(NamedTuple):
    directory_fd: int
    kill_fd: int
    pidfds: tuple


class FixtureTerminationOwnership(NamedTuple):
    capsule: FixtureCapsuleBinding
    state: str
    members: tuple
    subtree_owned: bool
    control_plane_outside: bool


class DescriptorFacts(NamedTuple):
    pin: FixtureHandlePin
    mode: int
    filesystem: int
    inheritable: bool
    flags: int


class TerminationOps(NamedTuple):
    duplicate: object
    close: object
    describe: object
    stat_kill_control: object
    signal_term: object
    write_kill: object


def _uint(value, limit):
    return type(value) is int and 0 <= value < limit


def _fixture_id(value):
    return type(value) is str and re.fullmatch(r'fixture-[a-z0-9-]{1,48}', value) is not None


def _valid_pin(pin):
    return (type(pin) is FixtureHandlePin and _uint(pin.device, 2**64)
            and _uint(pin.inode, 2**64) and pin.inode > 0)


def _valid_capsule(capsule):
    return (type(capsule) is FixtureCapsuleBinding and type(capsule.origin) is str and capsule.origin == ORIGIN
            and type(capsule.digest) is bytes and len(capsule.digest) == 32 and _fixture_id(capsule.capsule_generation)
            and _valid_pin(capsule.directory) and _valid_pin(capsule.kill_control)
            and capsule.directory.device == capsule.kill_control.device
            and capsule.directory != capsule.kill_control)


def _valid_members(members):
    return (type(members) is tuple and len(members) <= MAX_GRACEFUL_MEMBERS
            and all(type(member) is FixtureOwnedMember and _fixture_id(member.process_start)
                    and _valid_pin(member.pidfd) for member in members)
            and len({member.process_start for member in members}) == len(members)
            and len({member.pidfd for member in members}) == len(members))


def _valid_handles(handles, member_count):
    if (type(handles) is not FixtureTerminationHandles
            or type(handles.pidfds) is not tuple or len(handles.pidfds) != member_count):
        return False
    descriptors = (handles.directory_fd, handles.kill_fd, *handles.pidfds)
    return (all(_uint(fd, 2**31) and fd >= 3 for fd in descriptors)
            and len(set(descriptors)) == len(descriptors))


class _LinuxArm64Statfs(c.Structure):
    _fields_ = [
        ('filesystem', c.c_long), ('block_size', c.c_long),
        ('blocks', c.c_ulong), ('free_blocks', c.c_ulong), ('available_blocks', c.c_ulong),
        ('files', c.c_ulong), ('free_files', c.c_ulong), ('fsid', c.c_int * 2),
        ('name_limit', c.c_long), ('fragment_size', c.c_long), ('flags', c.c_long), ('spare', c.c_long * 4),
    ]


def _linux_arm64_termination_ops():
    platform = os.uname()
    if (platform.sysname, platform.machine) != ('Linux', 'aarch64') or c.sizeof(c.c_long) != 8:
        raise OSError('Linux ARM64 LP64 is required for native termination.')
    library = c.CDLL(None, use_errno=True)
    fstatfs = library.fstatfs
    fstatfs.argtypes = [c.c_int, c.POINTER(_LinuxArm64Statfs)]
    fstatfs.restype = c.c_int

    def describe(fd):
        metadata = os.fstat(fd)
        filesystem = _LinuxArm64Statfs()
        if fstatfs(fd, c.byref(filesystem)) != 0:
            raise OSError(c.get_errno(), 'Watchdog handle filesystem unavailable.')
        return DescriptorFacts(FixtureHandlePin(metadata.st_dev, metadata.st_ino), metadata.st_mode,
                               filesystem.filesystem, os.get_inheritable(fd), fcntl.fcntl(fd, fcntl.F_GETFL))

    def stat_kill_control(directory_fd):
        metadata = os.stat('cgroup.kill', dir_fd=directory_fd, follow_symlinks=False)
        return FixtureHandlePin(metadata.st_dev, metadata.st_ino), metadata.st_mode

    def signal_term(pidfd):
        signal.pidfd_send_signal(pidfd, signal.SIGTERM, None, 0)

    def write_kill(kill_fd):
        return os.write(kill_fd, b'1')

    return TerminationOps(os.dup, os.close, describe, stat_kill_control, signal_term, write_kill)


@contextmanager
def _owned_copy(ops, fd):
    owned = ops.duplicate(fd)
    try:
        yield owned
    finally:
        ops.close(owned)


def _describe_bound(ops, fd, pin, filesystem):
    facts = ops.describe(fd)
    if (type(facts) is not DescriptorFacts or not _valid_pin(facts.pin) or facts.pin != pin
            or type(facts.filesystem) is not int or facts.filesystem != filesystem
            or facts.inheritable is not False or type(facts.mode) is not int or type(facts.flags) is not int):
        raise ValueError('Watchdog handle identity rejected.')
    return facts


def _graceful(ops, handles, plan, require_revoked):
    if not plan.members:
        return 'DELIVERY_UNCERTAIN'
    with ExitStack() as resources:
        pidfds = []
        for borrowed, member in zip(handles.pidfds, plan.members):
            owned = resources.enter_context(_owned_copy(ops, borrowed))
            _describe_bound(ops, owned, member.pidfd, PIDFS_MAGIC)
            pidfds.append(owned)
        uncertain = False
        for pidfd in pidfds:
            require_revoked('GRACEFUL')
            try:
                if ops.signal_term(pidfd) is not None:
                    return 'DELIVERY_UNCERTAIN'
            except ProcessLookupError as exc:
                if exc.errno != errno.ESRCH:
                    raise
                uncertain = True
        return 'DELIVERY_UNCERTAIN' if uncertain else 'GRACEFUL_REQUESTED'


def _force(ops, handles, capsule, directory, require_revoked):
    with _owned_copy(ops, handles.kill_fd) as control:
        facts = _describe_bound(ops, control, capsule.kill_control, CGROUP2_MAGIC)
        pin, mode = ops.stat_kill_control(directory)
        if (not _valid_pin(pin) or pin != capsule.kill_control or type(mode) is not int
                or not stat.S_ISREG(mode) or not stat.S_ISREG(facts.mode)
                or facts.flags & os.O_ACCMODE != os.O_WRONLY):
            raise ValueError('Watchdog kill control rejected.')
        require_revoked('FORCE')
        written = ops.write_kill(control)
        return 'FORCE_REQUESTED' if type(written) is int and written == 1 else 'DELIVERY_UNCERTAIN'


def _report(result):
    return {
        'schema': 'DOSAI_LINUX_ARM64_GUEST_CANARY_TERMINATOR_V1',
        'status': 'HOLD',
        'scope': 'SOURCE_ONLY',
        'termination': result,
        'cleanupVerified': False,
        'physicalIsolationVerified': False,
        'hostQualified': False,
        'provisioningAuthorized': False,
        'hostMutationAuthorized': False,
        'guestExecutionAuthorized': False,
        'signInAuthorized': False,
        'modelRequestsAuthorized': False,
        'bridgeActivationAuthorized': False,
        'liveLaunchPermitted': False,
        'qualifyingBuilderReceiptsAdded': 0,
    }


def prepare_fixture_owned_terminator(plan, handles, receive_bound, read_ownership, *, ops=None):
    """Build a reduce-only dispatcher for one capsule and its enrolled receiver."""
    if (type(plan) is not FixtureTerminationPlan or not _valid_capsule(plan.capsule)
            or not _valid_members(plan.members) or not _valid_handles(handles, len(plan.members))
            or not callable(receive_bound) or not callable(read_ownership)
            or (ops is not None and (type(ops) is not TerminationOps or not all(callable(port) for port in ops)))):
        raise ValueError('Invalid synthetic owned terminator configuration.')

    capsule = plan.capsule
    consumed = set()

    def require_revoked(phase):
        readback = read_ownership()
        if (type(readback) is not FixtureTerminationOwnership or not _valid_capsule(readback.capsule)
                or readback.capsule != capsule or type(readback.state) is not str or readback.state != 'REVOKED'
                or readback.subtree_owned is not True or readback.control_plane_outside is not True
                or (phase == 'GRACEFUL' and (not _valid_members(readback.members) or readback.members != plan.members))):
            raise ValueError('Watchdog capsule ownership rejected.')

    def dispatch():
        try:
            frame = receive_bound(capsule.digest)
        except Exception:
            return _report('FRAME_REJECTED')
        if frame is None:
            return _report('PENDING')
        if (type(frame) is not tuple or len(frame) != 2 or any(type(field) is not str for field in frame)
                or frame[0] not in ('GRACEFUL', 'FORCE') or frame[1] != 'ACCEPTED'):
            return _report('FRAME_REJECTED')

        phase = frame[0]
        if phase in consumed:
            return _report('FRAME_CONSUMED')
        consumed.add(phase)
        if phase == 'FORCE':
            consumed.add('GRACEFUL')
        try:
            require_revoked(phase)
        except Exception:
            return _report('OWNERSHIP_REJECTED')
        try:
            native = _linux_arm64_termination_ops() if ops is None else ops
            with _owned_copy(native, handles.directory_fd) as directory:
                facts = _describe_bound(native, directory, capsule.directory, CGROUP2_MAGIC)
                if not stat.S_ISDIR(facts.mode):
                    return _report('DELIVERY_UNCERTAIN')
                result = (_force(native, handles, capsule, directory, require_revoked) if phase == 'FORCE'
                          else _graceful(native, handles, plan, require_revoked))
                return _report(result)
        except Exception:
            return _report('DELIVERY_UNCERTAIN')

    return dispatch
