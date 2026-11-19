"""Inactive Linux ARM64 probe metadata collectors. No entry point or runtime wiring."""

import os
import re
import stat
from threading import get_native_id
from typing import NamedTuple


MAX_STATUS = 32_768
MAX_MOUNTS = 262_144
MAX_INTERFACES = 16_384
MAX_TASK_STAT = 4_096
PROC_THREAD = '/proc/thread-self'
SHARING_TYPES = frozenset((b'9p', b'virtiofs', b'nfs', b'nfs4', b'cifs', b'smb3', b'fuse', b'fuseblk'))
RESTRICTIONS = (b'CapInh', b'CapPrm', b'CapEff', b'CapBnd', b'CapAmb')


class ProbeIdentity(NamedTuple):
    task_id: int
    start_ticks: int
    mount_namespace: str
    network_namespace: str
    user_namespace: str


def _require(condition):
    if not condition:
        raise ValueError('Invalid guest metadata.')


def _positive_integer(value, maximum):
    return type(value) is int and 0 < value <= maximum


def _valid_identity(identity):
    return (type(identity) is ProbeIdentity
            and _positive_integer(identity.task_id, 2**31 - 1)
            and _positive_integer(identity.start_ticks, 2**64 - 1)
            and all(type(link) is str and re.fullmatch(kind + r':\[[1-9][0-9]{0,19}\]', link)
                    for kind, link in zip(('mnt', 'net', 'user'), identity[2:])))


def _lines(raw, limit):
    _require(type(raw) is bytes and 0 < len(raw) <= limit and raw.endswith(b'\n'))
    return raw[:-1].split(b'\n')


def _task_start_ticks(raw, task_id):
    _require(type(raw) is bytes and 0 < len(raw) <= MAX_TASK_STAT and raw.endswith(b'\n'))
    pid, start, command_and_fields = raw.partition(b' (')
    command, end, fields = command_and_fields.rpartition(b') ')
    values = fields.split()
    _require(start and end and command and pid == str(task_id).encode('ascii')
             and len(values) >= 20 and re.fullmatch(rb'[A-Za-z]', values[0])
             and re.fullmatch(rb'[1-9][0-9]{0,19}', values[19]))
    return int(values[19])


def _credential_projection(raw, task_id, uid, gid):
    required = {b'Pid', b'Uid', b'Gid', b'Groups', b'NoNewPrivs', b'Seccomp', *RESTRICTIONS}
    fields = {}
    for line in _lines(raw, MAX_STATUS):
        name, separator, value = line.partition(b':')
        if name in required:
            _require(separator and name not in fields)
            fields[name] = value.split()
    _require(fields.keys() == required and fields[b'Pid'] == [str(task_id).encode('ascii')])
    for name in (b'Uid', b'Gid', b'Groups'):
        values = fields[name]
        _require((name == b'Groups' or len(values) == 4)
                 and all(re.fullmatch(rb'[0-9]{1,10}', value) for value in values))
    _require(all(len(fields[name]) == 1 and re.fullmatch(rb'[0-9a-f]{16}', fields[name][0])
                 for name in RESTRICTIONS))
    _require(fields[b'NoNewPrivs'] in ([b'0'], [b'1']) and fields[b'Seccomp'] in ([b'0'], [b'1'], [b'2']))

    reviewed_uid = str(uid).encode('ascii')
    reviewed_gid = str(gid).encode('ascii')
    matches = (fields[b'Uid'] == [reviewed_uid] * 4 and fields[b'Gid'] == [reviewed_gid] * 4
               and fields[b'Groups'] in ([], [reviewed_gid])
               and all(fields[name] == [b'0' * 16] for name in RESTRICTIONS)
               and fields[b'NoNewPrivs'] == [b'1'] and fields[b'Seccomp'] == [b'2'])
    return 'REVIEWED_RESTRICTION_FLAGS_OBSERVED' if matches else 'UNEXPECTED_RESTRICTION_FLAGS'


def _mount_projection(raw):
    lines = _lines(raw, MAX_MOUNTS)
    _require(len(lines) <= 2048)
    seen = set()
    roots = 0
    sharing_or_subtree = False
    for line in lines:
        _require(all(32 <= value <= 126 for value in line) and line.count(b' - ') == 1)
        before, _, after = line.partition(b' - ')
        fields, tail = before.split(b' '), after.split(b' ')
        _require(len(fields) >= 6 and len(tail) == 3 and all(fields) and all(tail))
        mount_id, parent_id, dev, root, point, *_ = fields
        _require(all(re.fullmatch(rb'[1-9][0-9]{0,19}', value) for value in (mount_id, parent_id))
                 and mount_id not in seen and re.fullmatch(rb'[0-9]{1,10}:[0-9]{1,10}', dev))
        _require(all(value.startswith(b'/') and not re.search(rb'\\(?!040|011|012|134)', value)
                     for value in (root, point)))
        for options in (fields[5], tail[2]):
            access = options.split(b',')
            _require((b'ro' in access) != (b'rw' in access))
        kind = tail[0]
        _require(re.fullmatch(rb'[a-zA-Z0-9_.-]{1,64}', kind))
        seen.add(mount_id)
        roots += point == b'/'
        sharing_or_subtree |= (kind in SHARING_TYPES or kind.startswith(b'fuse.') or root != b'/')
    _require(roots > 0)
    return ('MOUNT_REVIEW_INDICATOR_OBSERVED' if sharing_or_subtree or roots > 1
            else 'NO_LISTED_MOUNT_REVIEW_INDICATOR_OBSERVED')


def _interface_projection(raw):
    lines = _lines(raw, MAX_INTERFACES)
    _require(3 <= len(lines) <= 130)
    _require([field.strip() for field in lines[0].split(b'|')] == [b'Inter-', b'Receive', b'Transmit'])
    _require([field.split() for field in lines[1].split(b'|')] == [
        [b'face'],
        b'bytes packets errs drop fifo frame compressed multicast'.split(),
        b'bytes packets errs drop fifo colls carrier compressed'.split(),
    ])
    names = set()
    for line in lines[2:]:
        name, separator, values = line.partition(b':')
        name = name.strip()
        counters = values.split()
        _require(separator and re.fullmatch(rb'[a-zA-Z0-9_.-]{1,15}', name) and name not in names
                 and len(counters) == 16 and all(re.fullmatch(rb'[0-9]{1,20}', value) for value in counters))
        names.add(name)
    return 'ONLY_LO_NAME_OBSERVED' if names == {b'lo'} else 'OTHER_INTERFACE_NAME_OBSERVED'


def _read_proc_file(relative, limit):
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
    path = f'{PROC_THREAD}/{relative}'
    with open(path, 'rb', opener=lambda name, _: os.open(name, flags)) as source:
        _require(stat.S_ISREG(os.fstat(source.fileno()).st_mode))
        data = source.read(limit + 1)
    _require(len(data) <= limit)
    return data


class LinuxArm64GuestMetadata:
    """Read the calling task's fixed proc views inside a separately reviewed guest."""

    def __init__(self):
        platform = os.uname()
        if (platform.sysname, platform.machine) != ('Linux', 'aarch64'):
            raise OSError('Linux ARM64 is required.')

    def identity(self):
        task_id = get_native_id()
        ticks = _task_start_ticks(_read_proc_file('stat', MAX_TASK_STAT), task_id)
        namespaces = (os.readlink(f'{PROC_THREAD}/ns/{kind}') for kind in ('mnt', 'net', 'user'))
        return ProbeIdentity(task_id, ticks, *namespaces)

    def status(self):
        return _read_proc_file('status', MAX_STATUS)

    def mountinfo(self):
        return _read_proc_file('mountinfo', MAX_MOUNTS)

    def interfaces(self):
        return _read_proc_file('net/dev', MAX_INTERFACES)


def _report(reason, credentials='UNAVAILABLE', mounts='UNAVAILABLE', interfaces='UNAVAILABLE'):
    return {
        'schema': 'DOSAI_LINUX_ARM64_GUEST_METADATA_V1',
        'status': 'HOLD',
        'scope': 'SOURCE_ONLY',
        'reason': reason,
        'credentials': credentials,
        'mounts': mounts,
        'interfaces': interfaces,
        'hostShareExclusionVerified': False,
        'loopbackDenialVerified': False,
        'egressDenialVerified': False,
        'subprocessDenialVerified': False,
        'hostQualified': False,
        'provisioningAuthorized': False,
        'hostMutationAuthorized': False,
        'guestExecutionAuthorized': False,
        'signInAuthorized': False,
        'modelRequestsAuthorized': False,
        'bridgeActivationAuthorized': False,
        'liveLaunchPermitted': False,
        'qualifyingBuilderReceiptsAdded': 0,
    }


def collect_guest_isolation(source, expected, uid, gid):
    """Project metadata only if the reviewed probe identity brackets collection."""
    if not (_valid_identity(expected) and all(_positive_integer(item, 2**32 - 2) for item in (uid, gid))):
        return _report('REVIEWED_PROBE_IDENTITY_REQUIRED')
    try:
        before = source.identity()
        if not _valid_identity(before) or before != expected:
            return _report('PROBE_IDENTITY_MISMATCH')
        credentials = _credential_projection(source.status(), before.task_id, uid, gid)
        mounts = _mount_projection(source.mountinfo())
        interfaces = _interface_projection(source.interfaces())
        after = source.identity()
        if not _valid_identity(after) or after != before:
            return _report('PROBE_IDENTITY_CHANGED')
    except (OSError, ValueError):
        return _report('PROBE_METADATA_UNAVAILABLE')
    return _report('METADATA_ONLY', credentials, mounts, interfaces)
