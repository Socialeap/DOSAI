"""Offline verification of the fixture holder's reviewed toolchain inventory."""

from hashlib import sha256
import json
import re
from typing import NamedTuple


MANIFEST_V2_DIGEST = bytes.fromhex('d64c75e57e71ca4ff11795f3ebf087a457eb8faaa99ffc4d4bd8e3e72ab87a3e')
RECIPE_V2_DIGEST = bytes.fromhex('c0c9d991e2da8966a2d8ab53f73935b7465ee3d998c848b52ad85a67350e0272')
MAX_ENTRIES = 65536
MAX_TOTAL_BYTES = 4 * 1024**3
TOOL_PREFIX = 'toolchain/bin/'
SYSROOT_PREFIX = 'toolchain/sysroot/'
REQUIRED_TOOLS = ('aarch64-linux-gnu-gcc', 'cc1', 'as', 'collect2', 'ld')
REQUIRED_SYSROOT_INPUTS = ('/fcntl.h', '/linux/seccomp.h', '/crt1.o', '/libc.a')
COMPONENT = re.compile(r'[A-Za-z0-9_.+-]{1,128}')


class FixtureHolderToolchainFile(NamedTuple):
    path: str
    size: int
    digest: bytes
    executable: bool


class FixtureHolderToolchainAlias(NamedTuple):
    path: str
    target: str


class FixtureHolderToolchainLock(NamedTuple):
    manifest_digest: bytes
    recipe_digest: bytes
    entries: tuple


class FixtureHolderToolchainObservation(NamedTuple):
    origin: str
    host: str
    manifest_digest: bytes
    recipe_digest: bytes
    complete: bool
    write_fenced: bool
    entries: tuple


class FixtureHolderToolchainEvidence(NamedTuple):
    status: str
    lock_digest: bytes
    sysroot_digest: bytes


def _valid_digest(value):
    return type(value) is bytes and len(value) == 32


def _components(value):
    if type(value) is not str or not 0 < len(value) <= 512:
        return None
    result = value.split('/')
    return result if all(COMPONENT.fullmatch(part) for part in result) else None


def _alias_destination(path, target):
    parts = _components(target)
    if parts is None:
        return None
    parent = path.split('/')[:-1]
    while parts and parts[0] == '..' and len(parent) > 1:
        parent.pop()
        parts = parts[1:]
    if not parts or any(part in ('.', '..') for part in parts):
        return None
    destination = '/'.join((*parent, *parts))
    if path.startswith(SYSROOT_PREFIX) and not destination.startswith(SYSROOT_PREFIX):
        return None
    return destination


def _catalog(entries):
    if type(entries) is not tuple or not 0 < len(entries) <= MAX_ENTRIES:
        return None
    records = {}
    aliases = {}
    total = 0
    for entry in entries:
        if type(entry) not in (FixtureHolderToolchainFile, FixtureHolderToolchainAlias):
            return None
        path = _components(entry.path)
        if (path is None or len(path) < 2 or path[0] != 'toolchain'
                or any(part in ('.', '..') for part in path) or entry.path in records):
            return None
        if type(entry) is FixtureHolderToolchainFile:
            if (type(entry.size) is not int or not 0 <= entry.size <= MAX_TOTAL_BYTES
                    or not _valid_digest(entry.digest) or type(entry.executable) is not bool):
                return None
            total += entry.size
            if total > MAX_TOTAL_BYTES:
                return None
        else:
            destination = _alias_destination(entry.path, entry.target)
            if destination is None:
                return None
            aliases[entry.path] = destination
        records[entry.path] = entry

    for path in records:
        parent, _, _ = path.rpartition('/')
        while parent:
            if parent in records:
                return None
            parent, _, _ = parent.rpartition('/')

    resolved = {}
    for path in aliases:
        chain = set()
        target = path
        while target in aliases and target not in resolved:
            if target in chain:
                return None
            chain.add(target)
            target = aliases[target]
        target = resolved.get(target, target)
        if type(records.get(target)) is not FixtureHolderToolchainFile:
            return None
        resolved.update((alias, target) for alias in chain)

    def file_at(path):
        entry = records.get(resolved.get(path, path))
        return entry if type(entry) is FixtureHolderToolchainFile and entry.size > 0 else None

    for tool in REQUIRED_TOOLS:
        entry = file_at(TOOL_PREFIX + tool)
        if entry is None or not entry.executable or entry.path.startswith(SYSROOT_PREFIX):
            return None
    sysroot = tuple(path for path in records if path.startswith(SYSROOT_PREFIX))
    if not all(any(path.endswith(suffix) and file_at(path) is not None for path in sysroot)
               for suffix in REQUIRED_SYSROOT_INPUTS):
        return None
    if not any(path.endswith('/libgcc.a') and file_at(path) is not None for path in records):
        return None
    return records


def _encoded(records):
    return [
        ['FILE', path, entry.size, entry.digest.hex(), entry.executable]
        if type(entry) is FixtureHolderToolchainFile else ['ALIAS', path, entry.target]
        for path, entry in sorted(records.items())
    ]


def _digest(payload):
    data = json.dumps(payload, separators=(',', ':'), ensure_ascii=True).encode('ascii')
    return sha256(data).digest()


def _lock_record(lock):
    if (type(lock) is not FixtureHolderToolchainLock
            or not _valid_digest(lock.manifest_digest) or lock.manifest_digest != MANIFEST_V2_DIGEST
            or not _valid_digest(lock.recipe_digest) or lock.recipe_digest != RECIPE_V2_DIGEST):
        return None
    records = _catalog(lock.entries)
    if records is None:
        return None
    digest = _digest((
        'DOSAI_LINUX_ARM64_HOLDER_TOOLCHAIN_LOCK_V1', 'NATIVE_LINUX_ARM64',
        lock.manifest_digest.hex(), lock.recipe_digest.hex(), _encoded(records),
    ))
    return digest, records


def fixture_holder_toolchain_lock_digest(lock):
    record = _lock_record(lock)
    if record is None:
        raise ValueError('Invalid synthetic holder toolchain lock.')
    return record[0]


def verify_fixture_holder_toolchain_closure(lock, approved_digest, observation):
    """Verify a complete synthetic snapshot without reading files or granting build authority."""
    if (not _valid_digest(approved_digest) or type(observation) is not FixtureHolderToolchainObservation
            or type(observation.origin) is not str or observation.origin != 'SYNTHETIC_ONLY'
            or type(observation.host) is not str or observation.host != 'NATIVE_LINUX_ARM64'
            or not _valid_digest(observation.manifest_digest) or observation.manifest_digest != MANIFEST_V2_DIGEST
            or not _valid_digest(observation.recipe_digest) or observation.recipe_digest != RECIPE_V2_DIGEST
            or observation.complete is not True or observation.write_fenced is not True):
        return None
    record = _lock_record(lock)
    if record is None or record[0] != approved_digest:
        return None
    digest, expected = record
    observed = _catalog(observation.entries)
    if observed is None or observed != expected:
        return None
    sysroot = {path: entry for path, entry in observed.items() if path.startswith(SYSROOT_PREFIX)}
    sysroot_digest = _digest(('DOSAI_LINUX_ARM64_HOLDER_SYSROOT_V1', _encoded(sysroot)))
    return FixtureHolderToolchainEvidence('SOURCE_ONLY_HOLD', digest, sysroot_digest)
