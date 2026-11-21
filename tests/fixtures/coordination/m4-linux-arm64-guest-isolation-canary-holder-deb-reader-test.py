"""Offline checks using generated in-memory archives and pinned source metadata."""

from hashlib import sha256
import importlib.util
import io
import json
import lzma
from pathlib import Path, PurePosixPath
import tarfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[3]
NAME = 'm4-linux-arm64-guest-isolation-canary-holder-deb-reader.py'
SPEC = importlib.util.spec_from_file_location('deb_reader', ROOT / 'tools/local-coordination-pilot' / NAME)
reader = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reader)


def tar(entries, archive_format=tarfile.USTAR_FORMAT):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=archive_format) as writer:
        for name, kind, mode, value in entries:
            info = tarfile.TarInfo(name)
            info.type = kind
            info.mode = mode
            if kind == tarfile.REGTYPE:
                info.size = len(value)
                writer.addfile(info, io.BytesIO(value))
            else:
                info.linkname = value
                writer.addfile(info)
    return output.getvalue()


def ar_member(name, data):
    header = f'{name + "/":16}{0:<12}{0:<6}{0:<6}{100644:<8}{len(data):<10}`\n'.encode('ascii')
    return header + data + (b'\n' if len(data) % 2 else b'')


def deb(payload, data_name='data.tar', version=b'2.0\n'):
    # The reader must treat control bytes as opaque, including malformed compressed bytes.
    return (b'!<arch>\n' + ar_member('debian-binary', version)
            + ar_member('control.tar.xz', b'inert') + ar_member(data_name, payload))


def pin(data, package='example-tool'):
    return reader.ArchivePin(package, '1.0-1', 'arm64', 'debian',
                            f'pool/main/e/example/{package}_1.0-1_arm64.deb', len(data), sha256(data).digest())


TOOL = 'usr/bin/example-tool'
ALIAS = 'usr/bin/example-alias'
BODY = b'synthetic compiler placeholder'
ENTRIES = (
    ('./', tarfile.DIRTYPE, 0o755, ''),
    ('./' + TOOL, tarfile.REGTYPE, 0o755, BODY),
    (ALIAS, tarfile.SYMTYPE, 0o777, 'example-tool'),
    ('usr/share/doc/example', tarfile.REGTYPE, 0o644, b'unselected bytes'),
)
TOOL_PATH = reader.StagingPath('example-tool', TOOL, 'toolchain/bin/example-tool')
ALIAS_PATH = reader.StagingPath('example-tool', ALIAS, 'toolchain/bin/example-alias')


class DebPayloadReaderTests(unittest.TestCase):
    def test_plain_ustar_and_checked_gnu_xz_measure_only_selected_members(self):
        packages = (deb(tar(ENTRIES)), deb(lzma.compress(tar(ENTRIES, tarfile.GNU_FORMAT), preset=0), 'data.tar.xz'))
        for archive in packages:
            with self.subTest(size=len(archive)):
                members = reader.read_pinned_debian_payload(archive, pin(archive), (TOOL, ALIAS))
                self.assertEqual(members, {
                    TOOL: reader.PayloadMember(TOOL, 0o755, len(BODY), sha256(BODY).digest(), None),
                    ALIAS: reader.PayloadMember(ALIAS, 0o777, 0, None, 'example-tool'),
                })

    def test_exact_archive_hash_and_size_are_checked_before_payload_parsing(self):
        archive = deb(tar(ENTRIES))
        with patch.object(reader, '_payload') as parse:
            for wrong in (pin(archive)._replace(size=len(archive) + 1),
                          pin(archive)._replace(digest=bytes(32)), pin(archive)._replace(architecture='amd64')):
                with self.assertRaisesRegex(ValueError, 'exact pin'):
                    reader.read_pinned_debian_payload(archive, wrong, (TOOL,))
            with self.assertRaisesRegex(ValueError, 'exact pin'):
                reader.read_pinned_debian_payload(bytearray(archive), pin(archive), (TOOL,))
            parse.assert_not_called()

    def test_ar_container_rejects_wrong_order_containers_extents_and_extra_members(self):
        payload = tar(ENTRIES)
        archive = deb(payload)
        for value in (archive[:-1], archive + ar_member('extra', b'x'),
                      deb(payload, 'data.tar.gz'), deb(payload, version=b'3.0\n'),
                      archive.replace(b'inert\n', b'inert\0', 1),
                      b'!<arch>\n' + ar_member('data.tar', payload)):
            with self.subTest(size=len(value)), self.assertRaisesRegex(ValueError, 'Debian'):
                reader.read_pinned_debian_payload(value, pin(value), (TOOL,))

    def test_xz_rejects_truncation_trailers_missing_integrity_and_expansion_over_limit(self):
        payload = tar(ENTRIES)
        stream = lzma.compress(payload, preset=0)
        for bad in (stream[:-1], stream + b'extra', stream + stream,
                    lzma.compress(payload, check=lzma.CHECK_NONE, preset=0)):
            archive = deb(bad, 'data.tar.xz')
            with self.subTest(size=len(bad)), self.assertRaisesRegex(ValueError, 'xz'):
                reader.read_pinned_debian_payload(archive, pin(archive), (TOOL,))
        archive = deb(stream, 'data.tar.xz')
        with patch.object(reader, 'MAX_TAR_BYTES', len(payload) - 1), self.assertRaisesRegex(ValueError, 'xz'):
            reader.read_pinned_debian_payload(archive, pin(archive), (TOOL,))
        with patch.object(reader, 'MAX_XZ_MEMORY', 4096), self.assertRaisesRegex(ValueError, 'xz'):
            reader.read_pinned_debian_payload(archive, pin(archive), (TOOL,))

    def test_whole_payload_rejects_bad_unselected_paths_types_modes_and_file_ancestors(self):
        malformed_entries = (
            ('../outside', tarfile.REGTYPE, 0o644, b'x'),
            ('/outside', tarfile.REGTYPE, 0o644, b'x'),
            ('usr//bin/duplicate-slash', tarfile.REGTYPE, 0o644, b'x'),
            (TOOL + '/child', tarfile.REGTYPE, 0o644, b'x'),
            ('./' + TOOL, tarfile.REGTYPE, 0o755, BODY),
            ('bad-link', tarfile.SYMTYPE, 0o777, '../outside'),
            ('bad-link', tarfile.LNKTYPE, 0o755, TOOL),
            ('bad-pipe', tarfile.FIFOTYPE, 0o644, ''),
            ('bad-mode', tarfile.REGTYPE, 0o4755, b'x'),
        )
        for row in malformed_entries:
            with self.subTest(row=row):
                archive = deb(tar((*ENTRIES, row)))
                with self.assertRaises(ValueError):
                    reader.read_pinned_debian_payload(archive, pin(archive), (TOOL,))

    def test_rejects_extended_header_corruption_and_incomplete_tar_termination(self):
        payload = tar(ENTRIES)
        bad_checksum = b'Z' + payload[1:]
        pax_record = tar((('long-name-' * 20, tarfile.REGTYPE, 0o644, b'x'),), tarfile.PAX_FORMAT)
        for value in (bad_checksum, payload[:7 * 512], payload[:-1], payload[:-1] + b'x', pax_record):
            with self.subTest(size=len(value)):
                archive = deb(value)
                with self.assertRaisesRegex(ValueError, 'tar'):
                    reader.read_pinned_debian_payload(archive, pin(archive), (TOOL,))

    def test_selected_paths_and_total_member_limits_are_enforced(self):
        archive = deb(tar(ENTRIES))
        for paths in ((TOOL, TOOL), ('./' + TOOL,), (), ('missing',)):
            with self.subTest(paths=paths), self.assertRaises(ValueError):
                reader.read_pinned_debian_payload(archive, pin(archive), paths)
        with patch.object(reader, 'MAX_MEMBERS', 3), self.assertRaisesRegex(ValueError, 'member limit'):
            reader.read_pinned_debian_payload(archive, pin(archive), (TOOL,))
        with patch.object(reader, 'MAX_MEMBER_BYTES', 4), self.assertRaisesRegex(ValueError, 'member size'):
            reader.read_pinned_debian_payload(archive, pin(archive), (TOOL,))


class HolderStagingProjectionTests(unittest.TestCase):
    def setUp(self):
        self.archive = deb(tar(ENTRIES))
        self.archive_pin = pin(self.archive)
        self.paths = (TOOL_PATH, ALIAS_PATH)
        self.rows = (
            reader.StagingMemberPin(TOOL_PATH, self.archive_pin,
                                    reader.PayloadMember(TOOL, 0o755, len(BODY), sha256(BODY).digest(), None), None),
            reader.StagingMemberPin(ALIAS_PATH, self.archive_pin,
                                    reader.PayloadMember(ALIAS, 0o777, 0, None, 'example-tool'), 'example-tool'),
        )

    def verify(self, paths=None, rows=None, archives=None):
        return reader.verify_staging_projection(self.paths if paths is None else paths,
                                                {'example-tool': self.archive_pin},
                                                self.rows if rows is None else rows,
                                                {'example-tool': self.archive} if archives is None else archives)

    def test_exact_paths_bytes_modes_and_source_and_staged_aliases(self):
        self.assertEqual(self.verify(), reader.StagingProjection('SOURCE_ONLY_HOLD', self.rows))
        for member in (self.rows[0].member._replace(mode=0o644), self.rows[0].member._replace(digest=bytes(32)),
                       self.rows[0].member._replace(size=len(BODY) + 1),
                       self.rows[0].member._replace(size=float(len(BODY)))):
            with self.assertRaisesRegex(ValueError, 'differ from review'):
                self.verify(rows=(self.rows[0]._replace(member=member), self.rows[1]))
        with self.assertRaisesRegex(ValueError, 'provenance'):
            self.verify(rows=(self.rows[0]._replace(archive=self.archive_pin._replace(version='1.0-2')), self.rows[1]))

    def test_invalid_duplicate_overlapping_and_extra_paths_are_rejected(self):
        for staged in (TOOL_PATH.staged_path, TOOL_PATH.staged_path + '/child', '../escape',
                       'toolchain/sysroot/../bin/escape', 'toolchain/unreviewed/file'):
            with self.subTest(staged=staged), self.assertRaises(ValueError):
                self.verify(paths=(TOOL_PATH, ALIAS_PATH._replace(staged_path=staged)))
        with self.assertRaisesRegex(ValueError, 'cover the allowlist'):
            self.verify(rows=self.rows[:1])
        with self.assertRaisesRegex(ValueError, 'cover the allowlist'):
            self.verify(archives={'example-tool': self.archive, 'unreviewed': self.archive})

    def test_two_archives_cannot_claim_the_same_staged_path(self):
        other = TOOL_PATH._replace(package='example-other', member_path='usr/bin/example-other')
        with patch.object(reader, 'read_pinned_debian_payload') as read:
            with self.assertRaisesRegex(ValueError, 'colliding staged path'):
                self.verify(paths=(TOOL_PATH, other))
            read.assert_not_called()

    def test_staged_aliases_cannot_change_source_target_or_cross_scope(self):
        for link in ('/usr/bin/example-tool', 'example-other', '../../outside', 'example-alias'):
            with self.subTest(link=link), self.assertRaisesRegex(ValueError, 'staged alias'):
                self.verify(rows=(self.rows[0], self.rows[1]._replace(staged_link=link)))
        path = ALIAS_PATH._replace(staged_path='toolchain/runtime/example-alias')
        with self.assertRaisesRegex(ValueError, 'staged alias'):
            self.verify(paths=(TOOL_PATH, path),
                        rows=(self.rows[0], self.rows[1]._replace(mapping=path, staged_link='../bin/example-tool')))

    def test_staged_alias_cycle_is_rejected(self):
        archive = deb(tar(((TOOL, tarfile.SYMTYPE, 0o777, 'example-alias'), ENTRIES[2])))
        archive_pin = pin(archive)
        rows = (self.rows[0]._replace(archive=archive_pin, staged_link='example-alias',
                                     member=reader.PayloadMember(TOOL, 0o777, 0, None, 'example-alias')),
                self.rows[1]._replace(archive=archive_pin))
        with self.assertRaisesRegex(ValueError, 'Cyclic'):
            reader.verify_staging_projection(self.paths, {'example-tool': archive_pin}, rows, {'example-tool': archive})

    def test_source_allowlist_matches_the_candidate_paths_without_promoting_archive_observations(self):
        proposals = ROOT / 'docs/proposals'
        allowlist = json.loads((proposals / 'm4-linux-arm64-holder-staging-allowlist-v1.json').read_bytes())
        self.assertEqual(allowlist['source_revision'], '8be38e46aee9d68222956d88c930e98f78482538')
        inputs = allowlist['input_sha256']
        for basename, digest in inputs.items():
            self.assertEqual(sha256((proposals / basename).read_bytes()).hexdigest(), digest)
        original = json.loads((proposals / 'm4-linux-arm64-holder-toolchain-candidate-v1.json').read_bytes())
        dependency = json.loads((proposals / 'm4-linux-arm64-holder-debian-dependency-candidate-v1.json').read_bytes())
        paths = [reader.StagingPath(**row) for row in allowlist['paths']]
        self.assertEqual([list(row) for row in paths], original['stage_candidates'])
        archives = {p['Package']: reader.ArchivePin(p['Package'], p['Version'], p['Architecture'], p['archive'],
                    p['Filename'], int(p['Size']), bytes.fromhex(p['SHA256'])) for p in dependency['packages']}
        self.assertEqual(allowlist['archive_pin_count'], len(archives))
        self.assertTrue(all(reader._valid_pin(pin) for pin in archives.values()))
        self.assertTrue(all(row.package in archives for row in paths))
        self.assertEqual(allowlist['status'], 'STAGING_PATHS_ONLY_HOLD')
        for field in ('reviewed_member_pins', 'runtime_extension', 'staged_inventory',
                      'approved_toolchain_lock', 'artifact_receipt'):
            self.assertIsNone(allowlist[field])
        for field in ('materialization_authorized', 'build_authorized', 'launch_authorized', 'runtime_eligible'):
            self.assertIs(allowlist[field], False)
        self.assertEqual(allowlist['qualifying_native_amd64_builder_receipts_added'], 0)


class HolderLinkerTargetTests(unittest.TestCase):
    def setUp(self):
        proposals = ROOT / 'docs/proposals'
        self.v1_raw = (proposals / 'm4-linux-arm64-holder-staging-allowlist-v1.json').read_bytes()
        self.v1 = json.loads(self.v1_raw)
        self.v2 = json.loads((proposals / 'm4-linux-arm64-holder-staging-allowlist-v2.json').read_bytes())
        self.observation_raw = (proposals / 'm4-linux-arm64-holder-staging-member-observation-v1.json').read_bytes()
        self.observation = json.loads(self.observation_raw)

    def test_record_matches_v1_and_preserves_every_authority_hold(self):
        observation = self.observation
        self.assertEqual(observation['status'], 'MEMBERS_MEASURED_SOURCE_ONLY_HOLD')
        self.assertEqual(observation['source_revision'], '37526b9fad1750fba2de9099bd2f84f6da624ecc')
        self.assertEqual(observation['staging_allowlist_sha256'], sha256(self.v1_raw).hexdigest())
        self.assertEqual(observation['archive_reader_sha256'],
                         sha256((ROOT / 'tools/local-coordination-pilot' / NAME).read_bytes()).hexdigest())
        dependency = 'm4-linux-arm64-holder-debian-dependency-candidate-v1.json'
        self.assertEqual(observation['dependency_candidate_sha256'], self.v1['input_sha256'][dependency])
        self.assertEqual(observation['raw_receipt_sha256'],
                         '0523a68bd96ea75b84f37d8eee8ffb3577a1a2472c3f87aee927f958d9548b0d')
        self.assertEqual(observation['observed_member_rows_sha256'],
                         'f4056c37c9f764ce6a49734e949e25d09cfc4d20c0a62b3b26b6db2298631dc5')
        self.assertEqual(observation['verified_package_archives'], 7)
        self.assertEqual(observation['verified_package_archive_bytes'], 37227976)
        self.assertEqual(observation['measured_members'], len(self.v1['paths']))
        self.assertEqual(observation['measured_member_counts'], {'FILE': 10, 'SYMLINK': 1})
        self.assertEqual(observation['observed_link'], {
            'package': 'binutils-aarch64-linux-gnu', 'member_path': 'usr/bin/aarch64-linux-gnu-ld',
            'staged_path': 'toolchain/bin/ld', 'kind': 'SYMLINK', 'size_bytes': 0,
            'mode_octal': '0777', 'sha256': None, 'link_target': 'aarch64-linux-gnu-ld.bfd',
        })
        for field in ('package_archives_saved', 'payload_files_saved', 'native_staging_observed',
                      'materialization_authorized', 'build_authorized', 'launch_authorized', 'runtime_eligible'):
            self.assertIs(observation[field], False)
        for field in ('approved_toolchain_lock', 'artifact_receipt'):
            self.assertIsNone(observation[field])
        self.assertEqual(observation['qualifying_native_amd64_builder_receipts_added'], 0)

    def test_v2_adds_only_the_observed_linkers_exact_same_package_target(self):
        original = self.v1
        v2 = self.v2
        link = self.observation['observed_link']
        self.assertEqual(v2['schema_version'], 2)
        self.assertEqual(v2['source_revision'], self.observation['source_revision'])
        self.assertEqual(v2['predecessor_sha256'], sha256(self.v1_raw).hexdigest())
        self.assertEqual(v2['member_observation_sha256'], sha256(self.observation_raw).hexdigest())
        self.assertEqual(v2['paths'][:-1], original['paths'])
        self.assertEqual(v2['paths'][-1], {
            'package': 'binutils-aarch64-linux-gnu',
            'member_path': 'usr/bin/aarch64-linux-gnu-ld.bfd',
            'staged_path': 'toolchain/bin/aarch64-linux-gnu-ld.bfd',
        })
        self.assertEqual(v2['required_link'], {
            'package': link['package'], 'member_path': link['member_path'], 'staged_path': link['staged_path'],
            'relative_target': link['link_target'],
        })
        self.assertEqual(str(PurePosixPath(link['member_path']).with_name(link['link_target'])),
                         v2['paths'][-1]['member_path'])
        self.assertEqual(str(PurePosixPath(link['staged_path']).with_name(link['link_target'])),
                         v2['paths'][-1]['staged_path'])
        for field in ('input_sha256', 'archive_pin_count', 'status', 'reviewed_member_pins', 'runtime_extension',
                      'staged_inventory', 'approved_toolchain_lock', 'artifact_receipt',
                      'materialization_authorized', 'build_authorized', 'launch_authorized', 'runtime_eligible',
                      'qualifying_native_amd64_builder_receipts_added'):
            self.assertEqual(v2[field], original[field])

    def test_projection_requires_the_exact_linker_target_and_rejects_redirection(self):
        link = self.v2['required_link']
        alias = reader.StagingPath(link['package'], link['member_path'], link['staged_path'])
        target = reader.StagingPath(**self.v2['paths'][-1])
        relative_target = link['relative_target']
        archive = deb(tar(((alias.member_path, tarfile.SYMTYPE, 0o777, relative_target),
                           (target.member_path, tarfile.REGTYPE, 0o755, BODY))))
        archive_pin = pin(archive, alias.package)
        pins, archives = {alias.package: archive_pin}, {alias.package: archive}
        measured = reader.read_pinned_debian_payload(archive, archive_pin, (alias.member_path, target.member_path))
        alias_pin = reader.StagingMemberPin(alias, archive_pin, measured[alias.member_path], relative_target)
        target_pin = reader.StagingMemberPin(target, archive_pin, measured[target.member_path], None)
        accepted = reader.verify_staging_projection((alias, target), pins, (alias_pin, target_pin), archives)
        self.assertEqual(accepted.status, 'SOURCE_ONLY_HOLD')
        with self.assertRaisesRegex(ValueError, 'Unresolved or escaping staged alias'):
            reader.verify_staging_projection((alias,), pins, (alias_pin,), archives)
        renamed = target._replace(staged_path='toolchain/bin/other-linker')
        with self.assertRaisesRegex(ValueError, 'Unresolved or escaping staged alias'):
            reader.verify_staging_projection((alias, renamed), pins,
                                             (alias_pin, target_pin._replace(mapping=renamed)), archives)
        with self.assertRaisesRegex(ValueError, 'differ from review'):
            wrong = alias_pin._replace(member=alias_pin.member._replace(link='other-linker'))
            reader.verify_staging_projection((alias, target), pins, (wrong, target_pin), archives)


if __name__ == '__main__':
    unittest.main()
