"""Offline validation of the held Linux ARM64 holder build declaration."""

from hashlib import sha256
import json
import re
import struct
from typing import NamedTuple


MAX_MANIFEST_BYTES = 8192
MAX_SOURCE_BYTES = 65536
SOURCE_ROLES = (
    ('HOLDER_BOOTSTRAP', 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-bootstrap.c'),
    ('REFERENCE_FILTER', 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-reference-filter.c'),
)
FILTER_BYTES = 136
FILTER_DIGEST = bytes.fromhex('be419653d0a20d09847ce283e1d0226ad751670257a57cc2ac42caf3135b8813')
BUILD_CONTRACT = {
    'host': 'NATIVE_LINUX_ARM64',
    'target': 'aarch64-linux-gnu',
    'network': 'DISABLED',
    'compile_flags': ['-std=c11', '-fno-pie', '-fno-lto'],
    'link_flags': ['-static', '-no-pie', '-fno-lto'],
    'required_input_digests': ['entry_source', 'compiler', 'assembler', 'linker', 'sysroot_tree', 'build_recipe'],
}
OUTPUT_CONTRACT = {
    'name': 'dosai-temp-file-holder',
    'elf_class': 64,
    'elf_machine': 'AARCH64',
    'byte_order': 'LITTLE_ENDIAN',
    'elf_type': 'ET_EXEC',
    'allow_interpreter': False,
    'allow_dynamic_segment': False,
    'max_bytes': 4194304,
    'required_image_seal_mask': 15,
    'required_receipt_fields': [
        'source_manifest_sha256', 'source_revision', 'build_inputs_sha256',
        'executable_sha256', 'executable_size_bytes', 'embedded_reference_filter_sha256',
    ],
}


class FixtureHolderBuildDeclaration(NamedTuple):
    status: str
    manifest_digest: bytes
    source_revision: str
    program_digest: bytes


def _unique_object(pairs):
    result = dict(pairs)
    if len(result) != len(pairs):
        raise ValueError('Duplicate holder manifest field.')
    return result


def _reference_filter_digest(source):
    arrays = re.findall(rb'^static struct sock_filter reference_filter\[\] = \{\n(.*?)^\};',
                        source, re.M | re.S)
    if len(arrays) != 1:
        return None
    constants = {b'SECCOMP_RET_ALLOW': 0x7fff0000, b'SECCOMP_RET_KILL_PROCESS': 0x80000000}
    program = bytearray()
    for line in arrays[0].splitlines():
        entry = re.fullmatch(rb'\s*\{([^{}]+)\},\s*(?:/\*[^\n]*\*/)?\s*', line)
        if entry is None or len(program) >= FILTER_BYTES:
            return None
        words = []
        for raw in entry[1].split(b','):
            token = raw.strip()
            if token in constants:
                words.append(constants[token])
            elif re.fullmatch(rb'0x[0-9a-f]{1,8}|0|[1-9][0-9]{0,9}', token):
                words.append(int(token, 0))
            else:
                return None
        try:
            program.extend(struct.pack('<HBBI', *words))
        except struct.error:
            return None
    return sha256(program).digest() if len(program) == FILTER_BYTES else None


def verify_fixture_holder_build_manifest(raw, expected_digest, source_revision, sources):
    """Check a pinned declaration and two local source byte strings without reading files or building."""
    if (type(raw) is not bytes or not 0 < len(raw) <= MAX_MANIFEST_BYTES
            or type(expected_digest) is not bytes or len(expected_digest) != 32
            or sha256(raw).digest() != expected_digest
            or type(source_revision) is not str or re.fullmatch(r'[0-9a-f]{40}', source_revision) is None
            or type(sources) is not tuple or len(sources) != len(SOURCE_ROLES)
            or not all(type(source) is bytes and 0 < len(source) <= MAX_SOURCE_BYTES for source in sources)):
        return None
    program_digest = _reference_filter_digest(sources[1])
    if program_digest != FILTER_DIGEST:
        return None
    expected = {
        'schema_id': 'urn:dosai:proposal:m4-linux-arm64-holder-build-manifest:1',
        'schema_version': 1,
        'scope': 'TEMPORARY_FILE_FIXTURE_HOLDER',
        'status': 'SOURCE_ONLY_HOLD',
        'source_revision': source_revision,
        'sources': [
            {'role': role, 'path': path, 'sha256': sha256(source).hexdigest()}
            for (role, path), source in zip(SOURCE_ROLES, sources)
        ],
        'reference_filter': {
            'symbol': 'reference_filter', 'encoding': 'LINUX_SOCK_FILTER_LITTLE_ENDIAN',
            'size_bytes': FILTER_BYTES, 'sha256': FILTER_DIGEST.hex(),
        },
        'build_contract': BUILD_CONTRACT,
        'output_contract': OUTPUT_CONTRACT,
        'entry_input': None,
        'toolchain_closure': None,
        'artifact_receipt': None,
        'build_authorized': False,
        'launch_authorized': False,
        'runtime_eligible': False,
        'qualifying_native_amd64_builder_receipts_added': 0,
    }
    try:
        document = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique_object)
        # Encoding preserves the distinction between booleans and integers.
        if json.dumps(document, sort_keys=True, allow_nan=False) != json.dumps(expected, sort_keys=True):
            return None
    except (ValueError, RecursionError):
        return None
    return FixtureHolderBuildDeclaration('SOURCE_ONLY_HOLD', expected_digest, source_revision, program_digest)
