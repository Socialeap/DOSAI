"""Exercise the pinned-handle collector without opening any native handles."""

from hashlib import sha256
import importlib.util
import json
from pathlib import Path, PurePosixPath
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-staging-readback.py'
SPEC = importlib.util.spec_from_file_location('readback', SOURCE)
readback = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(readback)

ROOT_PATH = 'toolchain'
LINKER = ROOT_PATH + '/bin/aarch64-linux-gnu-ld.bfd'
LINKER_ALIAS = ROOT_PATH + '/bin/ld'
LOADER = ROOT_PATH + '/runtime/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1'
LOADER_ALIAS = ROOT_PATH + '/runtime/lib/ld-linux-aarch64.so.1'
CONTENTS = {LINKER: b'l' * 65539, LOADER: b'loader fixture'}
ALIASES = {LINKER_ALIAS: 'aarch64-linux-gnu-ld.bfd', LOADER_ALIAS: '../usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1'}
DIRECTORIES = {str(parent) for path in (*CONTENTS, *ALIASES) for parent in PurePosixPath(path).parents} - {'.'}
PLAN = json.dumps({
    'manifest_sha256': '1' * 64, 'recipe_sha256': '2' * 64, 'directory_mode_octal': '0755',
    'entries': [
        {'staged_path': path, 'kind': 'FILE', 'mode_octal': '0755', 'size_bytes': len(body),
         'sha256': sha256(body).hexdigest(), 'link_target': None} for path, body in CONTENTS.items()
    ] + [
        {'staged_path': path, 'kind': 'SYMLINK', 'mode_octal': '0777', 'size_bytes': 0,
         'sha256': None, 'link_target': target} for path, target in ALIASES.items()
    ],
}).encode('ascii')
REQUIRED_FIELDS = frozenset((
    'STATX_TYPE', 'STATX_MODE', 'STATX_SIZE', 'STATX_MNT_ID_UNIQUE', 'STATX_INO', 'STATX_NLINK', 'STATX_CTIME',
))
SEAL = readback.FixtureStagingSeal(b'w' * 32, 31, 100, 8, True)
READER = b'r' * 32
ROOT_HANDLE = 5


class PinnedFixture:
    def __init__(self):
        self.stats = {}
        for inode, path in enumerate(sorted(DIRECTORIES | set(CONTENTS) | set(ALIASES)), SEAL.root_inode):
            if path in DIRECTORIES:
                kind, mode, size, links = 'DIRECTORY', 0o755, 4096, 2
            elif path in CONTENTS:
                kind, mode, size, links = 'FILE', 0o755, len(CONTENTS[path]), 1
            else:
                kind, mode, size, links = 'SYMLINK', 0o777, len(ALIASES[path]), 1
            self.stats[path] = readback.PinnedStagingStat(
                REQUIRED_FIELDS, kind, mode, size, SEAL.mount_id, inode, links, 70,
            )
        self.handles = {ROOT_HANDLE: ROOT_PATH}
        self.next_handle = ROOT_HANDLE + 1
        self.time = 1
        self.events = []

    def observe_seal(self, handle):
        self.events.append(('seal', self.handles[handle]))
        return SEAL

    def open_child(self, handle, name, flags, resolution):
        path = self.handles[handle] + '/' + name
        self.events.append(('open', path, name, flags, resolution))
        if path not in self.stats:
            raise FileNotFoundError(path)
        child = self.next_handle
        self.next_handle += 1
        self.handles[child] = path
        return child

    def stat_handle(self, handle, flags, fields):
        if flags != ('AT_EMPTY_PATH', 'AT_SYMLINK_NOFOLLOW') or fields != REQUIRED_FIELDS:
            raise ValueError('Unexpected handle stat contract.')
        path = self.handles[handle]
        self.events.append(('stat', path))
        return self.stats[path]

    def list_children(self, handle, limit):
        path = self.handles[handle]
        self.events.append(('list', path, limit))
        names = tuple(sorted((name for item in self.stats for parent, _, name in (item.rpartition('/'),)
                              if parent == path), reverse=True))
        return readback.PinnedDirectoryEntries(names[:limit], len(names) < limit)

    def read_file_at(self, handle, offset, count):
        path = self.handles[handle]
        self.events.append(('read', path, offset, count))
        return CONTENTS[path][offset:offset + count]

    def read_link(self, handle, count):
        path = self.handles[handle]
        self.events.append(('link', path, count))
        return ALIASES[path].encode('ascii')[:count]

    def close_handle(self, handle):
        self.events.append(('close', self.handles.pop(handle)))

    def monotonic_ns(self):
        self.time += 1
        return self.time

    def ops(self, **overrides):
        return readback.FixturePinnedReadbackPrimitives(
            self.observe_seal, self.open_child, self.stat_handle, self.list_children,
            self.read_file_at, self.read_link, self.close_handle, self.monotonic_ns,
        )._replace(**overrides)


class HolderPinnedReadbackTests(unittest.TestCase):
    def collect(self, tree, *, plan=PLAN, deadline=10_000, **ops):
        with patch.object(readback, 'PLAN_SHA256', sha256(PLAN).digest()):
            result = readback.collect_fixture_holder_staging_readback(
                plan, ROOT_HANDLE, SEAL, READER, tree.ops(**ops), deadline_ns=deadline,
            )
        self.assertEqual(tree.handles, {ROOT_HANDLE: ROOT_PATH})
        return result

    def test_collects_two_complete_readbacks_using_only_checked_single_components(self):
        tree = PinnedFixture()
        result = self.collect(tree)
        self.assertIsNotNone(result)
        self.assertEqual(result.status, 'SOURCE_ONLY_HOLD')
        self.assertEqual({path for path, _ in result.entries}, DIRECTORIES | set(CONTENTS) | set(ALIASES))
        opened = [event for event in tree.events if event[0] == 'open']
        self.assertEqual(len(opened), 2 * (len(tree.stats) - 1))
        for _, path, name, flags, resolution in opened:
            self.assertEqual(name, path.rsplit('/', 1)[-1])
            self.assertNotIn(name, ('', '.', '..'))
            self.assertEqual(flags, ('O_PATH', 'O_NOFOLLOW', 'O_CLOEXEC'))
            self.assertEqual(resolution, ('RESOLVE_BENEATH', 'RESOLVE_NO_SYMLINKS',
                                          'RESOLVE_NO_MAGICLINKS', 'RESOLVE_NO_XDEV'))
        self.assertEqual([event for event in tree.events if event[:2] == ('read', LINKER)], [
            ('read', LINKER, 0, 65536), ('read', LINKER, 65536, 3), ('read', LINKER, 65539, 1),
        ] * 2)
        self.assertEqual([event[1] for event in tree.events if event[0] == 'link'],
                         [LINKER_ALIAS, LOADER_ALIAS] * 2)
        self.assertEqual([event for event in tree.events if event[0] == 'seal'], [('seal', ROOT_PATH)] * 4)
        self.assertEqual(sorted(event[1] for event in opened),
                         sorted(event[1] for event in tree.events if event[0] == 'close'))

    def test_rejects_wrong_plan_root_or_seal_before_enumeration(self):
        tree = PinnedFixture()
        self.assertIsNone(self.collect(tree, plan=PLAN + b' '))
        self.assertEqual(tree.events, [])
        for change in ({'mount_id': 32}, {'inode': 900}, {'kind': 'SYMLINK'}):
            with self.subTest(change=change):
                tree = PinnedFixture()
                tree.stats[ROOT_PATH] = tree.stats[ROOT_PATH]._replace(**change)
                self.assertIsNone(self.collect(tree))
                self.assertEqual(tree.events, [('seal', ROOT_PATH), ('stat', ROOT_PATH)])
        self.assertIsNone(self.collect(PinnedFixture(), observe_seal=lambda _: SEAL._replace(write_fenced=False)))

    def test_unknown_names_duplicates_and_partial_listings_stop_before_child_open(self):
        for names, eof in (
            (('bin', 'runtime'), False), (('bin', '../runtime'), True),
            (('bin', '/runtime'), True), (('bin', 'bin'), True),
            (('bin',), True), (('bin', 'runtime', '.hidden'), True),
            (('bin', b'runtime'), True), (('bin', 'runtime'), 1),
        ):
            with self.subTest(names=names, eof=eof):
                tree = PinnedFixture()
                self.assertIsNone(self.collect(tree, list_children=lambda *_: readback.PinnedDirectoryEntries(names, eof)))
                self.assertFalse(any(event[0] == 'open' for event in tree.events))

    def test_unexpected_type_mount_and_hard_links_stop_before_read(self):
        for path, change in (
            (ROOT_PATH + '/bin', {'kind': 'SYMLINK'}), (LINKER, {'kind': 'DEVICE'}),
            (LINKER, {'mount_id': 32}), (LINKER, {'mount_id': None}),
            (LINKER, {'returned_fields': REQUIRED_FIELDS - {'STATX_MNT_ID_UNIQUE'} | {'STATX_MNT_ID'}}),
            (LINKER, {'link_count': 2}), (LINKER, {'size': 65540}), (LINKER, {'mode': 0o4755}),
        ):
            with self.subTest(path=path, change=change):
                tree = PinnedFixture()
                tree.stats[path] = tree.stats[path]._replace(**change)
                self.assertIsNone(self.collect(tree))
                self.assertFalse(any(event[0] == 'read' for event in tree.events))

    def test_exact_content_eof_and_alias_bytes(self):
        for read in (
            lambda *_: b'',
            lambda _, offset, count: b'x' * count if offset < 65539 else b'',
            lambda _, offset, count: b'l' * count,
            lambda _, offset, count: b'l' * (count + 1),
        ):
            self.assertIsNone(self.collect(PinnedFixture(), read_file_at=read))
        for target in (b'/usr/bin/ld.bfd', b'../outside', b'aarch64-linux-gnu-ld.bfd\0'):
            with self.subTest(target=target):
                tree = PinnedFixture()
                self.assertIsNone(self.collect(tree, read_link=lambda *_: target))
                self.assertEqual([event[1] for event in tree.events if event[0] == 'open'],
                                 [ROOT_PATH + '/bin', LINKER, LINKER_ALIAS])

    def test_namespace_changes_during_or_between_censuses_withhold_evidence(self):
        tree = PinnedFixture()

        def change_during_read(handle, offset, count):
            tree.stats[LINKER] = tree.stats[LINKER]._replace(change_time_ns=71)
            return tree.read_file_at(handle, offset, count)

        self.assertIsNone(self.collect(tree, read_file_at=change_during_read))
        for updates in ({'inode': 900}, {'change_time_ns': 71}):
            with self.subTest(updates=updates):
                tree = PinnedFixture()

                def check_seal(handle):
                    if tree.events.count(('seal', ROOT_PATH)) == 2:
                        tree.stats[LINKER] = tree.stats[LINKER]._replace(**updates)
                    return tree.observe_seal(handle)

                self.assertIsNone(self.collect(tree, observe_seal=check_seal))
        tree = PinnedFixture()

        def changed_seal(handle):
            earlier = tree.events.count(('seal', ROOT_PATH))
            tree.observe_seal(handle)
            return SEAL if not earlier else SEAL._replace(generation=9)

        self.assertIsNone(self.collect(tree, observe_seal=changed_seal))

    def test_directory_end_listing_detects_new_entry_after_read(self):
        tree = PinnedFixture()

        def change_listing(handle, limit):
            listing = tree.list_children(handle, limit)
            if tree.events.count(('list', ROOT_PATH + '/bin', 3)) == 2 and tree.handles[handle] == ROOT_PATH + '/bin':
                return listing._replace(names=listing.names + ('unexpected',))
            return listing

        self.assertIsNone(self.collect(tree, list_children=change_listing))

    def test_denied_open_or_borrowed_handle_collision_never_triggers_path_fallback(self):
        tree = PinnedFixture()
        self.assertIsNone(self.collect(tree, open_child=lambda *_: ROOT_HANDLE))
        self.assertEqual([event for event in tree.events if event[0] == 'close'], [])
        tree = PinnedFixture()

        def denied(parent, name, *policy):
            tree.events.append(('denied', parent, name, policy))
            raise PermissionError('Unconfirmed openat2 resolution.')

        self.assertIsNone(self.collect(tree, open_child=denied))
        self.assertEqual(len([event for event in tree.events if event[0] == 'denied']), 1)

    def test_a_descriptor_number_can_be_reused_after_confirmed_close(self):
        tree = PinnedFixture()

        def reuse_handle(*args):
            tree.next_handle = max(tree.handles) + 1
            return tree.open_child(*args)

        self.assertEqual(self.collect(tree, open_child=reuse_handle).status, 'SOURCE_ONLY_HOLD')

    def test_deadline_and_close_errors_discard_results_and_still_unwind_handles(self):
        tree = PinnedFixture()

        def expires_after_open(*args):
            handle = tree.open_child(*args)
            tree.time = 100
            return handle

        self.assertIsNone(self.collect(tree, open_child=expires_after_open, deadline=100))
        self.assertIn(('close', ROOT_PATH + '/bin'), tree.events)
        self.assertNotIn(('stat', ROOT_PATH + '/bin'), tree.events)
        tree = PinnedFixture()

        def close_with_error(handle):
            failed = tree.handles[handle] == LINKER
            tree.close_handle(handle)
            if failed:
                raise OSError('Close status uncertain.')

        self.assertIsNone(self.collect(tree, close_handle=close_with_error))
        self.assertIn(('close', ROOT_PATH + '/bin'), tree.events)
        clock = iter((8, 7))
        self.assertIsNone(self.collect(PinnedFixture(), monotonic_ns=lambda: next(clock)))


if __name__ == '__main__':
    unittest.main()
