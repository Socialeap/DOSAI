"""Source-only, read-only binfmt inventory. Not a host-admission verifier."""
import hashlib
import json
import os
import platform
import re
import signal
import stat
import sys
import time

PREFIX = 'DOSAI_BINFMT_DIAGNOSTIC_V1:'
MAX_ENTRIES = 32
MAX_BYTES = 4096
MAX_OUTPUT = 131072
ROOT_COMPONENTS = ('proc', 'sys', 'fs', 'binfmt_misc')


class Rejected(Exception):
    pass


def require(condition):
    if not condition:
        raise Rejected()


def deadline_check(deadline):
    require(time.monotonic() < deadline)


def open_root():
    """Traverse only fixed directory components, refusing links at every step."""
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in ROOT_COMPONENTS:
            next_fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                              dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def names_at(fd, deadline):
    names = []
    with os.scandir(fd) as entries:
        for entry in entries:
            deadline_check(deadline)
            require(len(names) < MAX_ENTRIES + 2)
            require(re.fullmatch(r'[A-Za-z0-9_+.-]{1,128}', entry.name) is not None)
            require(entry.name not in ('.', '..'))
            require(entry.is_file(follow_symlinks=False))
            names.append(entry.name)
    require('status' in names and 'register' in names)
    return sorted(names)


def read_entry(fd, name, deadline):
    deadline_check(deadline)
    child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
    try:
        before = os.fstat(child)
        require(stat.S_ISREG(before.st_mode))
        data = bytearray()
        while True:
            deadline_check(deadline)
            chunk = os.read(child, MAX_BYTES + 1 - len(data))
            if not chunk:
                break
            data.extend(chunk)
            require(len(data) <= MAX_BYTES)
        after = os.fstat(child)
        identity = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_mtime_ns, s.st_ctime_ns)
        require(identity(before) == identity(after))
        linked = os.stat(name, dir_fd=fd, follow_symlinks=False)
        require(identity(after) == identity(linked))
        return bytes(data), identity(after)
    finally:
        os.close(child)


def parse_entry(name, data):
    require(len(data) <= MAX_BYTES and data.endswith(b'\n'))
    text = data.decode('ascii', errors='strict')
    require(all(c == '\n' or 32 <= ord(c) <= 126 for c in text))
    lines = text.splitlines()
    require(3 <= len(lines) <= 6 and lines[0] in ('enabled', 'disabled'))
    fields = {}
    for line in lines[1:]:
        key, separator, value = line.partition(' ')
        require(separator == ' ' and key not in fields)
        fields[key] = value
    require('interpreter' in fields and 'flags:' in fields)
    require(re.fullmatch(r'/[A-Za-z0-9_+./-]{1,254}', fields['interpreter']) is not None)
    flags = fields['flags:']
    require(re.fullmatch(r'[POCF]*', flags) is not None and len(set(flags)) == len(flags))
    common = {'interpreter', 'flags:'}
    if 'extension' in fields:
        require(set(fields) == common | {'extension'})
        require(re.fullmatch(r'\.?[A-Za-z0-9_+-]{1,64}', fields['extension']) is not None)
    else:
        require(set(fields) in (common | {'offset', 'magic'}, common | {'offset', 'magic', 'mask'}))
        require(re.fullmatch(r'[0-9]{1,3}', fields['offset']) is not None)
        require(0 <= int(fields['offset']) < 128)
        for key in ('magic', 'mask'):
            if key in fields:
                require(re.fullmatch(r'(?:[0-9a-f]{2}){1,128}', fields[key]) is not None)
        require('mask' not in fields or len(fields['mask']) == len(fields['magic']))
    return {'name': name, 'enabled': lines[0] == 'enabled',
            'fields': fields, 'sha256': hashlib.sha256(data).hexdigest()}


def snapshot(fd, deadline):
    names = names_at(fd, deadline)
    records = {}
    for name in names:
        if name != 'register':  # Never read the registration control file.
            records[name] = read_entry(fd, name, deadline)
    require(names_at(fd, deadline) == names)
    require(records['status'][0] in (b'enabled\n', b'disabled\n'))
    return records


def collect(fd, deadline):
    before = snapshot(fd, deadline)
    after = snapshot(fd, deadline)
    require(before == after)
    entries = [parse_entry(name, data) for name, (data, _) in sorted(after.items())
               if name != 'status']
    require(len(entries) <= MAX_ENTRIES)
    return {'global_enabled': after['status'][0] == b'enabled\n', 'entries': entries}


def context():
    patterns = {
        'GITHUB_RUN_ID': r'[1-9][0-9]{0,31}',
        'GITHUB_RUN_ATTEMPT': r'[1-9][0-9]{0,15}',
        'GITHUB_JOB': r'builder_host_[ab]',
        'GITHUB_SHA': r'[0-9a-f]{40}',
        'ImageOS': r'[A-Za-z0-9._-]{1,64}',
        'ImageVersion': r'[A-Za-z0-9._-]{1,64}',
        'DOSAI_RUNNER_ENVIRONMENT': r'github-hosted',
        'DOSAI_RUNNER_OS': r'Linux',
        'DOSAI_RUNNER_ARCH': r'X64',
    }
    result = {}
    for key, pattern in patterns.items():
        value = os.environ.get(key, '')
        require(re.fullmatch(pattern, value) is not None)
        result[key] = value
    require(platform.system() == 'Linux' and platform.machine() == 'x86_64')
    result['uname_machine'] = 'x86_64'
    return result


def encode(inventory, provenance):
    result = {'schema': 'DOSAI_BINFMT_DIAGNOSTIC_V1', 'diagnostic_only': True,
              'provenance': provenance, 'inventory': inventory}
    output = PREFIX + json.dumps(result, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    require(len(output.encode('ascii')) + 1 <= MAX_OUTPUT)
    return output


def expired(_signum, _frame):
    raise Rejected()


def main():
    try:
        require(len(sys.argv) == 1)
        require(hasattr(signal, 'setitimer'))
        signal.signal(signal.SIGALRM, expired)
        signal.setitimer(signal.ITIMER_REAL, 2.0)
        provenance = context()
        fd = open_root()
        try:
            inventory = collect(fd, time.monotonic() + 1.5)
        finally:
            os.close(fd)
        print(encode(inventory, provenance), flush=True)
        return 0
    except Exception:
        # Never include raw input, exception details, environment or host identifiers.
        print('DOSAI_BINFMT_DIAGNOSTIC_FAILURE_V1:REJECTED', file=sys.stderr)
        return 2
    finally:
        if hasattr(signal, 'setitimer'):
            signal.setitimer(signal.ITIMER_REAL, 0)


if __name__ == '__main__':
    sys.exit(main())
