"""Collect and compare synthetic pinned-handle ARM64 staging readbacks."""

from hashlib import sha256
import json
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
