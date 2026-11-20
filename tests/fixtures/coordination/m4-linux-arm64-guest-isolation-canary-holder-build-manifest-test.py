"""Offline checks for the held fixture-holder build declaration."""

from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]
TOOLS = ROOT / 'tools/local-coordination-pilot'
PREFIX = 'm4-linux-arm64-guest-isolation-canary-'
MANIFEST_FILE = ROOT / 'docs/proposals/m4-linux-arm64-holder-build-manifest-v1.json'
SOURCE_REVISION = 'db4cd588f0b579116c833edd0341e2d1fa9fbdfb'
MANIFEST_DIGEST = bytes.fromhex('5d115ca42e5d514db5ead1ff56310a52af6d8a4aa97ffe533bba9c0cf257ad4a')


def load(suffix):
    spec = importlib.util.spec_from_file_location(suffix, TOOLS / f'{PREFIX}{suffix}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


manifest = load('holder-build-manifest')
harness = load('harness')
native = load('watchdog-terminator')
RAW = MANIFEST_FILE.read_bytes()
SOURCES = tuple((TOOLS / f'{PREFIX}{suffix}.c').read_bytes() for suffix in ('holder-bootstrap', 'reference-filter'))


def verify(raw=RAW, digest=MANIFEST_DIGEST, revision=SOURCE_REVISION, sources=SOURCES):
    return manifest.verify_fixture_holder_build_manifest(raw, digest, revision, sources)


def checked_document(document, sources=SOURCES):
    raw = json.dumps(document).encode('utf-8')
    return verify(raw=raw, digest=sha256(raw).digest(), sources=sources)


class HolderBuildManifestTests(unittest.TestCase):
    def test_pinned_declaration_and_reviewed_c_inputs_validate_as_held(self):
        expected = manifest.FixtureHolderBuildDeclaration(
            'SOURCE_ONLY_HOLD', MANIFEST_DIGEST, SOURCE_REVISION, harness.TEMP_REFERENCE_FILTER_DIGEST,
        )
        self.assertEqual(verify(), expected)
        source = json.loads(RAW)
        self.assertEqual(source['reference_filter']['sha256'], harness.TEMP_REFERENCE_FILTER_DIGEST.hex())
        self.assertEqual(source['output_contract']['max_bytes'], native.MAX_HOLDER_IMAGE_BYTES)
        self.assertEqual(source['output_contract']['required_image_seal_mask'], native.REQUIRED_HOLDER_IMAGE_SEALS)
        self.assertIsNone(source['entry_input'])
        self.assertIsNone(source['toolchain_closure'])
        self.assertIsNone(source['artifact_receipt'])

    def test_exact_manifest_digest_source_revision_and_source_bytes_are_required(self):
        self.assertIsNone(verify(raw=RAW + b'\n'))
        self.assertIsNone(verify(digest=b'x' * 32))
        self.assertIsNone(verify(revision='f' * 40))
        self.assertIsNone(verify(revision=SOURCE_REVISION.upper()))
        self.assertIsNone(verify(sources=SOURCES[::-1]))
        for changed in ((SOURCES[0] + b'\n', SOURCES[1]), (SOURCES[0], SOURCES[1] + b'\n')):
            with self.subTest(changed=changed[0] != SOURCES[0]):
                self.assertIsNone(verify(sources=changed))

    def test_duplicate_unknown_and_malformed_fields_are_rejected_even_with_a_new_digest(self):
        documents = (
            RAW.replace(b'"schema_version": 1,', b'"schema_version": 1, "schema_version": 1,'),
            RAW.replace(b'"symbol": "reference_filter",', b'"symbol": "reference_filter", "symbol": "reference_filter",'),
            RAW.replace(b'"schema_version": 1,', b'"schema_version": 1, "approved": true,'),
            b'\xff', b'{', b'[]', b'[' * 2000 + b'0' + b']' * 2000,
            b'x' * (manifest.MAX_MANIFEST_BYTES + 1),
        )
        for raw in documents:
            with self.subTest(raw=raw[:60]):
                self.assertIsNone(verify(raw=raw, digest=sha256(raw).digest()))

    def test_source_path_roles_and_order_cannot_select_other_inputs(self):
        for field, value in (
            ('path', '../unreviewed.c'), ('path', '/private/unreviewed.c'),
            ('role', 'ENTRY'), ('sha256', 'x' * 64),
        ):
            source = json.loads(RAW)
            source['sources'][0][field] = value
            self.assertIsNone(checked_document(source))
        source = json.loads(RAW)
        source['sources'].reverse()
        self.assertIsNone(checked_document(source))

    def test_reference_filter_digest_is_recomputed_from_c_words(self):
        for old, new in (
            (b'{0x15, 0, 14, 0xc00000b7}', b'{0x15, 0, 14, 0xc000003e}'),
            (b'{0x15, 11, 0, 57}', b'{0x15, 11, 0, 58}'),
            (b'{0x20, 0, 0, 4}', b'{0x20, 256, 0, 4}'),
            (b'SECCOMP_RET_KILL_PROCESS},', b'SECCOMP_RET_ALLOW},'),
        ):
            with self.subTest(word=old):
                altered = SOURCES[1].replace(old, new, 1)
                self.assertNotEqual(altered, SOURCES[1])
                source = json.loads(RAW)
                source['sources'][1]['sha256'] = sha256(altered).hexdigest()
                self.assertIsNone(checked_document(source, (SOURCES[0], altered)))

    def test_build_contract_refuses_cross_build_dynamic_link_and_unpinned_inputs(self):
        for section, field, value in (
            ('build_contract', 'host', 'NATIVE_LINUX_AMD64'),
            ('build_contract', 'target', 'x86_64-linux-gnu'),
            ('build_contract', 'network', 'ENABLED'),
            ('build_contract', 'compile_flags', ['-std=c11', '-flto']),
            ('build_contract', 'link_flags', ['-static-pie']),
            ('build_contract', 'required_input_digests', ['compiler']),
            ('output_contract', 'allow_interpreter', True),
            ('output_contract', 'allow_dynamic_segment', 0),
            ('output_contract', 'max_bytes', native.MAX_HOLDER_IMAGE_BYTES + 1),
            ('output_contract', 'required_image_seal_mask', 7),
            ('output_contract', 'required_receipt_fields', ['executable_sha256']),
        ):
            with self.subTest(field=field, value=value):
                source = json.loads(RAW)
                source[section][field] = value
                self.assertIsNone(checked_document(source))

    def test_source_declaration_cannot_accept_a_receipt_or_grant_authority(self):
        for field, value in (
            ('status', 'BUILT'), ('entry_input', {'sha256': 'a' * 64}),
            ('toolchain_closure', {'sha256': 'b' * 64}), ('artifact_receipt', {'executable_sha256': 'c' * 64}),
            ('build_authorized', True), ('launch_authorized', True), ('runtime_eligible', True),
            ('runtime_eligible', 0), ('qualifying_native_amd64_builder_receipts_added', 1),
        ):
            with self.subTest(field=field):
                source = json.loads(RAW)
                source[field] = value
                self.assertIsNone(checked_document(source))


if __name__ == '__main__':
    unittest.main()
