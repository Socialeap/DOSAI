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
RUNTIME_PREFIX = 'toolchain/runtime'
ELF_INTERPRETER = '/lib/ld-linux-aarch64.so.1'
ELF_ABI = ('ELF64', 'LITTLE_ENDIAN', 'EM_AARCH64')
ELF_LIBRARY_DIRS = ('/lib/aarch64-linux-gnu', '/usr/lib/aarch64-linux-gnu', '/lib', '/usr/lib')
RUNTIME_LIBRARY_DIRS = tuple(RUNTIME_PREFIX + directory for directory in ELF_LIBRARY_DIRS)
MAX_ELF_OBJECTS = 512
MAX_ELF_NAMES = 512
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


class FixtureHolderELFObject(NamedTuple):
    path: str
    digest: bytes
    abi: tuple
    kind: str
    interpreter: str
    soname: str
    needed: tuple
    version_definitions: tuple
    unsupported_features: tuple


class FixtureHolderELFObservation(NamedTuple):
    origin: str
    inventory_digest: bytes
    isolated_default_search: bool
    objects: tuple


class FixtureHolderELFEvidence(NamedTuple):
    status: str
    lock_digest: bytes
    graph_digest: bytes


class _ToolchainCatalog(NamedTuple):
    records: dict
    alias_targets: dict

    def canonical_path(self, path):
        return self.alias_targets.get(path, path)


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
    return _ToolchainCatalog(records, resolved)


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
    catalog = _catalog(lock.entries)
    if catalog is None:
        return None
    digest = _digest((
        'DOSAI_LINUX_ARM64_HOLDER_TOOLCHAIN_LOCK_V1', 'NATIVE_LINUX_ARM64',
        lock.manifest_digest.hex(), lock.recipe_digest.hex(), _encoded(catalog.records),
    ))
    return digest, catalog


def fixture_holder_toolchain_lock_digest(lock):
    record = _lock_record(lock)
    if record is None:
        raise ValueError('Invalid synthetic holder toolchain lock.')
    return record[0]


def _verified_inventory(lock, approved_digest, observation):
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
    sysroot = {path: entry for path, entry in observed.records.items() if path.startswith(SYSROOT_PREFIX)}
    sysroot_digest = _digest(('DOSAI_LINUX_ARM64_HOLDER_SYSROOT_V1', _encoded(sysroot)))
    return FixtureHolderToolchainEvidence('SOURCE_ONLY_HOLD', digest, sysroot_digest), observed


def verify_fixture_holder_toolchain_closure(lock, approved_digest, observation):
    """Verify a complete synthetic snapshot without reading files or granting build authority."""
    verified = _verified_inventory(lock, approved_digest, observation)
    return None if verified is None else verified[0]


def _elf_name(name):
    return type(name) is str and name not in ('.', '..') and COMPONENT.fullmatch(name) is not None


def _elf_names(names):
    return (type(names) is tuple and len(names) <= MAX_ELF_NAMES
            and all(_elf_name(name) for name in names) and len(set(names)) == len(names))


def _elf_objects(rows, catalog):
    if type(rows) is not tuple or not 0 < len(rows) <= MAX_ELF_OBJECTS:
        return None
    objects = {}
    for obj in rows:
        if type(obj) is not FixtureHolderELFObject or type(obj.path) is not str or obj.path in objects:
            return None
        entry = catalog.records.get(obj.path)
        if (type(entry) is not FixtureHolderToolchainFile or entry.size == 0
                or not _valid_digest(obj.digest) or entry.digest != obj.digest
                or obj.abi != ELF_ABI or obj.unsupported_features != ()
                or type(obj.needed) is not tuple or len(obj.needed) > MAX_ELF_NAMES
                or not _elf_names(obj.version_definitions)):
            return None
        if obj.kind == 'DYNAMIC_TOOL':
            if not entry.executable or obj.interpreter != ELF_INTERPRETER or obj.soname != '':
                return None
        elif obj.kind == 'SHARED_OBJECT':
            if obj.interpreter != '' or not _elf_name(obj.soname):
                return None
        else:
            return None
        dependencies = set()
        for edge in obj.needed:
            if type(edge) is not tuple or len(edge) != 2:
                return None
            soname, versions = edge
            if not _elf_name(soname) or soname in dependencies or not _elf_names(versions):
                return None
            dependencies.add(soname)
        objects[obj.path] = obj
    return objects


def _runtime_library(soname, catalog, objects):
    paths = (directory + '/' + soname for directory in RUNTIME_LIBRARY_DIRS)
    matches = {catalog.canonical_path(path) for path in paths if path in catalog.records}
    if len(matches) != 1:
        return None
    path, = matches
    obj = objects.get(path)
    if (not path.startswith(RUNTIME_PREFIX + '/') or obj is None
            or obj.kind != 'SHARED_OBJECT' or obj.soname != soname):
        return None
    return obj


def _runtime_inventory_covered(catalog, objects):
    for path, entry in catalog.records.items():
        if not path.startswith(RUNTIME_PREFIX + '/'):
            continue
        directory, _, name = path.rpartition('/')
        obj = objects.get(catalog.canonical_path(path))
        if directory not in RUNTIME_LIBRARY_DIRS or obj is None or obj.kind != 'SHARED_OBJECT':
            return False
        if type(entry) is FixtureHolderToolchainAlias and name != obj.soname:
            return False
    return True


def verify_fixture_holder_elf_closure(lock, approved_digest, inventory, observation):
    """Check the restrictive loader graph on synthetic metadata and grant no authority."""
    verified = _verified_inventory(lock, approved_digest, inventory)
    if (verified is None or type(observation) is not FixtureHolderELFObservation
            or observation.origin != 'SYNTHETIC_ONLY' or observation.isolated_default_search is not True
            or not _valid_digest(observation.inventory_digest) or observation.inventory_digest != approved_digest):
        return None
    _, catalog = verified
    objects = _elf_objects(observation.objects, catalog)
    if objects is None or not _runtime_inventory_covered(catalog, objects):
        return None
    roots = tuple(catalog.canonical_path(TOOL_PREFIX + tool) for tool in REQUIRED_TOOLS)
    if len(set(roots)) != len(REQUIRED_TOOLS):
        return None
    loader_name = ELF_INTERPRETER.rsplit('/', 1)[-1]
    loader = _runtime_library(loader_name, catalog, objects)
    if (loader is None or catalog.canonical_path(RUNTIME_PREFIX + ELF_INTERPRETER) != loader.path
            or not catalog.records[loader.path].executable
            or any(path not in objects or objects[path].kind != 'DYNAMIC_TOOL' for path in roots)):
        return None
    pending = list(roots) + [loader.path]
    visited = set()
    edges = []
    while pending:
        path = pending.pop()
        if path in visited:
            continue
        visited.add(path)
        for index, (soname, versions) in enumerate(objects[path].needed):
            provider = _runtime_library(soname, catalog, objects)
            if provider is None or not set(versions).issubset(provider.version_definitions):
                return None
            edges.append((path, index, soname, provider.path, sorted(versions)))
            pending.append(provider.path)
    if visited != objects.keys():
        return None
    data = [(path, obj.digest.hex(), obj.abi, obj.kind, obj.interpreter, obj.soname,
             sorted(obj.version_definitions)) for path, obj in sorted(objects.items())]
    graph_digest = _digest(('DOSAI_LINUX_ARM64_HOLDER_ELF_GRAPH_V1', approved_digest.hex(),
                            roots, loader.path, data, sorted(edges)))
    return FixtureHolderELFEvidence('SOURCE_ONLY_HOLD', approved_digest, graph_digest)
