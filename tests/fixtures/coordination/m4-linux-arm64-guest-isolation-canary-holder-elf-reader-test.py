"""Offline validation of an ARM64 ELF metadata reader using synthetic bytes."""

from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import struct
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[3]
PREFIX = 'm4-linux-arm64-guest-isolation-canary-holder-'


def module(name):
    source = ROOT / 'tools/local-coordination-pilot' / (PREFIX + name + '.py')
    spec = importlib.util.spec_from_file_location(name, source)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


reader = module('elf-reader')
closure = module('toolchain-closure')
BASE = 0x10000
PHDR = 64
INTERP = 0x180
DYNAMIC = 0x300
STRINGS = 0x800
NEED = 0x1000
DEFINE = 0x2000
LIBC = 'libc.so.6'
EXAMPLE = 'libexample.so.1'
LOADER = 'ld-linux-aarch64.so.1'
ABI_INTERPRETER = '/lib/' + LOADER
NAME_HASH = {
    LIBC: 0x865f4e6, EXAMPLE: 0xacb98b1,
    'GLIBC_2.38': 0x69691b8, 'GLIBC_2.41': 0x69691a1, 'GLIBC_PRIVATE': 0x963cf85,
    'EXAMPLE_1.0': 0x541e630, 'EXAMPLE_2.0': 0x541e330,
}


def elf(needed=(), interpreter=ABI_INTERPRETER, soname='', requirements=(), definitions=(), extra=(), kind=3):
    """Construct just the headers and loader metadata consumed by the reader."""
    data = bytearray(0x2800)
    names = bytearray(b'\0')
    offsets = {}

    def name(value):
        if value not in offsets:
            offsets[value] = len(names)
            names.extend(value.encode('ascii') + b'\0')
        return offsets[value]

    tags = [(1, name(library)) for library in needed]
    if soname:
        tags.append((14, name(soname)))

    offset = DEFINE
    for index, (label, parents) in enumerate(definitions):
        is_base = index == 0 and label == soname
        records = (label, *parents)
        advance = 20 + 8 * len(records)
        struct.pack_into('<HHHHIII', data, offset, 1, int(is_base), index + (1 if definitions[0][0] == soname else 2),
                         len(records), NAME_HASH[label], 20, advance if index + 1 < len(definitions) else 0)
        for subindex, version in enumerate(records):
            struct.pack_into('<II', data, offset + 20 + subindex * 8, name(version), 8 if subindex + 1 < len(records) else 0)
        offset += advance
    if definitions:
        tags.extend(((0x6ffffffc, BASE + DEFINE), (0x6ffffffd, len(definitions))))

    offset, version_index = NEED, len(definitions) + 2
    for index, (library, versions) in enumerate(requirements):
        advance = 16 + 16 * len(versions)
        struct.pack_into('<HHIII', data, offset, 1, len(versions), name(library), 16,
                         advance if index + 1 < len(requirements) else 0)
        for subindex, version in enumerate(versions):
            struct.pack_into('<IHHII', data, offset + 16 + subindex * 16, NAME_HASH[version], 0, version_index,
                             name(version), 16 if subindex + 1 < len(versions) else 0)
            version_index += 1
        offset += advance
    if requirements:
        tags.extend(((0x6ffffffe, BASE + NEED), (0x6fffffff, len(requirements))))

    tags.extend(((5, BASE + STRINGS), (10, len(names)), *extra, (0, 0)))
    for index, tag in enumerate(tags):
        struct.pack_into('<qQ', data, DYNAMIC + index * 16, *tag)
    data[STRINGS:STRINGS + len(names)] = names
    struct.pack_into('<16sHHIQQQIHHHHHH', data, 0, b'\x7fELF\x02\x01\x01', kind, 183, 1, 0,
                     PHDR, 0, 0, 64, 56, 2 + bool(interpreter), 0, 0, 0)
    offset = PHDR
    if interpreter:
        text = interpreter.encode('ascii') + b'\0'
        data[INTERP:INTERP + len(text)] = text
        struct.pack_into('<IIQQQQQQ', data, PHDR, 3, 4, INTERP, BASE + INTERP, 0, len(text), len(text), 1)
        offset += 56
    struct.pack_into('<IIQQQQQQ', data, offset, 1, 5, 0, BASE, 0, len(data), len(data), 0x1000)
    size = len(tags) * 16
    struct.pack_into('<IIQQQQQQ', data, offset + 56, 2, 4, DYNAMIC, BASE + DYNAMIC, 0, size, size, 8)
    return bytes(data)


def edited(data, offset, fmt, *values):
    result = bytearray(data)
    struct.pack_into(fmt, result, offset, *values)
    return bytes(result)


def read(data):
    return reader.read_arm64_elf_metadata(data, sha256(data).digest())


class Arm64ELFReaderTests(unittest.TestCase):
    def test_stripped_pie_preserves_needed_order_and_exact_version_requirements(self):
        image = elf((EXAMPLE, LIBC), requirements=((EXAMPLE, ('EXAMPLE_1.0',)),
                                                      (LIBC, ('GLIBC_2.38', 'GLIBC_PRIVATE'))),
                    extra=((0x6ffffffb, 0x08000001), (30, 8)))
        metadata = read(image)
        self.assertEqual(metadata.digest, sha256(image).digest())
        self.assertEqual(metadata.abi, closure.ELF_ABI)
        self.assertEqual(metadata.kind, 'DYNAMIC_TOOL')
        self.assertEqual(metadata.interpreter, closure.ELF_INTERPRETER)
        self.assertEqual(metadata.needed, ((EXAMPLE, ('EXAMPLE_1.0',)), (LIBC, ('GLIBC_2.38', 'GLIBC_PRIVATE'))))
        self.assertEqual(metadata.version_definitions, ())
        self.assertEqual(metadata.unsupported_features, ())

    def test_shared_object_preserves_soname_and_excludes_base_record_from_versions(self):
        definitions = ((EXAMPLE, ()), ('EXAMPLE_1.0', ()), ('EXAMPLE_2.0', ('EXAMPLE_1.0',)))
        metadata = read(elf(interpreter='', soname=EXAMPLE, definitions=definitions))
        self.assertEqual(metadata.kind, 'SHARED_OBJECT')
        self.assertEqual(metadata.soname, EXAMPLE)
        self.assertEqual(metadata.interpreter, '')
        self.assertEqual(metadata.version_definitions, ('EXAMPLE_1.0', 'EXAMPLE_2.0'))
        dual_role = read(elf(soname=EXAMPLE, definitions=definitions))
        self.assertEqual((dual_role.kind, dual_role.interpreter), ('SHARED_OBJECT', ABI_INTERPRETER))

    def test_checks_digest_size_and_immutability_before_parser(self):
        image = elf()
        with patch.object(reader, '_program_headers') as headers:
            for data, digest in ((image, bytes(32)), (bytearray(image), sha256(image).digest()),
                                 (image[:20], sha256(image[:20]).digest())):
                with self.subTest(size=len(data)), self.assertRaisesRegex(ValueError, 'input pin'):
                    reader.read_arm64_elf_metadata(data, digest)
            with patch.object(reader, 'MAX_ELF_BYTES', len(image) - 1), self.assertRaisesRegex(ValueError, 'input pin'):
                read(image)
            headers.assert_not_called()

    def test_wrong_architecture_encoding_header_size_and_extended_counts_are_rejected(self):
        image = elf()
        for offset, fmt, value in ((18, '<H', 62), (5, '<B', 2), (4, '<B', 1), (16, '<H', 1),
                                   (52, '<H', 63), (54, '<H', 55), (56, '<H', 65535), (32, '<Q', len(image))):
            with self.subTest(offset=offset), self.assertRaisesRegex(ValueError, 'ELF header'):
                read(edited(image, offset, fmt, value))

    def test_program_header_conflicts_missing_dynamic_and_load_mapping_fail_closed(self):
        image = elf()
        for offset, fmt, value in ((PHDR, '<I', 2), (PHDR + 112, '<I', 4), (PHDR + 112 + 8, '<Q', 0x400),
                                   (PHDR + 56 + 32, '<Q', len(image) + 1)):
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                read(edited(image, offset, fmt, value))
        two_loads = edited(image, 56, '<H', 4)
        two_loads = edited(two_loads, PHDR + 168, '<IIQQQQQQ', 1, 5, 0, BASE, 0, 64, 64, 8)
        with self.assertRaisesRegex(ValueError, 'overlapping ELF load'):
            read(two_loads)

    def test_dynamic_pointer_in_bss_duplicate_tags_and_nonzero_after_null_fail_closed(self):
        plain = elf()
        bss = edited(plain, PHDR + 56 + 32, '<Q', STRINGS)
        with self.assertRaisesRegex(ValueError, 'outside a file-backed load'):
            read(bss)
        with self.assertRaisesRegex(ValueError, 'Duplicate ELF dynamic tag'):
            read(elf(extra=((5, BASE + STRINGS),)))
        with self.assertRaisesRegex(ValueError, 'Missing ELF dynamic terminator'):
            read(edited(plain, DYNAMIC + 32, '<qQ', 6, 0))
        with self.assertRaisesRegex(ValueError, 'after ELF dynamic terminator'):
            read(elf(extra=((0, 0), (6, 0))))

    def test_interpreter_and_loader_names_are_bounded_and_canonical(self):
        for path in ('relative', '/lib/../loader', '/lib//loader', '/lib/ld\0bad'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                read(elf(interpreter=path))
        for needed in (('/usr/lib/example.so',), ('${ORIGIN}/example.so',), ('x' * 129,), (LIBC, LIBC)):
            with self.subTest(needed=needed), self.assertRaises(ValueError):
                read(elf(needed))
        image = elf((LIBC,))
        with self.assertRaisesRegex(ValueError, 'string index'):
            read(edited(image, DYNAMIC + 8, '<Q', 9999))

    def test_unknown_tags_and_search_overrides_are_reported_as_held_features(self):
        metadata = read(elf(extra=((29, 0), (0x6ffffefc, 0), (0x7fffffff, 0), (0x70000001, 0),
                                    (30, 1), (0x6ffffffb, 0x800))))
        self.assertEqual(metadata.unsupported_features,
                         ('DT_AUDIT', 'DT_FILTER', 'DT_FLAGS', 'DT_FLAGS_1', 'DT_RUNPATH', 'DT_UNKNOWN:0x70000001'))
        image = edited(elf(), PHDR + 56 + 4, '<I', 7)
        stack = edited(edited(image, 56, '<H', 4), PHDR + 168, '<II', 0x6474e551, 7)
        self.assertEqual(read(stack).unsupported_features, ('PT_GNU_STACK_EXECUTE', 'PT_LOAD_WRITE_EXECUTE'))

    def test_malformed_version_needs_reject_bounds_bad_hash_and_unknown_owner(self):
        image = elf((LIBC,), requirements=((LIBC, ('GLIBC_2.38',)),))
        for offset, fmt, value in ((NEED, '<H', 2), (NEED + 2, '<H', 999), (NEED + 8, '<I', 4),
                                   (NEED + 12, '<I', 16), (NEED + 16, '<I', 0),
                                   (NEED + 22, '<H', 1), (NEED + 28, '<I', 16)):
            with self.subTest(offset=offset), self.assertRaisesRegex(ValueError, 'ELF version'):
                read(edited(image, offset, fmt, value))
        with self.assertRaisesRegex(ValueError, 'no unique needed library'):
            read(elf((EXAMPLE,), requirements=((LIBC, ('GLIBC_2.38',)),)))

    def test_malformed_version_definitions_and_metadata_overlaps_are_rejected(self):
        image = elf(interpreter='', soname=LIBC, definitions=((LIBC, ()), ('GLIBC_2.38', ())))
        for offset, fmt, value in ((DEFINE + 4, '<H', 2), (DEFINE + 8, '<I', 0),
                                   (DEFINE + 12, '<I', len(image)), (DEFINE + 16, '<I', 4)):
            with self.subTest(offset=offset), self.assertRaisesRegex(ValueError, 'ELF version'):
                read(edited(image, offset, fmt, value))
        # Extend the string table to include the readable version records.
        with self.assertRaisesRegex(ValueError, 'Overlapping ELF metadata'):
            read(edited(image, DYNAMIC + 4 * 16 + 8, '<Q', 0x1800 + 0x80))

    def test_parsed_graph_consumes_metadata_and_keeps_unsafe_search_held(self):
        libc = 'toolchain/runtime/usr/lib/aarch64-linux-gnu/' + LIBC
        loader = 'toolchain/runtime/lib/' + LOADER
        driver, *others = tuple(closure.TOOL_PREFIX + tool for tool in closure.REQUIRED_TOOLS)
        tools = {path: elf((LIBC,)) for path in (driver, *others)}
        objects = {**tools, libc: elf(interpreter='', soname=LIBC), loader: elf(interpreter='', soname=LOADER)}

        def verify(data_by_path):
            entries = tuple(closure.FixtureHolderToolchainFile(path, len(data), sha256(data).digest(), True)
                            for path, data in data_by_path.items())
            extra = ('toolchain/sysroot/fcntl.h', 'toolchain/sysroot/linux/seccomp.h',
                     'toolchain/sysroot/crt1.o', 'toolchain/sysroot/libc.a', 'toolchain/lib/libgcc.a')
            entries += tuple(closure.FixtureHolderToolchainFile(path, 1, sha256(b'x').digest(), False) for path in extra)
            manifest, recipe = closure.MANIFEST_V2_DIGEST, closure.RECIPE_V2_DIGEST
            lock = closure.FixtureHolderToolchainLock(manifest, recipe, entries)
            digest = closure.fixture_holder_toolchain_lock_digest(lock)
            inventory = closure.FixtureHolderToolchainObservation('SYNTHETIC_ONLY', 'NATIVE_LINUX_ARM64',
                                                                   manifest, recipe, True, True, entries)
            rows = tuple(closure.FixtureHolderELFObject(path, *read(data)) for path, data in data_by_path.items())
            observation = closure.FixtureHolderELFObservation('SYNTHETIC_ONLY', digest, True, rows)
            return closure.verify_fixture_holder_elf_closure(lock, digest, inventory, observation)

        self.assertEqual(verify(objects).status, 'SOURCE_ONLY_HOLD')
        self.assertIsNone(verify(dict(objects, **{driver: elf((LIBC,), extra=((29, 0),))})))
        self.assertIsNone(verify(dict(objects, **{libc: elf(soname=LIBC)})))

    def test_linker_receipt_binds_the_exact_archive_member_and_keeps_native_authority_unset(self):
        proposals = ROOT / 'docs/proposals'
        receipt = json.loads((proposals / 'm4-linux-arm64-holder-linker-member-observation-v1.json').read_bytes())
        allowlist = (proposals / 'm4-linux-arm64-holder-staging-allowlist-v2.json').read_bytes()
        pins = (proposals / 'm4-linux-arm64-holder-debian-dependency-candidate-v1.json').read_bytes()
        self.assertEqual(receipt['source_revision'], '2680cc9f97f8f60b3d77faa29f0d504a8b131307')
        self.assertEqual(receipt['status'], 'LINKER_MEMBER_MEASURED_SOURCE_ONLY_HOLD')
        self.assertEqual(receipt['raw_receipt_sha256'], 'e933152a09009dcee30f695067e564c4d2c284cd3f98ce3e893aeb1d5fab80e1')
        self.assertEqual(receipt['allowlist_sha256'], sha256(allowlist).hexdigest())
        self.assertEqual(receipt['dependency_candidate_sha256'], sha256(pins).hexdigest())
        measured = receipt['measurement']
        self.assertEqual({key: measured[key] for key in ('package', 'member_path', 'staged_path')},
                         json.loads(allowlist)['paths'][-1])
        self.assertEqual((measured['kind'], measured['mode_octal'], measured['size_bytes']), ('FILE', '0755', 2499576))
        self.assertEqual(measured['sha256'], '5a284e435cdf41bc05d93f0683da12b8a42608b93c79e187e7d03fab6a22ddf4')
        archive = receipt['archive']
        pin, = (item for item in json.loads(pins)['packages'] if item['Package'] == measured['package'])
        self.assertEqual((archive['size_bytes'], archive['sha256']), (int(pin['Size']), pin['SHA256']))
        for flag in ('package_archives_saved', 'payload_files_saved', 'native_staging_observed',
                     'materialization_authorized', 'build_authorized', 'launch_authorized', 'runtime_eligible'):
            self.assertIs(receipt[flag], False)
        for field in ('elf_metadata_observation', 'native_loader_closure', 'approved_toolchain_lock', 'artifact_receipt'):
            self.assertIsNone(receipt[field])
        self.assertEqual(receipt['qualifying_native_amd64_builder_receipts_added'], 0)


if __name__ == '__main__':
    unittest.main()
