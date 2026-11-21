"""Compare two synthetic whole-tree readbacks with the pinned ARM64 staging plan."""

from hashlib import sha256
import json
from typing import NamedTuple, Optional


PLAN_SHA256 = bytes.fromhex('42038c4ab93bbd24cf9b6157c1a894c7bc9267f5d1dfb68764194423afcf2765')
ROOT = 'toolchain'
SYSROOT = 'toolchain/sysroot'


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


def verify_fixture_holder_staging_readback(plan_bytes, seal, before, after):
    """Return held census evidence following two exact, stable fixture observations."""
    if (type(plan_bytes) is not bytes or len(plan_bytes) > 65536 or sha256(plan_bytes).digest() != PLAN_SHA256
            or not _valid_seal(seal)):
        return None
    plan = json.loads(plan_bytes)
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
