"""Read the holder toolchain's ELF loader metadata from exact, immutable bytes."""

from hashlib import sha256
import re
from struct import Struct
from typing import NamedTuple


ELF_ABI = ('ELF64', 'LITTLE_ENDIAN', 'EM_AARCH64')
ELF_HEADER = Struct('<16sHHIQQQIHHHHHH')
PROGRAM_HEADER = Struct('<IIQQQQQQ')
DYNAMIC_ENTRY = Struct('<qQ')
VERNEED = Struct('<HHIII')
VERNAUX = Struct('<IHHII')
VERDEF = Struct('<HHHHIII')
VERDAUX = Struct('<II')
ET_EXEC, ET_DYN, EM_AARCH64 = 2, 3, 183
PT_LOAD, PT_DYNAMIC, PT_INTERP = 1, 2, 3
PT_GNU_STACK = 0x6474e551
PF_X, PF_W = 1, 2
DT_NEEDED, DT_STRTAB, DT_STRSZ, DT_SONAME, DT_FLAGS = 1, 5, 10, 14, 30
DT_TLSDESC_PLT, DT_TLSDESC_GOT = 0x6ffffef6, 0x6ffffef7
DT_AARCH64_BTI_PLT = 0x70000001
DT_FLAGS_1, DT_VERDEF, DT_VERDEFNUM, DT_VERNEED, DT_VERNEEDNUM = range(0x6ffffffb, 0x70000000)
MAX_ELF_BYTES = 64 * 1024**2
MAX_PROGRAM_HEADERS = 128
MAX_DYNAMIC_ENTRIES = 512
MAX_STRING_BYTES = 4 * 1024**2
MAX_VERSION_BYTES = 1024**2
MAX_VERSION_RECORDS = 512
MAX_NAME_BYTES = 128
MAX_INTERPRETER_BYTES = 512
ADDRESS_LIMIT = 1 << 64
IDENTIFIER = re.compile(rb'[A-Za-z0-9_.+-]{1,128}')

# These tags do not add providers or search paths to this metadata profile.
# Their symbol, relocation, and initialization tables are outside the reader.
KNOWN_DYNAMIC_TAGS = {
    DT_NEEDED, DT_STRTAB, DT_STRSZ, DT_SONAME, DT_FLAGS, DT_FLAGS_1,
    DT_VERDEF, DT_VERDEFNUM, DT_VERNEED, DT_VERNEEDNUM,
    DT_TLSDESC_PLT, DT_TLSDESC_GOT, DT_AARCH64_BTI_PLT,
    2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28,
    32, 33, 34, 35, 36, 37,  # PREINIT_ARRAY, extended symbol indices, and RELR
    0x6ffffef5, 0x6ffffff0, 0x6ffffff9, 0x6ffffffa,  # GNU_HASH, VERSYM, RELACOUNT, RELCOUNT
}
HELD_DYNAMIC_TAGS = {
    15: 'DT_RPATH', 16: 'DT_SYMBOLIC', 22: 'DT_TEXTREL', 29: 'DT_RUNPATH',
    0x6ffffefb: 'DT_DEPAUDIT', 0x6ffffefc: 'DT_AUDIT',
    0x7ffffffd: 'DT_AUXILIARY', 0x7fffffff: 'DT_FILTER',
}
KNOWN_PROGRAM_TYPES = {0, 1, 2, 3, 4, 6, 7, 0x6474e550, PT_GNU_STACK, 0x6474e552, 0x6474e553}
DF_BIND_NOW_STATIC_TLS = 0x18
DF_1_NOW, DF_1_PIE = 0x1, 0x08000000


class Arm64ELFMetadata(NamedTuple):
    digest: bytes
    abi: tuple
    kind: str
    interpreter: str
    soname: str
    needed: tuple
    version_definitions: tuple
    unsupported_features: tuple


class _Segment(NamedTuple):
    offset: int
    address: int
    file_size: int
    memory_size: int
    flags: int


def _program_headers(data):
    ident, kind, machine, version, _, phoff, _, flags, ehsize, phsize, count, *_ = ELF_HEADER.unpack_from(data)
    if (ident[:7] != b'\x7fELF\x02\x01\x01' or ident[7] not in (0, 3) or any(ident[8:])
            or kind not in (ET_EXEC, ET_DYN) or machine != EM_AARCH64 or version != 1 or flags != 0
            or ehsize != ELF_HEADER.size or phsize != PROGRAM_HEADER.size or phoff < ehsize or phoff % 8
            or not 0 < count <= MAX_PROGRAM_HEADERS or phoff + count * phsize > len(data)):
        raise ValueError('Invalid or unsupported AArch64 ELF header.')
    loads, unique, features = [], {}, []
    for position in range(phoff, phoff + count * phsize, phsize):
        tag, segment_flags, offset, address, _, file_size, mem_size, align = PROGRAM_HEADER.unpack_from(data, position)
        if tag == 0:
            continue
        if offset + file_size > len(data) or address + mem_size > ADDRESS_LIMIT:
            raise ValueError('ELF program segment is out of bounds.')
        segment = _Segment(offset, address, file_size, mem_size, segment_flags)
        if tag == PT_LOAD:
            if (mem_size == 0 or file_size > mem_size
                    or align > 1 and (align & (align - 1) or offset % align != address % align)
                    or loads and address < loads[-1].address + loads[-1].memory_size):
                raise ValueError('Invalid or overlapping ELF load segments.')
            loads.append(segment)
            if segment_flags & (PF_W | PF_X) == (PF_W | PF_X):
                features.append('PT_LOAD_WRITE_EXECUTE')
        elif tag in (PT_DYNAMIC, PT_INTERP):
            if tag in unique or file_size == 0 or (tag == PT_INTERP and loads):
                raise ValueError('Duplicate, empty or misplaced ELF metadata segment.')
            unique[tag] = segment
        if tag == PT_GNU_STACK and segment_flags & PF_X:
            features.append('PT_GNU_STACK_EXECUTE')
        if tag not in KNOWN_PROGRAM_TYPES:
            features.append(f'PT_UNKNOWN:{tag:#x}')
    if not loads or PT_DYNAMIC not in unique:
        raise ValueError('Required ELF load or dynamic segment is missing.')
    return kind, loads, unique, features, ((0, ehsize), (phoff, phoff + count * phsize))


def _file_window(loads, address, size, required_flags=0):
    for load in loads:
        displacement = address - load.address
        if (0 <= displacement and displacement + size <= load.file_size
                and load.flags & required_flags == required_flags):
            return load.offset + displacement, load.offset + load.file_size
    raise ValueError('ELF metadata address is outside a file-backed load segment with the required permissions.')


def _dynamic_entries(data, segment, loads):
    start, extent = segment.offset, segment.file_size
    if (start % 8 or segment.address % 8 or extent % DYNAMIC_ENTRY.size
            or extent > MAX_DYNAMIC_ENTRIES * DYNAMIC_ENTRY.size or extent > segment.memory_size
            or _file_window(loads, segment.address, extent)[0] != start):
        raise ValueError('Invalid ELF dynamic segment extent or mapping.')
    tags, needed = {}, []
    end = start + extent
    for position in range(start, end, DYNAMIC_ENTRY.size):
        tag, value = DYNAMIC_ENTRY.unpack_from(data, position)
        if tag == 0:
            if any(data[position:end]):
                raise ValueError('Invalid data after ELF dynamic terminator.')
            return tags, needed
        if tag == DT_NEEDED:
            needed.append(value)
        elif tag in tags:
            raise ValueError('Duplicate ELF dynamic tag.')
        else:
            tags[tag] = value
    raise ValueError('Missing ELF dynamic terminator.')


def _identifier(raw):
    if not IDENTIFIER.fullmatch(raw) or raw in (b'.', b'..'):
        raise ValueError('Invalid or pathname-valued ELF identifier.')
    return raw.decode('ascii')


def _interpreter(data, program):
    if program is None:
        return ''
    if not 2 <= program.file_size <= MAX_INTERPRETER_BYTES:
        raise ValueError('Invalid ELF interpreter length.')
    value = data[program.offset:program.offset + program.file_size]
    if not value.startswith(b'/') or not value.endswith(b'\0'):
        raise ValueError('Invalid ELF interpreter path.')
    return '/' + '/'.join(_identifier(part) for part in value[1:-1].split(b'/'))


class _Strings(NamedTuple):
    data: bytes
    start: int
    end: int

    def name(self, index):
        offset = self.start + index
        if offset >= self.end:
            raise ValueError('ELF string index is out of bounds.')
        stop = self.data.find(b'\0', offset, min(self.end, offset + MAX_NAME_BYTES + 1))
        if stop < 0:
            raise ValueError('Unterminated or oversized ELF identifier.')
        return _identifier(self.data[offset:stop])


def _strings(data, tags, loads):
    size = tags.get(DT_STRSZ, 0)
    if DT_STRTAB not in tags or not 0 < size <= MAX_STRING_BYTES:
        raise ValueError('Missing or oversized ELF dynamic string table.')
    start, _ = _file_window(loads, tags[DT_STRTAB], size)
    end = start + size
    if data[start] != 0 or data[end - 1] != 0:
        raise ValueError('Invalid ELF dynamic string table boundaries.')
    return _Strings(data, start, end)


def _shared_base_auxiliary_bound(data, position, fields, limit):
    """Recognize the single terminal Verdaux shared by adjacent base and named records."""
    version, flags, index, count, name_hash, delta, following = fields
    if (version, flags, index, count) != (1, 1, 1, 1) or not following:
        raise ValueError('ELF version auxiliary record is out of bounds.')
    successor = position + following
    next_version, next_flags, next_index, next_count, next_hash, next_delta, next_record = VERDEF.unpack_from(data, successor)
    if (next_version != 1 or next_flags & 1 or next_index <= 1 or next_count != 1 or next_hash != name_hash
            or next_delta < VERDEF.size or next_delta % 4 or successor + next_delta != position + delta):
        raise ValueError('ELF version auxiliary record is out of bounds.')
    # The successor independently validates its chain and the terminal auxiliary record.
    return min(limit, successor + next_record) if next_record else limit


def _version_records(data, loads, tags, table_tag, count_tag, header, auxiliary, count_field):
    if table_tag not in tags and count_tag not in tags:
        return (), None
    count = tags.get(count_tag, 0)
    if table_tag not in tags or not 0 < count <= MAX_VERSION_RECORDS or tags[table_tag] % 4:
        raise ValueError('Invalid ELF version table address or count.')
    start, limit = _file_window(loads, tags[table_tag], header.size)
    limit = min(limit, start + MAX_VERSION_BYTES)
    groups, position, budget = [], start, MAX_VERSION_RECORDS
    for group_index in range(count):
        fields = header.unpack_from(data, position)
        aux_count, delta, next_group = fields[count_field], fields[-2], fields[-1]
        budget -= aux_count
        last_group = group_index == count - 1
        if (not aux_count or budget < 0 or delta < header.size or delta % 4
                or last_group != (next_group == 0) or next_group % 4
                or (next_group and (next_group < header.size or position + next_group + header.size > limit))):
            raise ValueError('Invalid ELF version record chain.')
        bound = position + next_group if next_group else limit
        aux_position = position + delta
        if table_tag == DT_VERDEF and aux_position + auxiliary.size > bound:
            bound = _shared_base_auxiliary_bound(data, position, fields, limit)
        entries = []
        for aux_index in range(aux_count):
            if aux_position + auxiliary.size > bound:
                raise ValueError('ELF version auxiliary record is out of bounds.')
            entry = auxiliary.unpack_from(data, aux_position)
            advance = entry[-1]
            last_aux = aux_index == aux_count - 1
            if last_aux != (advance == 0) or (advance and (advance < auxiliary.size or advance % 4)):
                raise ValueError('Invalid ELF version auxiliary chain.')
            entries.append(entry)
            aux_position += advance
        groups.append((fields, entries))
        position += next_group
    return groups, (start, aux_position + auxiliary.size)


def _elf_hash(name):
    result = 0
    for character in name.encode('ascii'):
        result = (result << 4) + character
        high = result & 0xf0000000
        result = (result ^ (high >> 24)) & ~high
    return result


def _register_version(indices, index, name, expected_hash):
    if not index or index in indices or _elf_hash(name) != expected_hash:
        raise ValueError('Invalid ELF version index or name hash.')
    indices.add(index)


def _version_metadata(data, loads, tags, strings, needed):
    definitions, def_extent = _version_records(data, loads, tags, DT_VERDEF, DT_VERDEFNUM, VERDEF, VERDAUX, 3)
    requirements, need_extent = _version_records(data, loads, tags, DT_VERNEED, DT_VERNEEDNUM, VERNEED, VERNAUX, 1)
    provided, required, indices = {}, {}, set()
    for (version, flags, index, _, name_hash, _, _), records in definitions:
        name, *parents = [strings.name(name_offset) for name_offset, _ in records]
        is_base = bool(flags & 1)
        duplicate_version = name in provided and (is_base or not provided[name])
        if (version != 1 or flags & ~3 or index >= 0x8000 or is_base != (index == 1)
                or duplicate_version or (is_base and parents)):
            raise ValueError('Invalid ELF version definition.')
        _register_version(indices, index, name, name_hash)
        provided[name] = is_base
    for (version, _, file_index, _, _), records in requirements:
        library = strings.name(file_index)
        if version != 1 or library not in needed or library in required:
            raise ValueError('ELF version requirement has no unique needed library.')
        names = []
        for name_hash, flags, index, name_index, _ in records:
            name = strings.name(name_index)
            index &= 0x7fff
            if flags & ~2 or index < 2 or name in names:
                raise ValueError('Invalid ELF version requirement.')
            _register_version(indices, index, name, name_hash)
            names.append(name)
        required[library] = tuple(names)
    extents = tuple(extent for extent in (def_extent, need_extent) if extent is not None)
    return tuple(name for name, is_base in provided.items() if not is_base), required, extents


def _held_features(tags, program_features, kind, interpreter, soname):
    held = set(program_features)
    held.update(HELD_DYNAMIC_TAGS.get(tag, f'DT_UNKNOWN:{tag:#x}') for tag in tags if tag not in KNOWN_DYNAMIC_TAGS)
    if tags.get(DT_FLAGS, 0) & ~DF_BIND_NOW_STATIC_TLS:
        held.add('DT_FLAGS')
    flags_1 = tags.get(DT_FLAGS_1, 0)
    if flags_1 & ~(DF_1_NOW | DF_1_PIE) or (flags_1 & DF_1_PIE and (kind != ET_DYN or not interpreter or soname)):
        held.add('DT_FLAGS_1')
    if tags.get(DT_AARCH64_BTI_PLT, 0) != 0:
        held.add('DT_AARCH64_BTI_PLT')
    return tuple(sorted(held))


def _check_tls_descriptor_locations(tags, loads):
    locations = ((DT_TLSDESC_PLT, 4, PF_X), (DT_TLSDESC_GOT, 8, PF_W))
    if DT_TLSDESC_PLT not in tags and DT_TLSDESC_GOT not in tags:
        return
    for tag, word_size, permissions in locations:
        address = tags.get(tag, 0)
        if address == 0 or address % word_size:
            raise ValueError('Missing or misaligned ELF TLS descriptor location.')
        _file_window(loads, address, word_size, permissions)


def read_arm64_elf_metadata(data, expected_digest):
    """Return metadata for a pinned dynamic ELF file without loading or executing it."""
    if (type(data) is not bytes or not ELF_HEADER.size <= len(data) <= MAX_ELF_BYTES
            or type(expected_digest) is not bytes or len(expected_digest) != 32
            or sha256(data).digest() != expected_digest):
        raise ValueError('ELF bytes do not match the bounded immutable input pin.')
    kind, loads, programs, features, header_extents = _program_headers(data)
    dynamic = programs[PT_DYNAMIC]
    tags, name_indices = _dynamic_entries(data, dynamic, loads)
    _check_tls_descriptor_locations(tags, loads)
    strings = _strings(data, tags, loads)
    needed = tuple(strings.name(index) for index in name_indices)
    if len(set(needed)) != len(needed):
        raise ValueError('Duplicate ELF needed library.')
    soname = strings.name(tags[DT_SONAME]) if DT_SONAME in tags else ''
    interp_segment = programs.get(PT_INTERP)
    interpreter = _interpreter(data, interp_segment)
    if kind == ET_EXEC and not interpreter:
        raise ValueError('ELF executable has no interpreter in this dynamic profile.')
    definitions, requirements, version_extents = _version_metadata(data, loads, tags, strings, needed)
    extents = [*header_extents, *version_extents,
               (dynamic.offset, dynamic.offset + dynamic.file_size), (strings.start, strings.end)]
    if interp_segment is not None:
        extents.append((interp_segment.offset, interp_segment.offset + interp_segment.file_size))
    extents.sort()
    if any(first[1] > second[0] for first, second in zip(extents, extents[1:])):
        raise ValueError('Overlapping ELF metadata tables.')
    role = 'SHARED_OBJECT' if kind == ET_DYN and (soname or not interpreter) else 'DYNAMIC_TOOL'
    held = _held_features(tags, features, kind, interpreter, soname)
    return Arm64ELFMetadata(expected_digest, ELF_ABI, role, interpreter, soname,
                            tuple((name, requirements.get(name, ())) for name in needed), definitions, held)
