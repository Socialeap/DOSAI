"""Collect and compare synthetic pinned-handle ARM64 staging readbacks."""

import ctypes
from hashlib import sha256
import json
import os
import re
from struct import Struct, unpack_from
import sys
from time import monotonic_ns
from typing import NamedTuple, Optional


PLAN_SHA256 = bytes.fromhex('42038c4ab93bbd24cf9b6157c1a894c7bc9267f5d1dfb68764194423afcf2765')
ROOT = 'toolchain'
SYSROOT = 'toolchain/sysroot'
READ_CHUNK_BYTES = 64 * 1024
CHILD_OPEN_FLAGS = ('O_PATH', 'O_NOFOLLOW', 'O_CLOEXEC')
CHILD_RESOLVE_FLAGS = ('RESOLVE_BENEATH', 'RESOLVE_NO_SYMLINKS', 'RESOLVE_NO_MAGICLINKS', 'RESOLVE_NO_XDEV')
HANDLE_STAT_FLAGS = ('AT_EMPTY_PATH', 'AT_SYMLINK_NOFOLLOW')
REQUIRED_STAT_FIELDS = frozenset((
    'STATX_TYPE', 'STATX_MODE', 'STATX_SIZE', 'STATX_MNT_ID_UNIQUE', 'STATX_INO', 'STATX_NLINK', 'STATX_CTIME',
))


class StagedContent(NamedTuple):
    kind: str
    mode: int
    size: int
    digest: Optional[bytes]
    target: Optional[str]


class FixtureStagedNode(NamedTuple):
    path: str
    content: StagedContent
    mount_id: int
    inode: int
    link_count: int
    change_time_ns: int


class FixtureStagingSeal(NamedTuple):
    writer_id: bytes
    mount_id: int
    root_inode: int
    generation: int
    write_fenced: bool


class FixtureStagingReadback(NamedTuple):
    origin: str
    reader_id: bytes
    seal: FixtureStagingSeal
    complete: bool
    sequence: int
    nodes: tuple


class FixtureStagingReadbackEvidence(NamedTuple):
    status: str
    census_digest: bytes
    sysroot_digest: bytes
    entries: tuple


class PinnedStagingStat(NamedTuple):
    returned_fields: frozenset
    kind: str
    mode: int
    size: int
    mount_id: int
    inode: int
    link_count: int
    change_time_ns: int


class PinnedDirectoryEntries(NamedTuple):
    names: tuple
    eof: bool


class FixturePinnedReadbackPrimitives(NamedTuple):
    """Handle-relative operations with no platform defaults.

    open_child receives one component plus the exact openat2 flags above.
    stat_handle receives handle-only flags and required fields, and
    reports the returned field mask without fallback mount IDs.
    list_children starts a fresh bounded census and excludes only dot entries.
    read_file_at must read from the same pinned regular object, without
    resolving its original name. read_link reads bytes from the link handle.
    close_handle returns None after closing the acquired child.
    """

    observe_seal: object
    open_child: object
    stat_handle: object
    list_children: object
    read_file_at: object
    read_link: object
    close_handle: object
    monotonic_ns: object


def _token(value):
    return type(value) is bytes and len(value) == 32 and any(value)


def _positive(value):
    return type(value) is int and value > 0


def _valid_seal(seal):
    return (type(seal) is FixtureStagingSeal and _token(seal.writer_id)
            and _positive(seal.mount_id) and _positive(seal.root_inode)
            and _positive(seal.generation) and seal.write_fenced is True)


def _planned_nodes(plan):
    """Include directory ancestors in the census, with explicit modes."""
    directory = StagedContent('DIRECTORY', int(plan['directory_mode_octal'], 8), 0, None, None)
    nodes = {}
    for entry in plan['entries']:
        path = entry['staged_path']
        digest = entry['sha256']
        nodes[path] = StagedContent(entry['kind'], int(entry['mode_octal'], 8), entry['size_bytes'],
                                    bytes.fromhex(digest) if digest else None, entry['link_target'])
        parent = path.rpartition('/')[0]
        while parent:
            nodes.setdefault(parent, directory)
            parent = parent.rpartition('/')[0]
    return nodes


def _content_matches(observed, expected):
    return (type(observed) is StagedContent
            and all(type(actual) is type(wanted) for actual, wanted in zip(observed, expected))
            and observed == expected)


def _read_census(observation, seal, expected):
    if (type(observation) is not FixtureStagingReadback
            or type(observation.origin) is not str or observation.origin != 'SYNTHETIC_ONLY'
            or not _token(observation.reader_id) or observation.reader_id == seal.writer_id
            or not _valid_seal(observation.seal) or observation.seal != seal or observation.complete is not True
            or not _positive(observation.sequence)
            or type(observation.nodes) is not tuple or len(observation.nodes) != len(expected)):
        return None

    observed, inodes = {}, set()
    for node in observation.nodes:
        if type(node) is not FixtureStagedNode or type(node.path) is not str or node.path in observed:
            return None
        content = expected.get(node.path)
        if (content is None or not _content_matches(node.content, content)
                or type(node.mount_id) is not int or node.mount_id != seal.mount_id
                or not _positive(node.inode) or node.inode in inodes
                or not _positive(node.link_count) or (content.kind != 'DIRECTORY' and node.link_count != 1)
                or not _positive(node.change_time_ns)):
            return None
        observed[node.path] = node
        inodes.add(node.inode)
    return observed if observed[ROOT].inode == seal.root_inode else None


def _digest(label, plan, entries):
    rows = [
        [path, content.kind, content.mode, content.size,
         content.digest.hex() if content.digest else None, content.target]
        for path, content in entries
    ]
    data = json.dumps((label, PLAN_SHA256.hex(), plan['manifest_sha256'], plan['recipe_sha256'], rows),
                      separators=(',', ':'), ensure_ascii=True).encode('ascii')
    return sha256(data).digest()


def _pinned_plan(plan_bytes):
    if type(plan_bytes) is not bytes or len(plan_bytes) > 65536 or sha256(plan_bytes).digest() != PLAN_SHA256:
        return None
    return json.loads(plan_bytes)


def verify_fixture_holder_staging_readback(plan_bytes, seal, before, after):
    """Return held census evidence following two exact, stable fixture observations."""
    plan = _pinned_plan(plan_bytes)
    if plan is None or not _valid_seal(seal):
        return None
    expected = _planned_nodes(plan)
    initial = _read_census(before, seal, expected)
    if initial is None:
        return None
    final = _read_census(after, seal, expected)
    if final != initial or before.reader_id != after.reader_id or after.sequence <= before.sequence:
        return None
    entries = tuple((path, node.content) for path, node in sorted(final.items()))
    sysroot = tuple((path, content) for path, content in entries if path == SYSROOT or path.startswith(SYSROOT + '/'))
    return FixtureStagingReadbackEvidence(
        'SOURCE_ONLY_HOLD', _digest('DOSAI_HOLDER_STAGING_CENSUS_V1', plan, entries),
        _digest('DOSAI_HOLDER_STAGING_SYSROOT_V1', plan, sysroot), entries,
    )


def _stat_matches_plan(info, planned, seal):
    return (type(info) is PinnedStagingStat and type(info.returned_fields) is frozenset
            and REQUIRED_STAT_FIELDS <= info.returned_fields
            and type(info.kind) is str and info.kind == planned.kind
            and type(info.mode) is int and info.mode == planned.mode
            and type(info.size) is int and info.size >= 0
            and (info.kind != 'FILE' or info.size == planned.size)
            and (info.kind != 'SYMLINK' or info.size == len(planned.target.encode('ascii')))
            and type(info.mount_id) is int and info.mount_id == seal.mount_id
            and _positive(info.inode) and _positive(info.link_count)
            and (info.kind == 'DIRECTORY' or info.link_count == 1)
            and _positive(info.change_time_ns))


def collect_fixture_holder_staging_readback(plan_bytes, root_handle, seal, reader_id, ops, *, deadline_ns):
    """Collect two bounded readbacks from a borrowed root handle under a fixture seal."""
    plan = _pinned_plan(plan_bytes)
    if (plan is None or type(root_handle) is not int or root_handle < 0 or not _valid_seal(seal)
            or not _token(reader_id) or reader_id == seal.writer_id or not _positive(deadline_ns)
            or type(ops) is not FixturePinnedReadbackPrimitives or not all(callable(op) for op in ops)):
        return None

    expected = _planned_nodes(plan)
    children = {path: set() for path, node in expected.items() if node.kind == 'DIRECTORY'}
    for path in expected:
        parent, _, name = path.rpartition('/')
        if parent:
            children[parent].add(name)
    active_handles = {root_handle}
    last_clock = 0

    def check_deadline():
        nonlocal last_clock
        now = ops.monotonic_ns()
        if type(now) is not int or not last_clock <= now < deadline_ns:
            raise TimeoutError('Pinned readback clock or deadline rejected.')
        last_clock = now

    def call(operation, *args):
        check_deadline()
        value = operation(*args)
        check_deadline()
        return value

    def check_seal():
        observed = call(ops.observe_seal, root_handle)
        if not _valid_seal(observed) or observed != seal:
            raise ValueError('Pinned readback seal changed.')

    def check_children(handle, planned_names):
        listing = call(ops.list_children, handle, len(planned_names) + 1)
        if (type(listing) is not PinnedDirectoryEntries or listing.eof is not True
                or type(listing.names) is not tuple or len(listing.names) != len(planned_names)
                or not all(type(name) is str for name in listing.names) or set(listing.names) != planned_names):
            raise ValueError('Pinned directory census differs from the plan.')

    def read_regular(handle, planned):
        checksum = sha256()
        for offset in range(0, planned.size, READ_CHUNK_BYTES):
            count = min(READ_CHUNK_BYTES, planned.size - offset)
            chunk = call(ops.read_file_at, handle, offset, count)
            if type(chunk) is not bytes or len(chunk) != count:
                raise ValueError('Pinned regular read did not return its exact range.')
            checksum.update(chunk)
        end = call(ops.read_file_at, handle, planned.size, 1)
        if type(end) is not bytes or end or checksum.digest() != planned.digest:
            raise ValueError('Pinned regular bytes differ from the plan.')

    def collect(sequence):
        nodes, inodes = [], set()

        def visit(path, handle):
            planned = expected[path]
            info = call(ops.stat_handle, handle, HANDLE_STAT_FLAGS, REQUIRED_STAT_FIELDS)
            if (not _stat_matches_plan(info, planned, seal) or info.inode in inodes
                    or (path == ROOT and info.inode != seal.root_inode)):
                raise ValueError('Pinned object identity or metadata rejected.')
            inodes.add(info.inode)

            if planned.kind == 'DIRECTORY':
                names = children[path]
                check_children(handle, names)
                for name in sorted(names):
                    check_deadline()
                    child = ops.open_child(handle, name, CHILD_OPEN_FLAGS, CHILD_RESOLVE_FLAGS)
                    if type(child) is not int or child < 0 or child in active_handles:
                        raise ValueError('Pinned child handle rejected.')
                    active_handles.add(child)
                    try:
                        visit(path + '/' + name, child)
                    finally:
                        try:
                            if ops.close_handle(child) is not None:
                                raise OSError('Pinned child cleanup unconfirmed.')
                        finally:
                            active_handles.remove(child)
                check_children(handle, names)
            elif planned.kind == 'FILE':
                read_regular(handle, planned)
            else:
                target = planned.target.encode('ascii')
                actual = call(ops.read_link, handle, len(target) + 1)
                if type(actual) is not bytes or actual != target:
                    raise ValueError('Pinned alias differs from the plan.')
            after = call(ops.stat_handle, handle, HANDLE_STAT_FLAGS, REQUIRED_STAT_FIELDS)
            if not _stat_matches_plan(after, planned, seal) or after != info:
                raise ValueError('Pinned object changed during readback.')
            nodes.append(FixtureStagedNode(path, planned, info.mount_id, info.inode,
                                           info.link_count, info.change_time_ns))

        check_seal()
        visit(ROOT, root_handle)
        check_seal()
        return FixtureStagingReadback('SYNTHETIC_ONLY', reader_id, seal, True, sequence, tuple(nodes))

    try:
        before = collect(1)
        after = collect(2)
        result = verify_fixture_holder_staging_readback(plan_bytes, seal, before, after)
        check_deadline()
        return result
    except (OSError, ValueError):
        return None


# Linux ARM64 LP64 UAPI, using the architecture's O_DIRECTORY and O_NOFOLLOW.
_SYS_FCNTL, _SYS_CLOSE, _SYS_GETDENTS64, _SYS_PREAD64, _SYS_READLINKAT = 25, 57, 61, 67, 78
_SYS_STATX, _SYS_OPENAT2 = 291, 437
_O_DIRECTORY, _O_NOFOLLOW, _O_CLOEXEC, _O_PATH = 0o40000, 0o100000, 0o2000000, 0o10000000
_F_GETFD, _F_GETFL, _FD_CLOEXEC, _O_ACCMODE = 1, 3, 1, 3
_RESOLVE_FLAGS = 0x0F  # BENEATH | NO_SYMLINKS | NO_MAGICLINKS | NO_XDEV
_AT_FLAGS = 0x1100  # AT_EMPTY_PATH | AT_SYMLINK_NOFOLLOW
_STATX_FLAGS = 0x4387  # Required fields plus STATX_MNT_ID_UNIQUE.
_FILE_TYPES = {0o040000: 'DIRECTORY', 0o100000: 'FILE', 0o120000: 'SYMLINK'}
_OPEN_HOW = Struct('<QQQ')
_DIRENT = Struct('<QqHB')
_COMPONENT = re.compile(rb'[A-Za-z0-9_.+-]{1,255}')
_DIRENT_BUFFER_BYTES = 4096
_MAX_LIST_ENTRIES = 513
_MAX_READABLE_FILES = 512


class StagingReadableFile(NamedTuple):
    """A regular-file description borrowed from the independent supervisor."""

    inode: int
    descriptor: int


def _descriptor(value):
    return type(value) is int and 0 <= value < 2**31


def _component(name):
    if type(name) is not bytes or name in (b'.', b'..') or _COMPONENT.fullmatch(name) is None:
        raise ValueError('Invalid readback child component.')
    return name


def _decode_statx(data):
    mask = unpack_from('<I', data)[0]
    if mask & _STATX_FLAGS != _STATX_FLAGS:
        raise ValueError('Readback statx omitted required fields.')
    links = unpack_from('<I', data, 0x10)[0]
    mode = unpack_from('<H', data, 0x1C)[0]
    inode, size = unpack_from('<QQ', data, 0x20)
    seconds, nanos = unpack_from('<qI', data, 0x60)
    mount = unpack_from('<Q', data, 0x90)[0]
    kind = _FILE_TYPES.get(mode & 0o170000)
    if (kind is None or seconds < 0 or nanos >= 1_000_000_000
            or not all((links, inode, mount)) or (kind != 'DIRECTORY' and links != 1)):
        raise ValueError('Readback statx returned invalid object metadata.')
    return PinnedStagingStat(REQUIRED_STAT_FIELDS, kind, mode & 0o7777, size, mount, inode, links,
                             seconds * 1_000_000_000 + nanos)


def _directory_names(data):
    offset = 0
    while offset < len(data):
        if len(data) - offset < 24:
            raise ValueError('Truncated readback directory entry.')
        inode, _, length, _ = _DIRENT.unpack_from(data, offset)
        end = offset + length
        if not inode or length < 24 or length % 8 or end > len(data):
            raise ValueError('Invalid readback directory record.')
        name, separator, _ = data[offset + _DIRENT.size:end].partition(b'\0')
        if not separator:
            raise ValueError('Unterminated readback directory name.')
        yield name if name in (b'.', b'..') else _component(name)
        offset = end


def _arm64_readback_primitives(invoke, root_handle, seal, files, observe_seal, clock, deadline_ns):
    """Bind the fixed readback operations to an ARM64 syscall transport."""
    if (not callable(invoke) or not _descriptor(root_handle) or not _valid_seal(seal)
            or not callable(observe_seal) or not callable(clock) or not _positive(deadline_ns)
            or type(files) is not tuple or len(files) > _MAX_READABLE_FILES):
        raise ValueError('Invalid ARM64 readback binding.')
    readable, borrowed = {}, {root_handle}
    for file in files:
        if (type(file) is not StagingReadableFile or not _positive(file.inode) or not _descriptor(file.descriptor)
                or file.inode in readable or file.descriptor in borrowed):
            raise ValueError('Invalid borrowed readback file pin.')
        readable[file.inode] = file.descriptor
        borrowed.add(file.descriptor)
    owned = set()
    last_clock = 0

    def budgeted_call(number, *args):
        nonlocal last_clock
        now = clock()
        if type(now) is not int or not last_clock <= now < deadline_ns:
            raise TimeoutError('ARM64 syscall readback deadline reached.')
        last_clock = now
        value = invoke(number, *args)
        if type(value) is not int or value < 0:
            raise OSError('ARM64 readback syscall failed.')
        return value

    def close_handle(fd):
        if not _descriptor(fd) or fd not in owned:
            raise ValueError('ARM64 readback cannot close an unowned handle.')
        # A close error consumes the close attempt. The fd number may already be reusable.
        owned.remove(fd)
        status = invoke(_SYS_CLOSE, fd)
        if type(status) is not int or status != 0:
            raise OSError('ARM64 readback descriptor cleanup unconfirmed.')

    def root_seal(fd):
        if not _descriptor(fd) or fd != root_handle:
            raise ValueError('ARM64 readback root is outside the binding.')
        return observe_seal(fd)

    def check_handle(fd):
        if not _descriptor(fd) or (fd != root_handle and fd not in owned):
            raise ValueError('ARM64 readback handle is outside the binding.')

    def stat(fd):
        data = bytearray(256)
        if budgeted_call(_SYS_STATX, fd, b'', _AT_FLAGS, _STATX_FLAGS, data) != 0:
            raise OSError('ARM64 readback statx returned an unexpected status.')
        result = _decode_statx(data)
        if result.mount_id != seal.mount_id:
            raise ValueError('ARM64 readback mount changed.')
        return result

    def stat_handle(fd, flags, fields):
        check_handle(fd)
        if flags != HANDLE_STAT_FLAGS or fields != REQUIRED_STAT_FIELDS:
            raise ValueError('ARM64 readback statx contract changed.')
        return stat(fd)

    def open_relative(fd, name, flags):
        how = bytearray(_OPEN_HOW.pack(flags, 0, _RESOLVE_FLAGS))
        child = budgeted_call(_SYS_OPENAT2, fd, name, how, len(how))
        if not _descriptor(child) or child in borrowed or child in owned:
            raise OSError('ARM64 readback openat2 returned an unexpected handle.')
        owned.add(child)
        return child

    def open_child(fd, name, flags, resolution):
        check_handle(fd)
        if (type(name) is not str or flags != CHILD_OPEN_FLAGS or resolution != CHILD_RESOLVE_FLAGS
                or stat(fd).kind != 'DIRECTORY'):
            raise ValueError('ARM64 readback child open contract changed.')
        return open_relative(fd, _component(name.encode('ascii')), _O_PATH | _O_NOFOLLOW | _O_CLOEXEC)

    def list_children(fd, limit):
        check_handle(fd)
        if type(limit) is not int or not 1 <= limit <= _MAX_LIST_ENTRIES:
            raise ValueError('Invalid ARM64 directory limit.')
        before = stat(fd)
        if before.kind != 'DIRECTORY':
            raise ValueError('ARM64 directory read requires a pinned directory.')
        stream = open_relative(fd, b'.', _O_DIRECTORY | _O_NOFOLLOW | _O_CLOEXEC)
        try:
            if stat(stream) != before:
                raise ValueError('ARM64 directory stream identity changed.')
            names, seen = [], set()
            buffer = bytearray(_DIRENT_BUFFER_BYTES)
            for _ in range(limit + 3):
                count = budgeted_call(_SYS_GETDENTS64, stream, buffer, len(buffer))
                if count > len(buffer):
                    raise OSError('ARM64 directory byte count exceeded its buffer.')
                if count == 0:
                    if stat(stream) != before or stat(fd) != before:
                        raise ValueError('ARM64 directory changed during enumeration.')
                    return PinnedDirectoryEntries(tuple(names), True)
                for name in _directory_names(bytes(buffer[:count])):
                    if name in seen:
                        raise ValueError('ARM64 directory contains a duplicate entry.')
                    seen.add(name)
                    if name not in (b'.', b'..'):
                        names.append(name.decode('ascii'))
                    if len(names) == limit:
                        return PinnedDirectoryEntries(tuple(names), False)
            raise ValueError('ARM64 directory census exceeded its read bound.')
        finally:
            close_handle(stream)

    def read_file_at(fd, offset, count):
        check_handle(fd)
        if (type(offset) is not int or not 0 <= offset < 2**63
                or type(count) is not int or not 1 <= count <= READ_CHUNK_BYTES):
            raise ValueError('Invalid ARM64 readback file range.')
        pinned = stat(fd)
        reader = readable.get(pinned.inode)
        if (pinned.kind != 'FILE' or reader is None or offset > pinned.size
                or count > max(1, pinned.size - offset) or stat(reader) != pinned
                or budgeted_call(_SYS_FCNTL, reader, _F_GETFL) & (_O_PATH | _O_ACCMODE)
                or budgeted_call(_SYS_FCNTL, reader, _F_GETFD) != _FD_CLOEXEC):
            raise ValueError('ARM64 readback readable handle is unconfirmed.')
        data = bytearray(count)
        size = budgeted_call(_SYS_PREAD64, reader, data, count, offset)
        if size > count or stat(reader) != pinned or stat(fd) != pinned:
            raise ValueError('ARM64 readback file identity or range changed.')
        return bytes(data[:size])

    def read_link(fd, count):
        check_handle(fd)
        if type(count) is not int or not 1 <= count <= 513:
            raise ValueError('Invalid ARM64 readback link limit.')
        pinned = stat(fd)
        if pinned.kind != 'SYMLINK':
            raise ValueError('ARM64 readback link handle is unconfirmed.')
        data = bytearray(count)
        size = budgeted_call(_SYS_READLINKAT, fd, b'', data, count)
        if size >= count or size != pinned.size or stat(fd) != pinned:
            raise ValueError('ARM64 readback link changed or exceeded its buffer.')
        return bytes(data[:size])

    return FixturePinnedReadbackPrimitives(
        root_seal, open_child, stat_handle, list_children, read_file_at, read_link, close_handle, clock,
    )


def prepare_linux_arm64_holder_readback_primitives(root_handle, seal, files, observe_seal, *, deadline_ns):
    """Prepare dormant bindings for a future supervisor-owned Linux ARM64 session."""
    platform = os.uname()
    if ((platform.sysname, platform.machine, sys.byteorder) != ('Linux', 'aarch64', 'little')
            or ctypes.sizeof(ctypes.c_long) != 8 or ctypes.sizeof(ctypes.c_void_p) != 8):
        raise OSError('Linux ARM64 little-endian LP64 is required for readback bindings.')
    syscall = ctypes.CDLL(None, use_errno=True).syscall
    syscall.argtypes = [ctypes.c_long]
    syscall.restype = ctypes.c_long

    def invoke(number, *args):
        converted = []
        for value in args:
            if type(value) is int:
                converted.append(ctypes.c_long(value))
            elif type(value) is bytes:
                converted.append(ctypes.c_char_p(value))
            else:
                converted.append((ctypes.c_char * len(value)).from_buffer(value))
        result = syscall(number, *converted)
        if result == -1:
            raise OSError(ctypes.get_errno(), 'ARM64 readback syscall failed.')
        return result

    return _arm64_readback_primitives(invoke, root_handle, seal, files, observe_seal, monotonic_ns, deadline_ns)
