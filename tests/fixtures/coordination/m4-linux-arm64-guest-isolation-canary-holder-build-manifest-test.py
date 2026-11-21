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
MANIFEST_V2_FILE = ROOT / 'docs/proposals/m4-linux-arm64-holder-build-manifest-v2.json'
SOURCE_REVISION = 'db4cd588f0b579116c833edd0341e2d1fa9fbdfb'
MANIFEST_DIGEST = bytes.fromhex('5d115ca42e5d514db5ead1ff56310a52af6d8a4aa97ffe533bba9c0cf257ad4a')
SOURCE_REVISION_V2 = '570c9e3c3e951452666ebb2a773ed5d88b68eb13'
MANIFEST_DIGEST_V2 = bytes.fromhex('d64c75e57e71ca4ff11795f3ebf087a457eb8faaa99ffc4d4bd8e3e72ab87a3e')
RECIPE_DIGEST_V2 = 'c0c9d991e2da8966a2d8ab53f73935b7465ee3d998c848b52ad85a67350e0272'


def load(suffix):
    spec = importlib.util.spec_from_file_location(suffix, TOOLS / f'{PREFIX}{suffix}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


manifest = load('holder-build-manifest')
harness = load('harness')
native = load('watchdog-terminator')
RAW = MANIFEST_FILE.read_bytes()
RAW_V2 = MANIFEST_V2_FILE.read_bytes()
SOURCES = tuple((TOOLS / f'{PREFIX}{suffix}.c').read_bytes() for suffix in ('holder-bootstrap', 'reference-filter'))
SOURCES_V2 = (*SOURCES, (TOOLS / f'{PREFIX}holder-entry.c').read_bytes())


def verify(raw=RAW, digest=MANIFEST_DIGEST, revision=SOURCE_REVISION, sources=SOURCES):
    return manifest.verify_fixture_holder_build_manifest(raw, digest, revision, sources)


def checked_document(document, sources=SOURCES):
    raw = json.dumps(document).encode('utf-8')
    return verify(raw=raw, digest=sha256(raw).digest(), sources=sources)


def verify_v2(raw=RAW_V2, digest=MANIFEST_DIGEST_V2, revision=SOURCE_REVISION_V2, sources=SOURCES_V2):
    return manifest.verify_fixture_holder_build_manifest_v2(raw, digest, revision, sources)


def checked_document_v2(document):
    raw = json.dumps(document).encode('utf-8')
    return verify_v2(raw=raw, digest=sha256(raw).digest())


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


class HolderBuildManifestSuccessorTests(unittest.TestCase):
    def test_successor_pins_the_entry_and_preserves_the_v1_inputs(self):
        declaration = verify_v2()
        self.assertEqual(declaration, manifest.FixtureHolderBuildDeclaration(
            'SOURCE_ONLY_HOLD', MANIFEST_DIGEST_V2, SOURCE_REVISION_V2, harness.TEMP_REFERENCE_FILTER_DIGEST,
        ))
        predecessor, successor = json.loads(RAW), json.loads(RAW_V2)
        self.assertEqual(successor['predecessor_manifest_sha256'], sha256(RAW).hexdigest())
        self.assertEqual(successor['sources'][:2], predecessor['sources'])
        self.assertEqual(successor['entry_input'], {
            'role': 'HOLDER_ENTRY', 'sha256': sha256(SOURCES_V2[2]).hexdigest(),
        })
        self.assertEqual(successor['entry_input']['sha256'], successor['sources'][2]['sha256'])
        self.assertEqual(successor['output_contract'], predecessor['output_contract'])
        self.assertEqual(successor['reference_filter'], predecessor['reference_filter'])

    def test_recipe_binds_three_compilations_and_one_static_link(self):
        declaration = json.loads(RAW_V2)
        recipe = declaration['recipe']
        canonical = json.dumps(recipe, sort_keys=True, separators=(',', ':')).encode('ascii')
        self.assertEqual(declaration['recipe_sha256'], RECIPE_DIGEST_V2)
        self.assertEqual(sha256(canonical).hexdigest(), RECIPE_DIGEST_V2)
        steps = recipe['argv']
        self.assertEqual(len(steps), 4)
        self.assertEqual([step[step.index('-c') + 1] for step in steps[:3]],
                         ['src/holder-entry.c', 'src/holder-bootstrap.c', 'src/reference-filter.c'])
        self.assertEqual(steps[3][-6:], [
            '-fno-lto', 'obj/holder-entry.o', 'obj/holder-bootstrap.o',
            'obj/reference-filter.o', '-o', 'out/dosai-temp-file-holder',
        ])
        self.assertIn('-static', steps[3])
        self.assertIn('-no-pie', steps[3])
        self.assertFalse(recipe['inherit_environment'])

    def test_rehashed_recipe_changes_cannot_widen_inputs_or_execution(self):
        for field, value in (
            ('execution', 'SHELL'), ('driver', '/usr/bin/gcc'), ('inherit_environment', True),
            ('environment', {'PATH': '/usr/bin'}), ('workspace', '..'),
            ('staged_sources', {'HOLDER_ENTRY': '../guest.c'}),
        ):
            document = json.loads(RAW_V2)
            document['recipe'][field] = value
            canonical = json.dumps(document['recipe'], sort_keys=True, separators=(',', ':')).encode('ascii')
            document['recipe_sha256'] = sha256(canonical).hexdigest()
            self.assertIsNone(checked_document_v2(document))
        for new_argument in ('-lrecipe_extra', '-Wl,--allow-shlib-undefined', '../other.o'):
            document = json.loads(RAW_V2)
            document['recipe']['argv'][3].insert(-2, new_argument)
            canonical = json.dumps(document['recipe'], sort_keys=True, separators=(',', ':')).encode('ascii')
            document['recipe_sha256'] = sha256(canonical).hexdigest()
            self.assertIsNone(checked_document_v2(document))

    def test_v2_rejects_mixed_revisions_missing_entry_and_changed_parent(self):
        self.assertIsNone(verify_v2(revision=SOURCE_REVISION))
        self.assertIsNone(verify_v2(sources=SOURCES))
        self.assertIsNone(verify_v2(sources=(*SOURCES, SOURCES_V2[2] + b'\n')))
        self.assertIsNone(verify_v2(raw=RAW, digest=MANIFEST_DIGEST))
        self.assertIsNone(verify(raw=RAW_V2, digest=MANIFEST_DIGEST_V2, revision=SOURCE_REVISION_V2))
        for field, value in (('predecessor_manifest_sha256', 'a' * 64), ('recipe_sha256', 'b' * 64),
                             ('entry_input', {'role': 'HOLDER_ENTRY', 'sha256': 'c' * 64})):
            document = json.loads(RAW_V2)
            document[field] = value
            self.assertIsNone(checked_document_v2(document))

    def test_v2_keeps_the_toolchain_artifact_build_launch_and_builder_gates_held(self):
        for field, value in (
            ('toolchain_closure', {'sha256': 'a' * 64}), ('artifact_receipt', {'executable_sha256': 'b' * 64}),
            ('status', 'BUILT'), ('build_authorized', True), ('launch_authorized', True),
            ('runtime_eligible', True), ('qualifying_native_amd64_builder_receipts_added', 1),
        ):
            document = json.loads(RAW_V2)
            document[field] = value
            self.assertIsNone(checked_document_v2(document))


if __name__ == '__main__':
    unittest.main()
