"""Read-only topology attribution only; never native qualification or writer proof."""
import json
import os
import platform
import re
import signal
import sys

TARGET = '/proc/sys/fs/binfmt_misc'
MAX_BYTES = 262144
MAX_ROWS = 2048
MAX_PROJECTED = 32
FAILURE = 'DOSAI_TOPOLOGY_DIAGNOSTIC_REJECTED_V1'


def require(value):
    if not value:
        raise ValueError(FAILURE)


def project(data, mount_namespace, user_namespace):
    require(type(data) is bytes and 0 < len(data) <= MAX_BYTES)
    text = data.decode('ascii', errors='strict')
    require(all(c == '\n' or 32 <= ord(c) <= 126 for c in text))
    lines = text.splitlines()
    require(0 < len(lines) <= MAX_ROWS)
    for value, prefix in [(mount_namespace, 'mnt'), (user_namespace, 'user')]:
        require(type(value) is str and re.fullmatch(prefix + r':\[[1-9][0-9]{0,19}\]', value))
    rows = []
    ids = set()
    target_count = submount_count = 0
    for line in lines:
        require(line.count(' - ') == 1)
        left, right = line.split(' - ')
        fields, tail = left.split(' '), right.split(' ')
        require(len(fields) >= 6 and len(tail) == 3 and all(fields) and all(tail))
        require(all(re.fullmatch(r'[1-9][0-9]{0,19}', value) for value in fields[:2]))
        require(re.fullmatch(r'[0-9]{1,10}:[0-9]{1,10}', fields[2]))
        require(fields[0] not in ids)
        ids.add(fields[0])
        # Validate kernel mountinfo escaping; never output arbitrary paths or roots.
        for path in fields[3:5]:
            require(path.startswith('/') and not re.search(r'\\(?!040|011|012|134)', path))
        mountpoint = fields[4]
        relation = ('TARGET' if mountpoint == TARGET else
                    'ANCESTOR' if mountpoint == '/' or TARGET.startswith(mountpoint + '/') else
                    'SUBMOUNT' if mountpoint.startswith(TARGET + '/') else None)
        if relation is None:
            continue
        target_count += relation == 'TARGET'
        submount_count += relation == 'SUBMOUNT'
        fs = tail[0] if tail[0] in ('autofs', 'binfmt_misc', 'proc', 'sysfs', 'tmpfs', 'overlay') else 'OTHER'
        options = fields[5].split(',')
        require(('ro' in options) != ('rw' in options))
        rows.append({'mount_id': fields[0], 'parent_id': fields[1], 'device': fields[2],
                     'relation': relation, 'filesystem': fs,
                     'root_class': 'FULL_ROOT' if fields[3] == '/' else 'OTHER_ROOT',
                     'access': 'READ_ONLY' if 'ro' in options else 'READ_WRITE'})
        require(len(rows) <= MAX_PROJECTED)
    return {'schema': 'DOSAI_MOUNT_TOPOLOGY_DIAGNOSTIC_V1',
            'diagnostic_only': True, 'provenance': 'UNAUTHENTICATED_HOST_OBSERVATION',
            'rows': rows, 'target_rows': target_count, 'submount_rows': submount_count,
            'mount_namespace': mount_namespace, 'user_namespace': user_namespace,
            'registry_entries': 'NOT_OBSERVED', 'docker_architecture': 'NOT_OBSERVED',
            'runtime_status': 'NO_GO', 'qualification_proven': False,
            'single_writer_exclusion_proven': False, 'execution_authorized': False,
            'builder_receipts': 0}


def collect(read_mountinfo, read_namespace, native_identity):
    require(native_identity() == ('Linux', 'x86_64'))
    before = (read_namespace('mnt'), read_namespace('user'))
    data = read_mountinfo()
    after = (read_namespace('mnt'), read_namespace('user'))
    require(before == after)
    return project(data, *before)


def bounded_mountinfo():
    fd = os.open('/proc/self/mountinfo', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        chunks, size = [], 0
        while True:
            chunk = os.read(fd, min(8192, MAX_BYTES + 1 - size))
            if not chunk:
                break
            chunks.append(chunk)
            size += len(chunk)
            require(size <= MAX_BYTES)
        return b''.join(chunks)
    finally:
        os.close(fd)


def main():
    try:
        require(len(sys.argv) == 1)
        def timeout(signum, frame):
            raise TimeoutError(FAILURE)
        signal.signal(signal.SIGALRM, timeout)
        signal.alarm(5)
        result = collect(bounded_mountinfo,
                         lambda name: os.readlink('/proc/self/ns/' + name),
                         lambda: (platform.system(), platform.machine()))
        output = json.dumps(result, separators=(',', ':'))
        require(len(output.encode('ascii')) <= 16384)
        print(output)
        return 0
    except Exception:
        print(FAILURE, file=sys.stderr)
        return 2
    finally:
        signal.alarm(0)


if __name__ == '__main__':
    sys.exit(main())
