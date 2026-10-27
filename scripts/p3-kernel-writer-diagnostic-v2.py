"""Inactive attribution successor; same read-only checks and success schema as v1."""
import json
import os
import platform
import re
import select
import signal
import stat
import subprocess
import sys
import time

PREFIX = 'DOSAI_KERNEL_WRITER_DIAGNOSTIC_V1:'
MAX_QUERY_BYTES = 4096
MAX_OUTPUT_BYTES = 65536
UNITS = ('systemd-binfmt.service', 'binfmt-support.service',
         'proc-sys-fs-binfmt_misc.automount', 'proc-sys-fs-binfmt_misc.mount')
PROPERTIES = ('Id', 'LoadState', 'ActiveState', 'SubState', 'UnitFileState',
              'NeedDaemonReload', 'DropInPaths', 'TriggeredBy')
PACKAGE_FORMAT = '${binary:Package}\t${Version}\t${source:Package}\t${source:Version}\t${db:Status-Status}\n'


FAILURE_CODES = frozenset((
    'UNSPECIFIED_REJECTION', 'UNEXPECTED_FAILURE', 'ENTRY_PRECONDITION',
    'CONTEXT_INVALID', 'ROOT_OPEN', 'NATIVE_PLATFORM', 'COMMAND_PROJECTION',
    'KERNEL_RELEASE_READ', 'KERNEL_RELEASE_MISMATCH', 'REGISTRY_OPEN',
    'REGISTRY_STAT', 'MOUNTINFO_READ', 'MOUNTINFO_ENCODING', 'MOUNTINFO_ROW_LIMIT',
    'MOUNTINFO_ROW_FORMAT', 'MOUNTINFO_ID_FORMAT', 'MOUNTINFO_SUBMOUNT',
    'MOUNTINFO_TARGET_FS_OR_ROOT', 'MOUNTINFO_DEVICE_OR_INODE_MISMATCH',
    'MOUNTINFO_TARGET_COUNT', 'NAMESPACE_READ', 'NAMESPACE_LINK_READ',
    'NAMESPACE_ID_FORMAT', 'REGISTRY_RECHECK_CHANGED',
    'KERNEL_RELEASE_RECHECK_READ', 'KERNEL_RELEASE_RECHECK_MISMATCH',
    'COLLECTION_DEADLINE', 'QUERY_DEADLINE', 'OUTPUT_BOUND_OR_ENCODING',
    'PROCESS_DEADLINE',
))


class Rejected(Exception):
    def __init__(self, code='UNSPECIFIED_REJECTION'):
        self.code = code if type(code) is str and code in FAILURE_CODES else 'UNEXPECTED_FAILURE'
        super().__init__(self.code)


def require(value, code='UNSPECIFIED_REJECTION'):
    if not value:
        raise Rejected(code)


def at(code, function, *arguments, **kwargs):
    try:
        return function(*arguments, **kwargs)
    except Rejected as error:
        if error.code != 'UNSPECIFIED_REJECTION':
            raise
        raise Rejected(code) from None
    except Exception:
        raise Rejected(code) from None


def failure_line(error):
    code = error.code if type(error) is Rejected else 'UNEXPECTED_FAILURE'
    if type(code) is not str or code not in FAILURE_CODES:
        code = 'UNEXPECTED_FAILURE'
    return 'DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2:' + code


def check(deadline, code='COLLECTION_DEADLINE'):
    require(time.monotonic() < deadline, code)


def ascii_text(data):
    text = data.decode('ascii', errors='strict')
    require(all(c in '\n\t' or 32 <= ord(c) <= 126 for c in text))
    return text


def directory(root, parts):
    fd = os.dup(root)
    try:
        for part in parts:
            require(re.fullmatch(r'[A-Za-z0-9_.-]+', part) is not None and part not in ('.', '..'))
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_mtime_ns, info.st_ctime_ns)


def read_fixed(root, parts, limit, deadline):
    check(deadline)
    parent = directory(root, parts[:-1])
    try:
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            before = os.fstat(fd)
            require(stat.S_ISREG(before.st_mode))
            data = bytearray()
            while True:
                check(deadline)
                chunk = os.read(fd, limit + 1 - len(data))
                if not chunk:
                    break
                data.extend(chunk)
                require(len(data) <= limit)
            after = os.fstat(fd)
            require(identity(before) == identity(after))
            require(identity(after) == identity(os.stat(parts[-1], dir_fd=parent, follow_symlinks=False)))
            return bytes(data)
        finally:
            os.close(fd)
    finally:
        os.close(parent)


def namespaces(root, pid):
    parent = directory(root, ('proc', str(pid), 'ns'))
    try:
        result = {}
        for name, prefix in [('mnt', 'mnt'), ('user', 'user')]:
            # These two fixed kernel namespace links are read as opaque text, never followed.
            value = at('NAMESPACE_LINK_READ', os.readlink, name, dir_fd=parent)
            require(re.fullmatch(prefix + r':\[[1-9][0-9]{0,19}\]', value) is not None, 'NAMESPACE_ID_FORMAT')
            result[name] = value
        return result
    finally:
        os.close(parent)


def mount_identity(data, device, inode):
    text = at('MOUNTINFO_ENCODING', ascii_text, data)
    rows = text.splitlines()
    require(len(rows) <= 512, 'MOUNTINFO_ROW_LIMIT')
    matches = []
    target = '/proc/sys/fs/binfmt_misc'
    for row in rows:
        halves = row.split(' - ')
        require(len(halves) == 2, 'MOUNTINFO_ROW_FORMAT')
        left, right = halves[0].split(), halves[1].split()
        require(len(left) >= 6 and len(right) == 3, 'MOUNTINFO_ROW_FORMAT')
        require(re.fullmatch(r'[1-9][0-9]{0,19}', left[0]) is not None, 'MOUNTINFO_ID_FORMAT')
        require(re.fullmatch(r'[0-9]{1,20}', left[1]) is not None, 'MOUNTINFO_ID_FORMAT')
        require(not left[4].startswith(target + '/'), 'MOUNTINFO_SUBMOUNT')
        if left[4] == target:
            require(left[3] == '/' and right[0] == 'binfmt_misc', 'MOUNTINFO_TARGET_FS_OR_ROOT')
            require(left[2] == device and inode > 0, 'MOUNTINFO_DEVICE_OR_INODE_MISMATCH')
            matches.append({'filesystem': 'binfmt_misc', 'mount_id': left[0],
                            'parent_mount_id': left[1], 'device': device, 'inode': str(inode),
                            'read_only': 'ro' in left[5].split(','),
                            'shared_propagation': any(x.startswith('shared:') for x in left[6:])})
    require(len(matches) == 1, 'MOUNTINFO_TARGET_COUNT')  # Stacked/ambiguous target mounts are unavailable.
    return matches[0]


def commands(release):
    require(re.fullmatch(r'[0-9][A-Za-z0-9.+_-]{0,127}', release) is not None)
    package = 'linux-image-' + release
    return [('/usr/bin/dpkg-query', '--show', '--showformat=' + PACKAGE_FORMAT, '--', package)] + [
        ('/usr/bin/systemctl', '--system', '--no-pager', '--no-ask-password', 'show',
         '--property=' + ','.join(PROPERTIES), unit) for unit in UNITS]


def query(argv, deadline):
    """Only called with the five fixed query projections constructed above."""
    require(type(argv) is tuple and len(argv) > 0 and all(type(arg) is str for arg in argv))
    if argv[0] == '/usr/bin/dpkg-query':
        require(type(argv[-1]) is str and argv[-1].startswith('linux-image-'))
        require(argv == commands(argv[-1][len('linux-image-'):])[0])
    else:
        require(argv in commands('0')[1:])
    check(deadline)
    child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, close_fds=True,
                             env={'LANG': 'C', 'LC_ALL': 'C', 'PATH': '/usr/bin:/bin'})
    try:
        output = bytearray()
        stop_at = min(deadline, time.monotonic() + 1.0)
        while True:
            check(stop_at, 'QUERY_DEADLINE')
            readable, _, _ = select.select([child.stdout], [], [], max(0, stop_at - time.monotonic()))
            require(readable)
            chunk = os.read(child.stdout.fileno(), MAX_QUERY_BYTES + 1 - len(output))
            if not chunk:
                break
            output.extend(chunk)
            require(len(output) <= MAX_QUERY_BYTES)
        require(child.wait(timeout=max(0.001, stop_at - time.monotonic())) == 0)
        return bytes(output)
    finally:
        # Only this directly owned observation child may be terminated on failure.
        if child.poll() is None:
            child.kill()
            child.wait(timeout=1)
        child.stdout.close()


def package_record(data, release):
    require(len(data) <= MAX_QUERY_BYTES)
    text = ascii_text(data)
    require(text.endswith('\n') and text.count('\n') == 1)
    parts = text[:-1].split('\t')
    require(len(parts) == 5)
    require(parts[0] in ('linux-image-' + release, 'linux-image-' + release + ':amd64'))
    require(parts[4] == 'installed')
    require(re.fullmatch(r'[a-z0-9][a-z0-9+.-]{0,127}', parts[2]) is not None)
    for version in (parts[1], parts[3]):
        require(re.fullmatch(r'[A-Za-z0-9.+:~_-]{1,160}', version) is not None)
    return dict(zip(('binary_package', 'binary_version', 'source_package', 'source_version', 'package_state'), parts))


def unit_record(data, unit):
    require(unit in UNITS and len(data) <= MAX_QUERY_BYTES)
    fields = {}
    for line in ascii_text(data).splitlines():
        key, separator, value = line.partition('=')
        require(separator and key not in fields)
        fields[key] = value
    require(set(fields) == set(PROPERTIES) and fields['Id'] == unit)
    require(fields['LoadState'] in ('loaded', 'not-found', 'bad-setting', 'error', 'masked'))
    require(fields['ActiveState'] in ('active', 'inactive', 'failed', 'activating', 'deactivating', 'maintenance', 'reloading', 'refreshing'))
    require(fields['SubState'] in ('dead', 'exited', 'running', 'failed', 'mounted', 'waiting', 'listening', 'start', 'stop', 'auto-restart', 'condition'))
    require(fields['UnitFileState'] in ('', 'enabled', 'enabled-runtime', 'disabled', 'static', 'indirect', 'generated', 'alias', 'linked', 'linked-runtime', 'masked', 'masked-runtime', 'not-found'))
    require(fields['NeedDaemonReload'] in ('yes', 'no'))
    triggers = fields['TriggeredBy'].split()
    require(len(triggers) <= 16 and all(re.fullmatch(r'[A-Za-z0-9@_.:-]{1,160}', t) is not None for t in triggers))
    return {'unit': unit, 'load_state': fields['LoadState'], 'active_state': fields['ActiveState'],
            'sub_state': fields['SubState'], 'unit_file_state': fields['UnitFileState'],
            'needs_reload': fields['NeedDaemonReload'] == 'yes',
            'dropins_present': bool(fields['DropInPaths']), 'trigger_count': len(triggers)}


def safe_observation(function):
    try:
        return {'status': 'OBSERVED', 'data': function()}
    except Exception:
        return {'status': 'UNKNOWN', 'reason': 'QUERY_UNAVAILABLE_OR_UNSUPPORTED'}


def collect(root, pid, kernel, provenance, deadline, query_function=query):
    require(kernel.sysname == 'Linux' and kernel.machine == 'x86_64', 'NATIVE_PLATFORM')
    release = kernel.release
    cmds = at('COMMAND_PROJECTION', commands, release)
    release_file = at('KERNEL_RELEASE_READ', read_fixed, root, ('proc', 'sys', 'kernel', 'osrelease'), 256, deadline)
    require(release_file == (release + '\n').encode('ascii'), 'KERNEL_RELEASE_MISMATCH')
    def signature():
        text = ascii_text(read_fixed(root, ('proc', 'version_signature'), 512, deadline))
        require(re.fullmatch(r'Ubuntu [A-Za-z0-9.:+~_-]{1,128} [A-Za-z0-9.:+~_-]{1,128}\n', text) is not None)
        vendor, version, upstream = text.strip().split()
        return {'vendor': vendor, 'version': version, 'upstream_version': upstream}
    def registry_snapshot():
        fd = at('REGISTRY_OPEN', directory, root, ('proc', 'sys', 'fs', 'binfmt_misc'))
        try:
            info = at('REGISTRY_STAT', os.fstat, fd)
            data = at('MOUNTINFO_READ', read_fixed, root, ('proc', str(pid), 'mountinfo'), 65536, deadline)
            mount = mount_identity(data, '%d:%d' % (os.major(info.st_dev), os.minor(info.st_dev)), info.st_ino)
            mount.update(at('NAMESPACE_READ', namespaces, root, pid))
            return mount
        finally:
            os.close(fd)
    before = registry_snapshot()
    version = safe_observation(signature)
    package = safe_observation(lambda: package_record(query_function(cmds[0], deadline), release))
    units = []
    for unit, command in zip(UNITS, cmds[1:]):
        check(deadline)
        observation = safe_observation(lambda c=command, u=unit: unit_record(query_function(c, deadline), u))
        units.append({'unit': unit, 'observation': observation})
    require(registry_snapshot() == before, 'REGISTRY_RECHECK_CHANGED')
    require(at('KERNEL_RELEASE_RECHECK_READ', read_fixed, root, ('proc', 'sys', 'kernel', 'osrelease'), 256, deadline) == release_file, 'KERNEL_RELEASE_RECHECK_MISMATCH')
    check(deadline)
    return {'schema': 'DOSAI_KERNEL_WRITER_DIAGNOSTIC_V1', 'diagnostic_only': True,
            'provenance': provenance, 'kernel': {'release': release, 'machine': 'x86_64',
            'version_signature': version, 'installed_package': package}, 'registry': before,
            'writer_units': units, 'writer_inventory_scope': 'FIXED_UNITS_ONLY_NON_ATOMIC',
            'gaps': ['RUNNING_KERNEL_NOT_CRYPTOGRAPHICALLY_BOUND_TO_PACKAGE',
                     'VENDOR_SOURCE_AND_PATCH_MATCH_NOT_VERIFIED', 'UNLISTED_PRIVILEGED_WRITERS_NOT_EXCLUDED',
                     'COOPERATING_FENCE_NOT_OBSERVED', 'OWNER_TRUST_DECISION_NOT_ACCEPTED',
                     'SAME_EFFECTIVE_REGISTRY_FOR_FUTURE_EXECUTION_NOT_PROVEN'],
            'proofs': {'source_match_verified': False, 'single_writer_exclusion_proven': False,
                       'runtime_admission': False, 'execution_authorized': False}}


def context():
    patterns = {'GITHUB_RUN_ID': r'[1-9][0-9]{0,31}', 'GITHUB_RUN_ATTEMPT': r'1',
                'GITHUB_JOB': r'builder_host_[ab]', 'GITHUB_SHA': r'[0-9a-f]{40}',
                'ImageOS': r'ubuntu24', 'ImageVersion': r'[A-Za-z0-9._-]{1,64}',
                'DOSAI_RUNNER_ENVIRONMENT': r'github-hosted', 'DOSAI_RUNNER_OS': r'Linux',
                'DOSAI_RUNNER_ARCH': r'X64'}
    values = {}
    for key, pattern in patterns.items():
        value = os.environ.get(key, '')
        require(re.fullmatch(pattern, value) is not None, 'CONTEXT_INVALID')
        values[key] = value
    return values


def encode(value):
    output = PREFIX + json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    require(len(output.encode('ascii')) + 1 <= MAX_OUTPUT_BYTES)
    return output


def expired(_signal, _frame):
    raise Rejected('PROCESS_DEADLINE')


def main():
    try:
        require(len(sys.argv) == 1 and platform.system() == 'Linux' and sys.flags.isolated and sys.dont_write_bytecode, 'ENTRY_PRECONDITION')
        signal.signal(signal.SIGALRM, expired)
        signal.setitimer(signal.ITIMER_REAL, 8.0)
        provenance = context()
        root = at('ROOT_OPEN', os.open, '/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            result = collect(root, os.getpid(), os.uname(), provenance, time.monotonic() + 7.0)
        finally:
            os.close(root)
        print(at('OUTPUT_BOUND_OR_ENCODING', encode, result), flush=True)
        return 0
    except Exception as error:
        print(failure_line(error), file=sys.stderr)
        return 2
    finally:
        if hasattr(signal, 'setitimer'):
            signal.setitimer(signal.ITIMER_REAL, 0)


if __name__ == '__main__':
    sys.exit(main())
