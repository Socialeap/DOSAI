"""Inactive Linux ARM64 capsule termination and read-only kernel observations."""

from contextlib import ExitStack, contextmanager
import ctypes as c
import errno
import fcntl
from hashlib import sha256
import json
import os
import re
import select
import signal
import stat
from threading import Lock
from typing import NamedTuple


ORIGIN = 'SYNTHETIC_ONLY'
CGROUP2_MAGIC = 0x63677270
PIDFS_MAGIC = 0x50494446
PROCFS_MAGIC = 0x9FA0
PIPEFS_MAGIC = 0x50495045
MAX_GRACEFUL_MEMBERS = 16
MAX_CGROUP_EVENTS_BYTES = 4096
MAX_TEMP_FILE_FDS = 256
MAX_PROC_STAT_BYTES = 4096
MAX_PROC_STATUS_BYTES = 8192
TEMP_SETUP_MAGIC = b'DOSAITF1'
TEMP_SETUP_FRAME_BYTES = 112
TEMP_FILE_NAME = 'fixture-canary.tmp'


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


class FixtureCgroupReadPin(NamedTuple):
    capsule: FixtureCapsuleBinding
    events: FixtureHandlePin


class FixtureCgroupReadHandles(NamedTuple):
    directory_fd: int
    events_fd: int


class CgroupReadOps(NamedTuple):
    duplicate: object
    close: object
    describe: object
    stat_events: object
    pread: object


class FixtureTempFilePin(NamedTuple):
    directory: FixtureHandlePin
    directory_filesystem: int
    file: FixtureHandlePin
    descriptor_table: FixtureHandlePin


class FixtureTempFileHandles(NamedTuple):
    directory_fd: int
    descriptor_table_fd: int


class TempFileReadOps(NamedTuple):
    duplicate: object
    close: object
    describe: object
    stat_entry: object
    open_table: object
    list_slots: object


class FixtureTempFileProcessPin(NamedTuple):
    directory: FixtureHandlePin
    pid: int
    start_ticks: int


class TempFileEnrollmentOps(NamedTuple):
    duplicate: object
    close: object
    describe: object
    read_stat: object
    lookup_table: object
    read_status: object


class TempFileSetupPipeOps(NamedTuple):
    duplicate: object
    close: object
    describe: object
    poll: object
    read: object


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


def _linux_arm64_descriptor_reader():
    platform = os.uname()
    if (platform.sysname, platform.machine) != ('Linux', 'aarch64') or c.sizeof(c.c_long) != 8:
        raise OSError('Linux ARM64 LP64 is required for native descriptor reads.')
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

    return describe


def _linux_arm64_termination_ops():
    describe = _linux_arm64_descriptor_reader()

    def stat_kill_control(directory_fd):
        metadata = os.stat('cgroup.kill', dir_fd=directory_fd, follow_symlinks=False)
        return FixtureHandlePin(metadata.st_dev, metadata.st_ino), metadata.st_mode

    def signal_term(pidfd):
        signal.pidfd_send_signal(pidfd, signal.SIGTERM, None, 0)

    def write_kill(kill_fd):
        return os.write(kill_fd, b'1')

    return TerminationOps(os.dup, os.close, describe, stat_kill_control, signal_term, write_kill)


def _linux_arm64_cgroup_read_ops():
    describe = _linux_arm64_descriptor_reader()

    def stat_events(directory_fd):
        metadata = os.stat('cgroup.events', dir_fd=directory_fd, follow_symlinks=False)
        return FixtureHandlePin(metadata.st_dev, metadata.st_ino), metadata.st_mode

    return CgroupReadOps(os.dup, os.close, describe, stat_events, os.pread)


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


def fixture_cgroup_population_digest(pin):
    if (type(pin) is not FixtureCgroupReadPin or not _valid_capsule(pin.capsule) or not _valid_pin(pin.events)
            or pin.capsule.directory.device != pin.events.device
            or pin.events in (pin.capsule.directory, pin.capsule.kill_control)):
        raise ValueError('Invalid synthetic cgroup population pin.')
    capsule = pin.capsule
    identity = (capsule.digest.hex(), capsule.capsule_generation, capsule.directory, capsule.kill_control, pin.events)
    payload = json.dumps(('DOSAI_LINUX_ARM64_CGROUP_EVENTS_V1', identity), separators=(',', ':')).encode('ascii')
    return sha256(payload).digest()


def _population(raw):
    if (type(raw) is not bytes or not 0 < len(raw) <= MAX_CGROUP_EVENTS_BYTES
            or not raw.endswith(b'\n')):
        return None
    fields = {}
    for line in raw[:-1].split(b'\n'):
        match = re.fullmatch(rb'([a-z][a-z0-9_]{0,63}) (0|[1-9][0-9]{0,19})', line)
        if match is None or match[1] in fields:
            return None
        fields[match[1]] = match[2]
    return {b'0': False, b'1': True}.get(fields.get(b'populated'))


def _require_events_lookup(ops, directory, pin):
    actual, mode = ops.stat_events(directory)
    if not _valid_pin(actual) or actual != pin or type(mode) is not int or not stat.S_ISREG(mode):
        raise ValueError('Watchdog cgroup events identity rejected.')


def prepare_fixture_cgroup_population_reader(pin, handles, *, ops=None):
    """Prepare a read-only bound cgroup population source for an independent verifier."""
    digest = fixture_cgroup_population_digest(pin)
    if (type(handles) is not FixtureCgroupReadHandles or not all(_uint(fd, 2**31) and fd >= 3 for fd in handles)
            or handles.directory_fd == handles.events_fd
            or (ops is not None and (type(ops) is not CgroupReadOps or not all(callable(port) for port in ops)))):
        raise ValueError('Invalid synthetic cgroup population handles.')

    def read_population(watchdog_digest, capsule_generation, expected_digest):
        if (type(watchdog_digest) is not bytes or watchdog_digest != pin.capsule.digest
                or type(capsule_generation) is not str or capsule_generation != pin.capsule.capsule_generation
                or type(expected_digest) is not bytes or expected_digest != digest):
            return None
        try:
            reader = _linux_arm64_cgroup_read_ops() if ops is None else ops
            with _owned_copy(reader, handles.directory_fd) as directory:
                directory_facts = _describe_bound(reader, directory, pin.capsule.directory, CGROUP2_MAGIC)
                if not stat.S_ISDIR(directory_facts.mode):
                    return None
                with _owned_copy(reader, handles.events_fd) as events:
                    facts = _describe_bound(reader, events, pin.events, CGROUP2_MAGIC)
                    if not stat.S_ISREG(facts.mode) or facts.flags & os.O_ACCMODE != os.O_RDONLY:
                        return None
                    _require_events_lookup(reader, directory, pin.events)
                    raw = reader.pread(events, MAX_CGROUP_EVENTS_BYTES + 1, 0)
                    _require_events_lookup(reader, directory, pin.events)
                    return _population(raw)
        except Exception:
            return None

    return read_population


def fixture_temp_file_observation_digest(pin):
    if (type(pin) is not FixtureTempFilePin or not all(
            _valid_pin(identity) for identity in (pin.directory, pin.file, pin.descriptor_table))
            or len({pin.directory, pin.file, pin.descriptor_table}) != 3
            or pin.directory.device != pin.file.device or not _uint(pin.directory_filesystem, 2**32)
            or pin.directory_filesystem in (0, PROCFS_MAGIC)):
        raise ValueError('Invalid synthetic temporary file observation pin.')
    payload = json.dumps(('DOSAI_LINUX_ARM64_TEMP_FILE_V1', TEMP_FILE_NAME, pin), separators=(',', ':')).encode('ascii')
    return sha256(payload).digest()


def _linux_arm64_temp_file_read_ops():
    describe = _linux_arm64_descriptor_reader()

    def stat_entry(directory_fd, name, follow):
        info = os.stat(name, dir_fd=directory_fd, follow_symlinks=follow)
        return FixtureHandlePin(info.st_dev, info.st_ino), info.st_mode

    def open_table(directory_fd):
        # A fresh open file description starts its directory scan at offset zero.
        return os.open('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory_fd)

    def list_slots(directory_fd):
        slots = []
        with os.scandir(directory_fd) as entries:
            for entry in entries:
                if len(slots) >= MAX_TEMP_FILE_FDS:
                    raise ValueError('Temporary file descriptor census exceeded its bound.')
                slots.append(entry.name)
        return tuple(slots)

    return TempFileReadOps(os.dup, os.close, describe, stat_entry, open_table, list_slots)


def _require_readable_directory(ops, fd, pin, filesystem):
    facts = _describe_bound(ops, fd, pin, filesystem)
    if not stat.S_ISDIR(facts.mode) or facts.flags & os.O_ACCMODE != os.O_RDONLY:
        raise ValueError('Temporary file observation directory rejected.')


def _temp_file_slot(ops, directory, file_pin):
    try:
        identity, mode = ops.stat_entry(directory, TEMP_FILE_NAME, False)
    except FileNotFoundError as exc:
        if exc.errno != errno.ENOENT:
            raise
        return 'VACANT'
    if not _valid_pin(identity) or type(mode) is not int:
        raise ValueError('Temporary file slot metadata rejected.')
    return 'PRESENT' if identity == file_pin and stat.S_ISREG(mode) else 'REPLACED'


def _temp_file_descriptor_count(ops, directory, file_pin):
    slots = ops.list_slots(directory)
    if (type(slots) is not tuple or len(slots) > MAX_TEMP_FILE_FDS or not all(
            type(name) is str and re.fullmatch(r'0|[1-9][0-9]{0,9}', name) and int(name) < 2**31
            for name in slots) or len(set(slots)) != len(slots)):
        raise ValueError('Temporary file descriptor census rejected.')
    count = 0
    for name in slots:
        link, mode = ops.stat_entry(directory, name, False)
        if not _valid_pin(link) or type(mode) is not int or not stat.S_ISLNK(mode):
            raise ValueError('Temporary file descriptor link rejected.')
        identity, mode = ops.stat_entry(directory, name, True)
        if not _valid_pin(identity) or type(mode) is not int:
            raise ValueError('Temporary file descriptor target rejected.')
        if identity == file_pin:
            if not stat.S_ISREG(mode):
                raise ValueError('Temporary file descriptor target type changed.')
            count += 1
    return count


def prepare_fixture_temp_file_observer(pin, handles, *, ops=None):
    """Observe one fixed directory entry and one exhaustively owned proc fd table."""
    digest = fixture_temp_file_observation_digest(pin)
    if (type(handles) is not FixtureTempFileHandles or not all(_uint(fd, 2**31) and fd >= 3 for fd in handles)
            or handles.directory_fd == handles.descriptor_table_fd
            or (ops is not None and (type(ops) is not TempFileReadOps or not all(callable(port) for port in ops)))):
        raise ValueError('Invalid synthetic temporary file observation handles.')

    def observe(expected_digest):
        if type(expected_digest) is not bytes or expected_digest != digest:
            return None
        try:
            reader = _linux_arm64_temp_file_read_ops() if ops is None else ops
            with ExitStack() as copies:
                directory = copies.enter_context(_owned_copy(reader, handles.directory_fd))
                table_root = copies.enter_context(_owned_copy(reader, handles.descriptor_table_fd))
                _require_readable_directory(reader, directory, pin.directory, pin.directory_filesystem)
                _require_readable_directory(reader, table_root, pin.descriptor_table, PROCFS_MAGIC)
                table = reader.open_table(table_root)
                copies.callback(reader.close, table)
                _require_readable_directory(reader, table, pin.descriptor_table, PROCFS_MAGIC)
                before = _temp_file_slot(reader, directory, pin.file)
                references = _temp_file_descriptor_count(reader, table, pin.file)
                after = _temp_file_slot(reader, directory, pin.file)
                _require_readable_directory(reader, table, pin.descriptor_table, PROCFS_MAGIC)
                _require_readable_directory(reader, directory, pin.directory, pin.directory_filesystem)
                return (before, references) if before == after else None
        except Exception:
            return None

    return observe


def fixture_temp_file_enrollment_digest(file_pin, process_pin):
    observation_digest = fixture_temp_file_observation_digest(file_pin)
    if (type(process_pin) is not FixtureTempFileProcessPin or not _valid_pin(process_pin.directory)
            or process_pin.directory.device != file_pin.descriptor_table.device
            or process_pin.directory == file_pin.descriptor_table
            or not _uint(process_pin.pid, 2**31) or process_pin.pid == 0
            or not _uint(process_pin.start_ticks, 2**64) or process_pin.start_ticks == 0):
        raise ValueError('Invalid synthetic temporary file process pin.')
    identity = ('DOSAI_LINUX_ARM64_TEMP_FILE_ENROLLMENT_V1', observation_digest.hex(), process_pin)
    return sha256(json.dumps(identity, separators=(',', ':')).encode('ascii')).digest()


def _registered_process_stat(raw, process_pin):
    if type(raw) is not bytes or len(raw) > MAX_PROC_STAT_BYTES or not raw.endswith(b'\n'):
        return False
    head, delimiter, tail = raw[:-1].rpartition(b') ')
    prefix = str(process_pin.pid).encode('ascii') + b' ('
    if not delimiter or not head.startswith(prefix):
        return False
    fields = tail.split(b' ')
    # Linux places state at field 3 and starttime at field 22. The comm
    # field can contain spaces, parentheses and newlines.
    return (len(fields) >= 50 and fields[0] in (b'R', b'S', b'D', b'T', b't', b'I')
            and fields[19] == str(process_pin.start_ticks).encode('ascii')
            and all(re.fullmatch(rb'0|-?[1-9][0-9]{0,19}', field) for field in fields[1:]))


def _linux_arm64_temp_file_enrollment_ops():
    describe = _linux_arm64_descriptor_reader()

    def read_proc_entry(process_fd, name, maximum):
        flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
        fd = os.open(name, flags, dir_fd=process_fd)
        try:
            facts = describe(fd)
            if (facts.filesystem != PROCFS_MAGIC or not stat.S_ISREG(facts.mode) or facts.inheritable
                    or facts.flags & os.O_ACCMODE != os.O_RDONLY):
                raise ValueError('Temporary file proc entry rejected.')
            return os.read(fd, maximum + 1)
        finally:
            os.close(fd)

    def read_stat(process_fd):
        return read_proc_entry(process_fd, 'stat', MAX_PROC_STAT_BYTES)

    def read_status(process_fd):
        return read_proc_entry(process_fd, 'status', MAX_PROC_STATUS_BYTES)

    def lookup_table(process_fd):
        info = os.stat('fd', dir_fd=process_fd, follow_symlinks=False)
        return FixtureHandlePin(info.st_dev, info.st_ino), info.st_mode

    return TempFileEnrollmentOps(os.dup, os.close, describe, read_stat, lookup_table, read_status)


def prepare_fixture_temp_file_enrollment(file_pin, handles, process_pin, process_fd, *, ops=None):
    """Verify the process instance and exact descriptor directory pinned by the owner."""
    enrollment = fixture_temp_file_enrollment_digest(file_pin, process_pin)
    observation = fixture_temp_file_observation_digest(file_pin)
    if (type(handles) is not FixtureTempFileHandles
            or not all(_uint(fd, 2**31) and fd >= 3 for fd in (*handles, process_fd))
            or len({*handles, process_fd}) != 3
            or (ops is not None and (type(ops) is not TempFileEnrollmentOps or not all(callable(port) for port in ops)))):
        raise ValueError('Invalid synthetic temporary file enrollment handles.')

    def verify(expected_enrollment, expected_observation):
        if (type(expected_enrollment) is not bytes or expected_enrollment != enrollment
                or type(expected_observation) is not bytes or expected_observation != observation):
            return False
        try:
            reader = _linux_arm64_temp_file_enrollment_ops() if ops is None else ops
            with _owned_copy(reader, process_fd) as process, _owned_copy(reader, handles.descriptor_table_fd) as table:
                for _ in range(2):
                    _require_readable_directory(reader, process, process_pin.directory, PROCFS_MAGIC)
                    _require_readable_directory(reader, table, file_pin.descriptor_table, PROCFS_MAGIC)
                    if not _registered_process_stat(reader.read_stat(process), process_pin):
                        return False
                    identity, mode = reader.lookup_table(process)
                    if not _valid_pin(identity) or identity != file_pin.descriptor_table or type(mode) is not int:
                        return False
                    if not stat.S_ISDIR(mode):
                        return False
                return True
        except Exception:
            return False

    return verify


def prepare_fixture_temp_file_status_reader(file_pin, process_pin, process_fd, *, ops=None):
    """Read bounded kernel filter metadata from the exact enrolled proc directory."""
    enrollment = fixture_temp_file_enrollment_digest(file_pin, process_pin)
    if (not _uint(process_fd, 2**31) or process_fd < 3
            or (ops is not None and (type(ops) is not TempFileEnrollmentOps or not all(callable(port) for port in ops)))):
        raise ValueError('Invalid synthetic temporary file status handle.')

    def read(expected_enrollment):
        if type(expected_enrollment) is not bytes or expected_enrollment != enrollment:
            return None
        try:
            reader = _linux_arm64_temp_file_enrollment_ops() if ops is None else ops
            with _owned_copy(reader, process_fd) as process:
                _require_readable_directory(reader, process, process_pin.directory, PROCFS_MAGIC)
                if not _registered_process_stat(reader.read_stat(process), process_pin):
                    return None
                status = reader.read_status(process)
                if type(status) is not bytes or not 0 < len(status) <= MAX_PROC_STATUS_BYTES:
                    return None
                if not _registered_process_stat(reader.read_stat(process), process_pin):
                    return None
                _require_readable_directory(reader, process, process_pin.directory, PROCFS_MAGIC)
                return status
        except Exception:
            return None

    return read


def _linux_arm64_temp_file_setup_pipe_ops():
    describe = _linux_arm64_descriptor_reader()

    def poll_pipe(fd):
        poller = select.poll()
        poller.register(fd, select.POLLIN)
        events = poller.poll(0)
        if not events:
            return 0
        if len(events) != 1 or events[0][0] != fd:
            raise ValueError('Unexpected temporary setup pipe poll result.')
        return events[0][1]

    return TempFileSetupPipeOps(os.dup, os.close, describe, poll_pipe, os.read)


def _require_setup_pipe_reader(ops, fd, pin):
    facts = _describe_bound(ops, fd, pin, PIPEFS_MAGIC)
    if (not stat.S_ISFIFO(facts.mode) or facts.flags & os.O_ACCMODE != os.O_RDONLY
            or not facts.flags & os.O_NONBLOCK or facts.flags & getattr(os, 'O_PATH', 0)):
        raise ValueError('Temporary setup pipe reader flags rejected.')


def _drain_setup_frame(ops, fd):
    frame = bytearray()
    for _ in range(TEMP_SETUP_FRAME_BYTES + 1):
        limit = TEMP_SETUP_FRAME_BYTES + 1 - len(frame)
        chunk = ops.read(fd, limit)
        if type(chunk) is not bytes or len(chunk) >= limit:
            return None
        if not chunk:
            return bytes(frame) if len(frame) == TEMP_SETUP_FRAME_BYTES else None
        frame.extend(chunk)
    return None


def prepare_fixture_temp_file_setup_pipe_capture(pin, read_fd, nonce, *, ops=None):
    """Poll one exclusive, preopened setup reader and capture one frame after EOF."""
    if (not _valid_pin(pin) or not _uint(read_fd, 2**31) or read_fd < 3
            or type(nonce) is not bytes or len(nonce) != 32
            or (ops is not None and (type(ops) is not TempFileSetupPipeOps or not all(callable(port) for port in ops)))):
        raise ValueError('Invalid synthetic temporary setup pipe registration.')
    lock = Lock()
    consumed = False

    def poll_once():
        try:
            reader = _linux_arm64_temp_file_setup_pipe_ops() if ops is None else ops
            with _owned_copy(reader, read_fd) as fd:
                _require_setup_pipe_reader(reader, fd, pin)
                events = reader.poll(fd)
                accepted = select.POLLIN | select.POLLHUP
                if type(events) is not int or events & ~accepted:
                    return 'REJECTED', None
                if not events & select.POLLHUP:
                    return 'PENDING', None
                frame = _drain_setup_frame(reader, fd)
                _require_setup_pipe_reader(reader, fd, pin)
                if frame is not None and frame.startswith(TEMP_SETUP_MAGIC + nonce):
                    return 'READY', frame
        except Exception:
            return 'REJECTED', None
        return 'REJECTED', None

    def capture(expected_nonce, expected_pipe):
        nonlocal consumed
        if (type(expected_nonce) is not bytes or expected_nonce != nonce
                or type(expected_pipe) is not tuple or len(expected_pipe) != 2
                or not all(_uint(value, 2**64) for value in expected_pipe) or expected_pipe != tuple(pin)):
            return 'REJECTED', None
        with lock:
            if consumed:
                return 'REJECTED', None
            result = poll_once()
            if result[0] != 'PENDING':
                consumed = True
            return result

    return capture


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
