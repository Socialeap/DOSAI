"""Read pinned Debian payload metadata in memory. There is no staging writer."""

from hashlib import sha256
import lzma
import re
import tarfile
from typing import NamedTuple, Optional


MAX_ARCHIVE_BYTES = 24 * 1024**2
MAX_TAR_BYTES = 96 * 1024**2
MAX_XZ_MEMORY = 64 * 1024**2
MAX_MEMBER_BYTES = 64 * 1024**2
MAX_MEMBERS = 16384
MAX_STAGE_PATHS = 512
BLOCK = 512
AR_HEADER = 60
COMPONENT = re.compile(r'[A-Za-z0-9_.+~-]{1,128}')
STAGE_ROOTS = ('bin', 'lib', 'libexec', 'sysroot', 'runtime')
AR_CONTROL_NAMES = (b'control.tar', b'control.tar.gz', b'control.tar.xz', b'control.tar.zst')
XZ_CHECKS = (lzma.CHECK_CRC32, lzma.CHECK_CRC64, lzma.CHECK_SHA256)


class ArchivePin(NamedTuple):
    package: str
    version: str
    architecture: str
    archive: str
    filename: str
    size: int
    digest: bytes


class PayloadMember(NamedTuple):
    path: str
    mode: int
    size: int
    digest: Optional[bytes]
    link: Optional[str]


class StagingPath(NamedTuple):
    package: str
    member_path: str
    staged_path: str


class StagingMemberPin(NamedTuple):
    mapping: StagingPath
    archive: ArchivePin
    member: PayloadMember
    staged_link: Optional[str]


class StagingProjection(NamedTuple):
    status: str
    members: tuple


def _path_parts(path):
    if type(path) is not str or not 0 < len(path) <= 512:
        return None
    parts = path.split('/')
    if not all(COMPONENT.fullmatch(part) and part != '.' for part in parts):
        return None
    return parts


def _canonical_parts(path):
    parts = _path_parts(path)
    return parts if parts is not None and '..' not in parts else None


def _link_destination(path, target):
    parts = _path_parts(target)
    if parts is None:
        return None
    parent = path.split('/')[:-1]
    while parts and parts[0] == '..' and parent:
        parts.pop(0)
        parent.pop()
    if not parts or '..' in parts:
        return None
    return '/'.join((*parent, *parts))


def _valid_pin(pin):
    if type(pin) is not ArchivePin:
        return False
    filename = _canonical_parts(pin.filename)
    return (type(pin.package) is str and re.fullmatch(r'[a-z0-9][a-z0-9+.-]+', pin.package) is not None
            and type(pin.version) is str and re.fullmatch(r'[0-9][A-Za-z0-9.+:~\-]{0,127}', pin.version) is not None
            and pin.architecture in ('arm64', 'all') and pin.archive in ('debian', 'debian-security')
            and filename is not None and len(filename) >= 4 and filename[0] == 'pool'
            and filename[-1] == f"{pin.package}_{pin.version.split(':')[-1]}_{pin.architecture}.deb"
            and type(pin.digest) is bytes and len(pin.digest) == 32
            and type(pin.size) is int and 0 < pin.size <= MAX_ARCHIVE_BYTES)


def _ar_member(archive, offset):
    start = offset + AR_HEADER
    header = archive[offset:start]
    if len(header) != AR_HEADER or header[-2:] != b'`\n':
        raise ValueError('Invalid Debian ar header.')
    name = header[:16].rstrip(b' ')
    size = header[48:58].rstrip(b' ')
    if not re.fullmatch(rb'[0-9]{1,10}', size):
        raise ValueError('Invalid Debian ar size.')
    end = start + int(size)
    following = end + (int(size) % 2)
    if following > len(archive) or (following != end and archive[end:following] != b'\n'):
        raise ValueError('Invalid Debian ar extent.')
    return name.removesuffix(b'/'), start, end, following


def _payload(archive):
    if not archive.startswith(b'!<arch>\n'):
        raise ValueError('Invalid Debian ar signature.')
    name, start, end, offset = _ar_member(archive, 8)
    if name != b'debian-binary' or end - start != 4 or archive[start:end] != b'2.0\n':
        raise ValueError('Unsupported Debian format version.')
    name, start, end, offset = _ar_member(archive, offset)
    if name not in AR_CONTROL_NAMES or start == end:
        raise ValueError('Invalid Debian control member.')
    name, start, end, offset = _ar_member(archive, offset)
    if name not in (b'data.tar', b'data.tar.xz') or start == end or offset != len(archive):
        raise ValueError('Unsupported or incomplete Debian data member.')
    content = memoryview(archive)[start:end]
    if name == b'data.tar':
        if len(content) > MAX_TAR_BYTES:
            raise ValueError('Debian payload exceeds the byte limit.')
        return content
    try:
        decoder = lzma.LZMADecompressor(format=lzma.FORMAT_XZ, memlimit=MAX_XZ_MEMORY)
        tar = decoder.decompress(content, max_length=MAX_TAR_BYTES + 1)
    except lzma.LZMAError as exc:
        raise ValueError('Invalid or over-budget Debian xz payload.') from exc
    if len(tar) > MAX_TAR_BYTES or not decoder.eof or decoder.unused_data or decoder.check not in XZ_CHECKS:
        raise ValueError('Invalid or over-budget Debian xz payload.')
    return memoryview(tar)


def _tar_text(raw):
    text, _, padding = raw.partition(b'\0')
    if any(padding):
        raise ValueError('Invalid tar string padding.')
    try:
        return text.decode('ascii')
    except UnicodeDecodeError as exc:
        raise ValueError('Invalid tar path encoding.') from exc


def _tar_entry(header):
    magic = header[257:265]
    if magic not in (tarfile.POSIX_MAGIC, tarfile.GNU_MAGIC):
        raise ValueError('Unsupported tar header format.')
    if header[156:157] not in (tarfile.REGTYPE, tarfile.DIRTYPE, tarfile.SYMTYPE):
        raise ValueError('Unsupported tar member type.')
    if magic == tarfile.GNU_MAGIC and any(header[345:512]):
        raise ValueError('Unsupported GNU tar extended metadata.')
    if header[124] & 128 or header[100] & 128:
        raise ValueError('Unsupported tar numeric metadata.')
    try:
        entry = tarfile.TarInfo.frombuf(header, 'ascii', 'strict')
    except (tarfile.HeaderError, UnicodeError, ValueError) as exc:
        raise ValueError('Invalid tar header.') from exc
    name = _tar_text(header[:100])
    prefix = _tar_text(header[345:500]) if magic == tarfile.POSIX_MAGIC else ''
    full_name = f'{prefix}/{name}' if prefix else name
    if entry.isdir() and full_name in ('.', './'):
        path = ''
    else:
        path = full_name.removeprefix('./')
        if entry.isdir():
            path = path.removesuffix('/')
        if _canonical_parts(path) is None:
            raise ValueError('Invalid tar member path.')
    link = _tar_text(header[157:257])
    if (entry.issym() and (entry.mode != 0o777 or _link_destination(path, link) is None)
            or not entry.issym() and link
            or entry.isdir() and entry.mode != 0o755
            or entry.isreg() and entry.mode not in (0o444, 0o555, 0o644, 0o755)):
        raise ValueError('Invalid tar member link or mode.')
    return path, entry, link or None


def _tar_members(tar, selected):
    seen = {}
    measured = {}
    offset = 0
    if len(tar) % BLOCK:
        raise ValueError('Invalid tar length.')
    while len(tar) - offset >= 2 * BLOCK:
        header = bytes(tar[offset:offset + BLOCK])
        if not any(header):
            if not any(tar[offset:]):
                break
            raise ValueError('Invalid tar end padding.')
        path, entry, link = _tar_entry(header)
        if path in seen or len(seen) == MAX_MEMBERS:
            raise ValueError('Duplicate tar path or member limit exceeded.')
        size = entry.size
        if not 0 <= size <= MAX_MEMBER_BYTES or (not entry.isreg() and size != 0):
            raise ValueError('Invalid tar member size.')
        start = offset + BLOCK
        end = start + size
        offset = start + ((size + BLOCK - 1) // BLOCK) * BLOCK
        if offset > len(tar) or any(tar[end:offset]):
            raise ValueError('Invalid tar member extent or padding.')
        seen[path] = entry.isdir()
        if path in selected and not entry.isdir():
            digest = sha256(tar[start:end]).digest() if entry.isreg() else None
            measured[path] = PayloadMember(path, entry.mode, size, digest, link)
    else:
        raise ValueError('Missing tar end marker.')
    _require_no_file_parents(seen)
    if measured.keys() != selected:
        raise ValueError('Allowlisted tar member missing.')
    return measured


def _require_no_file_parents(paths):
    for path in paths:
        parent = path.rpartition('/')[0]
        while parent:
            if parent in paths and not paths[parent]:
                raise ValueError('Archive or staged path has a non-directory parent.')
            parent = parent.rpartition('/')[0]


def read_pinned_debian_payload(archive, pin, member_paths):
    """Measure exact selected members without returning payload bytes or writing files."""
    if (not _valid_pin(pin) or type(archive) is not bytes or len(archive) != pin.size
            or sha256(archive).digest() != pin.digest):
        raise ValueError('Debian archive does not match its exact pin.')
    if (type(member_paths) is not tuple or not 0 < len(member_paths) <= MAX_STAGE_PATHS
            or any(_canonical_parts(path) is None for path in member_paths)
            or len(set(member_paths)) != len(member_paths)):
        raise ValueError('Invalid Debian member allowlist.')
    return _tar_members(_payload(archive), set(member_paths))


def _check_staging_aliases(members):
    staged = {pin.mapping.staged_path: pin for pin in members}
    links = {}
    for staged_path, pin in staged.items():
        if pin.member.link is None:
            if pin.staged_link is not None:
                raise ValueError('Regular file has a staged alias target.')
            continue
        destination = _link_destination(staged_path, pin.staged_link)
        source_target = _link_destination(pin.member.path, pin.member.link)
        target = staged.get(destination)
        root = staged_path.split('/')[1]
        if target is None or source_target != target.mapping.member_path:
            raise ValueError('Unresolved or escaping staged alias.')
        target_root = destination.split('/')[1]
        if root != target_root and {'runtime', 'sysroot'}.intersection((root, target_root)):
            raise ValueError('Unresolved or escaping staged alias.')
        links[staged_path] = destination
    for path in links:
        seen = set()
        while path in links:
            if path in seen:
                raise ValueError('Cyclic staged alias.')
            seen.add(path)
            path = links[path]


def verify_staging_projection(allowlist, pinned_archives, member_pins, archives):
    """Check a reviewed projection of pinned bytes and return held metadata only."""
    if (type(allowlist) is not tuple or not 0 < len(allowlist) <= MAX_STAGE_PATHS
            or any(type(row) is not StagingPath for row in allowlist)
            or type(member_pins) is not tuple
            or type(pinned_archives) is not dict or type(archives) is not dict):
        raise ValueError('Invalid staging allowlist inputs.')
    staged = {}
    source_paths = set()
    for row in allowlist:
        path = _canonical_parts(row.staged_path)
        if (path is None or len(path) < 3 or path[0] != 'toolchain' or path[1] not in STAGE_ROOTS
                or _canonical_parts(row.member_path) is None or type(row.package) is not str
                or row.staged_path in staged or row.member_path in source_paths):
            raise ValueError('Invalid or colliding staged path.')
        staged[row.staged_path] = False
        source_paths.add(row.member_path)
    _require_no_file_parents(staged)
    if (len(member_pins) != len(allowlist)
            or any(type(pin) is not StagingMemberPin or type(pin.mapping) is not StagingPath
                   or type(pin.member) is not PayloadMember for pin in member_pins)
            or tuple(pin.mapping for pin in member_pins) != allowlist):
        raise ValueError('Staging member pins do not cover the allowlist in order.')
    by_package = {}
    for pin in member_pins:
        package = pin.mapping.package
        signed = pinned_archives.get(package)
        if (not _valid_pin(signed) or signed.package != package
                or not _valid_pin(pin.archive) or pin.archive != signed
                or pin.member.path != pin.mapping.member_path):
            raise ValueError('Staging member provenance does not match the signed archive pin.')
        by_package.setdefault(package, []).append(pin)
    if archives.keys() != by_package.keys():
        raise ValueError('Supplied archives do not cover the allowlist exactly.')
    for package, rows in by_package.items():
        paths = tuple(row.mapping.member_path for row in rows)
        observed = read_pinned_debian_payload(archives[package], pinned_archives[package], paths)
        for row in rows:
            expected = row.member
            measured = observed[row.mapping.member_path]
            if (measured != expected or type(expected.size) is not int or type(expected.mode) is not int
                    or type(expected.digest) is not type(measured.digest)
                    or type(expected.link) is not type(measured.link)):
                raise ValueError('Staging member bytes, alias or mode differ from review.')
    _check_staging_aliases(member_pins)
    return StagingProjection('SOURCE_ONLY_HOLD', member_pins)
