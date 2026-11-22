"""Replay ARM64 readback ABI responses with no host syscalls or staged files."""

from hashlib import sha256
import importlib.util
from pathlib import Path
import struct
from types import SimpleNamespace
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    'fixture', Path(__file__).with_name('m4-linux-arm64-guest-isolation-canary-holder-pinned-readback-test.py'),
)
fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)
readback = fixture.readback
ROOT = fixture.ROOT_HANDLE
SEAL = fixture.SEAL
LINKER = fixture.LINKER
ALIAS = fixture.LINKER_ALIAS
STATX_FIELDS = 0x4387


def dirent(name, *, inode=100):
    length = (19 + len(name) + 1 + 7) & ~7
    return struct.pack('<QqHB', inode, 0, length, 0) + name.ljust(length - 19, b'\0')


class KernelFixture:
    def __init__(self):
        self.tree = fixture.PinnedFixture()
        self.handles = {ROOT: fixture.ROOT_PATH, 12: LINKER, 13: fixture.LOADER}
        self.next_fd = 20
        self.directory_positions = set()
        self.calls = []
        self.fd_flags = 0
        self.close_status = 0
        self.status_mask = STATX_FIELDS
        self.dir_bytes = None

    def __call__(self, number, fd, *args):
        self.calls.append((number, fd, *args))
        path = self.handles[fd]
        if number == 437:
            name, how, size = args
            flags = 0o2000000 | 0o100000 | (0o40000 if name == b'.' else 0o10000000)
            assert bytes(how) == struct.pack('<QQQ', flags, 0, 15) and size == 24
            target = path if name == b'.' else path + '/' + name.decode('ascii')
            assert target in self.tree.stats
            child = self.next_fd
            self.next_fd += 1
            self.handles[child] = target
            return child
        if number == 291:
            name, flags, mask, buffer = args
            assert name == b'' and flags == 0x1100 and mask == STATX_FIELDS and len(buffer) == 256
            info = self.tree.stats[path]
            struct.pack_into('<I', buffer, 0, self.status_mask)
            struct.pack_into('<I', buffer, 0x10, info.link_count)
            file_type = {'DIRECTORY': 0o40000, 'FILE': 0o100000, 'SYMLINK': 0o120000}[info.kind]
            struct.pack_into('<H', buffer, 0x1C, file_type | info.mode)
            struct.pack_into('<QQ', buffer, 0x20, info.inode, info.size)
            struct.pack_into('<qI', buffer, 0x60, 0, info.change_time_ns)
            struct.pack_into('<Q', buffer, 0x90, info.mount_id)
            return 0
        if number == 61:
            data, capacity = args
            assert capacity == len(data) == 4096
            if fd in self.directory_positions:
                return 0
            self.directory_positions.add(fd)
            if self.dir_bytes is None:
                names = [item.rsplit('/', 1)[-1].encode('ascii') for item in self.tree.stats
                         if item.rpartition('/')[0] == path]
                contents = b''.join(dirent(name) for name in (b'.', b'..', *names))
            else:
                contents = self.dir_bytes
            data[:len(contents)] = contents
            return len(contents)
        if number == 25:
            assert fd in (ROOT, 12, 13)
            command, = args
            return self.fd_flags if command == 3 else 1
        if number == 67:
            data, count, offset = args
            assert fd in (12, 13) and len(data) == count
            contents = fixture.CONTENTS[path][offset:offset + count]
            data[:len(contents)] = contents
            return len(contents)
        if number == 78:
            name, data, count = args
            assert name == b'' and len(data) == count
            contents = fixture.ALIASES[path].encode('ascii')
            data[:len(contents)] = contents
            return len(contents)
        if number == 57:
            assert fd not in (ROOT, 12, 13)
            del self.handles[fd]
            return self.close_status
        raise AssertionError('Unexpected ARM64 syscall')

    def ops(self, *, invoke=None, files=None):
        if files is None:
            files = tuple(readback.StagingReadableFile(self.tree.stats[self.handles[fd]].inode, fd)
                          for fd in (12, 13))
        return readback._arm64_readback_primitives(
            self if invoke is None else invoke, ROOT, SEAL, files, self.tree.observe_seal,
            self.tree.monotonic_ns, 10_000,
        )


class HolderReadbackSyscallTests(unittest.TestCase):
    def test_fixture_kernel_replays_the_collector_and_releases_only_owned_handles(self):
        kernel = KernelFixture()
        with patch.object(readback, 'PLAN_SHA256', sha256(fixture.PLAN).digest()):
            result = readback.collect_fixture_holder_staging_readback(
                fixture.PLAN, ROOT, SEAL, fixture.READER, kernel.ops(), deadline_ns=10_000,
            )
        self.assertIsNotNone(result)
        self.assertEqual(result.status, 'SOURCE_ONLY_HOLD')
        self.assertEqual(set(kernel.handles), {ROOT, 12, 13})
        self.assertEqual(len([call for call in kernel.calls if call[0] == 78]), 4)
        self.assertEqual([call[1] for call in kernel.calls if call[0] == 67], [12, 12, 12, 13, 13] * 2)

    def test_rejects_unsupported_identity_without_stat_or_open_fallback(self):
        kernel = KernelFixture()
        kernel.status_mask = (STATX_FIELDS & ~0x4000) | 0x1000
        with self.assertRaisesRegex(ValueError, 'omitted required fields'):
            kernel.ops().stat_handle(ROOT, readback.HANDLE_STAT_FLAGS, readback.REQUIRED_STAT_FIELDS)
        self.assertEqual([call[0] for call in kernel.calls], [291])
        kernel = KernelFixture()

        def denied(number, *args):
            if number == 437:
                kernel.calls.append((number, *args))
                return -1
            return kernel(number, *args)

        with self.assertRaises(OSError):
            kernel.ops(invoke=denied).open_child(ROOT, 'bin', readback.CHILD_OPEN_FLAGS, readback.CHILD_RESOLVE_FLAGS)
        self.assertEqual([call[0] for call in kernel.calls], [291, 437])

    def test_borrowed_regular_description_is_checked_before_read_and_never_reopened(self):
        for issue in ('missing', 'different', 'writable', 'opath'):
            with self.subTest(issue=issue):
                kernel = KernelFixture()
                inode = kernel.tree.stats[LINKER].inode
                files = () if issue == 'missing' else (readback.StagingReadableFile(inode, 13 if issue == 'different' else 12),)
                if issue == 'writable':
                    kernel.fd_flags = 2
                if issue == 'opath':
                    kernel.fd_flags = 0o10000000
                ops = kernel.ops(files=files)
                directory = ops.open_child(ROOT, 'bin', readback.CHILD_OPEN_FLAGS, readback.CHILD_RESOLVE_FLAGS)
                file = ops.open_child(directory, Path(LINKER).name, readback.CHILD_OPEN_FLAGS, readback.CHILD_RESOLVE_FLAGS)
                baseline = len(kernel.calls)
                with self.assertRaisesRegex(ValueError, 'readable handle|descriptor flags'):
                    ops.read_file_at(file, 0, 1)
                self.assertFalse(any(call[0] in (67, 437) for call in kernel.calls[baseline:]))
                ops.close_handle(file)
                ops.close_handle(directory)

    def test_directory_rejects_malformed_records_and_closes_its_stream(self):
        for payload in (b'bad record', dirent(b'../bin'), dirent(b'extra') * 2, dirent(b'')[:-1]):
            with self.subTest(payload=payload):
                kernel = KernelFixture()
                kernel.dir_bytes = payload
                with self.assertRaises(ValueError):
                    kernel.ops().list_children(ROOT, 3)
                self.assertEqual(kernel.calls[-1][0], 57)
                self.assertEqual(set(kernel.handles), {ROOT, 12, 13})

    def test_count_limit_reports_incomplete_directory_census(self):
        kernel = KernelFixture()
        listing = kernel.ops().list_children(ROOT, 1)
        self.assertEqual(len(listing.names), 1)
        self.assertIs(listing.eof, False)
        self.assertEqual(set(kernel.handles), {ROOT, 12, 13})

    def test_symlink_truncation_and_directory_identity_changes_fail_closed(self):
        kernel = KernelFixture()
        ops = kernel.ops()
        directory = ops.open_child(ROOT, 'bin', readback.CHILD_OPEN_FLAGS, readback.CHILD_RESOLVE_FLAGS)
        alias = ops.open_child(directory, Path(ALIAS).name, readback.CHILD_OPEN_FLAGS, readback.CHILD_RESOLVE_FLAGS)
        with self.assertRaises(ValueError):
            ops.read_link(alias, len(fixture.ALIASES[ALIAS]))
        ops.close_handle(alias)
        ops.close_handle(directory)
        kernel = KernelFixture()

        def swapped(number, *args):
            result = kernel(number, *args)
            if number == 437:
                kernel.handles[result] = fixture.ROOT_PATH + '/bin'
            return result

        with self.assertRaisesRegex(ValueError, 'identity changed'):
            kernel.ops(invoke=swapped).list_children(ROOT, 3)
        self.assertEqual(set(kernel.handles), {ROOT, 12, 13})
        self.assertFalse(any(call[0] == 61 for call in kernel.calls))

    def test_path_escape_and_borrowed_or_repeated_close_do_not_reach_kernel(self):
        kernel = KernelFixture()
        ops = kernel.ops()
        for name in ('..', 'bin/ld', '/bin', 'bin\0'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                ops.open_child(ROOT, name, readback.CHILD_OPEN_FLAGS, readback.CHILD_RESOLVE_FLAGS)
        self.assertFalse(any(call[0] == 437 for call in kernel.calls))
        for fd in (ROOT, 12, 13):
            with self.assertRaises(ValueError):
                ops.close_handle(fd)
        fd = ops.open_child(ROOT, 'bin', readback.CHILD_OPEN_FLAGS, readback.CHILD_RESOLVE_FLAGS)
        kernel.close_status = -1
        with self.assertRaises(OSError):
            ops.close_handle(fd)
        with self.assertRaises(ValueError):
            ops.close_handle(fd)
        self.assertEqual([call[1] for call in kernel.calls if call[0] == 57], [fd])

    def test_native_factory_checks_platform_before_loading_libc(self):
        with patch.object(readback.os, 'uname', return_value=SimpleNamespace(sysname='Darwin', machine='arm64')), \
                patch.object(readback.ctypes, 'CDLL') as libc:
            with self.assertRaises(OSError):
                readback._linux_arm64_readback_syscall()
            libc.assert_not_called()

    def test_native_factory_marshals_arm64_buffer_arguments_with_a_mock_syscall(self):
        raw = bytearray(256)
        kernel = KernelFixture()
        kernel(291, ROOT, b'', 0x1100, 0x4387, raw)
        calls = []

        def syscall(number, handle, path, flags, mask, buffer):
            calls.append((number, handle.value, path.value, flags.value, mask.value))
            readback.ctypes.memmove(buffer, bytes(raw), len(raw))
            return 0

        with patch.object(readback.os, 'uname', return_value=SimpleNamespace(sysname='Linux', machine='aarch64')), \
                patch.object(readback.ctypes, 'CDLL', return_value=SimpleNamespace(syscall=syscall)), \
                patch.object(readback, 'monotonic_ns', return_value=10):
            ops = readback._arm64_readback_primitives(
                readback._linux_arm64_readback_syscall(), ROOT, SEAL, (), lambda _: SEAL, readback.monotonic_ns, 100,
            )
            self.assertEqual(ops.stat_handle(ROOT, readback.HANDLE_STAT_FLAGS, readback.REQUIRED_STAT_FIELDS).inode,
                             SEAL.root_inode)
        self.assertEqual(calls, [(291, ROOT, b'', 0x1100, 0x4387)])


if __name__ == '__main__':
    unittest.main()
