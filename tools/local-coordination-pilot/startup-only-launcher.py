"""Local-only ADR 0022 admission probe. No prompt, turn, or provider transport."""

from contextlib import closing, contextmanager
import ctypes
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import selectors
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time


PINS = (
    ('codex', 280723744, '3ea20787e106af94573d3d6c19480aed93a1334b0dd32b6b04e2f780ce82cf4b'),
    ('2.1.314', 278848096, '21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed'),
    ('node', 120965360, 'ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a'),
)
PILOT = Path('/private/tmp')
CREDENTIAL_FILES = {'codex': 'auth.json', 'claude': '.credentials.json'}
CLIENTS = tuple(CREDENTIAL_FILES)
MAX_REPLY_BYTES = 32768
STARTUP_SECONDS = 5
APP_SERVER_PIN = ('codex-app-server-aarch64-apple-darwin', 236747952,
                  'b6d4ae3a01f5a044d80deba107b27e995944d012a8132cee8a4f3e05c2fd2448')
APP_SERVER_SIGNER = '=anchor apple generic and identifier "codex-app-server" and certificate leaf[subject.OU] = "2DC432GLL2"'
APP_SERVER_PROVIDER = 'openai_chatgpt_plan'
APP_SERVER_ARGS = ['--listen', 'stdio://',
                   '-c', f'model_provider="{APP_SERVER_PROVIDER}"',
                   '-c', f'model_providers.{APP_SERVER_PROVIDER}.name="ChatGPT plan"',
                   '-c', f'model_providers.{APP_SERVER_PROVIDER}.base_url="https://api.openai.com/v1"',
                   '-c', f'model_providers.{APP_SERVER_PROVIDER}.env_key="ACCESS_TOKEN"',
                   '-c', f'model_providers.{APP_SERVER_PROVIDER}.wire_api="responses"',
                   '-c', f'model_providers.{APP_SERVER_PROVIDER}.requires_openai_auth=false',
                   '-c', f'model_providers.{APP_SERVER_PROVIDER}.supports_websockets=false',
                   '-c', f'model_providers.{APP_SERVER_PROVIDER}.request_max_retries=0',
                   '-c', f'model_providers.{APP_SERVER_PROVIDER}.stream_max_retries=0',
                   '-c', 'approval_policy="never"', '-c', 'sandbox_mode="read-only"',
                   '-c', 'cli_auth_credentials_store="file"', '-c', 'mcp_servers={}',
                   '-c', 'web_search="disabled"']

# The allowlisted commands and messages are literals. No caller supplies prompts,
# arguments, a provider endpoint, credentials, an inference method, or a shell.
CODEX_CONFIG = ['-c', 'forced_login_method="chatgpt"', '-c', 'cli_auth_credentials_store="file"',
                '-c', 'model_provider="openai"', '-c', 'mcp_servers={}', '-c', 'web_search="disabled"']
CLAUDE_FLAGS = ['--safe-mode', '--restricted', '--tools', '', '--strict-mcp-config',
                '--no-chrome', '--no-session-persistence', '--permission-prompts', 'none']
CODEX_INIT = {'id': 1, 'method': 'initialize',
              'params': {'clientInfo': {'name': 'dosai-startup-only', 'version': '1'}}}
CLAUDE_INIT = {'type': 'control_request', 'request_id': 'dosai-startup-only',
               'request': {'subtype': 'initialize'}}


class Hold(Exception):
    pass


def pin_binary(argument, pin):
    path = Path(argument)
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise Hold('Use the canonical pinned executable paths.')
    filename, length, digest = pin
    info = path.stat()
    if path.name != filename or not stat.S_ISREG(info.st_mode) or info.st_size != length:
        raise Hold('Executable identity changed.')
    hasher = hashlib.sha256()
    with path.open('rb') as binary:
        for chunk in iter(lambda: binary.read(1024 * 1024), b''):
            hasher.update(chunk)
    if hasher.hexdigest() != digest:
        raise Hold('Executable identity changed.')
    return path


def private_directory(path):
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or
            stat.S_IMODE(info.st_mode) != 0o700 or path.resolve(strict=True) != path):
        raise Hold('The startup directories must be owner-only and canonical.')


def prepare(root):
    for client in CLIENTS:
        home = root / client
        home.mkdir(mode=0o700)
        for child in ('config', 'work', 'tmp'):
            (home / child).mkdir(mode=0o700)


def validate_profile(root):
    if root.parent != PILOT or not re.fullmatch(r'dosai-startup-[a-z0-9_]{8}', root.name):
        raise Hold('Use a startup profile created by this launcher.')
    private_directory(root)
    for client in CLIENTS:
        home = root / client
        for path in (home, home / 'config', home / 'work', home / 'tmp'):
            private_directory(path)
        if any((home / 'work').iterdir()):
            raise Hold('The working directory must be empty.')


def validate_credential_metadata(root):
    for client, filename in CREDENTIAL_FILES.items():
        path = root / client / 'config' / filename
        try:
            info = path.lstat()
        except FileNotFoundError:
            continue
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or
                stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            raise Hold('Vendor credential storage is not an owner-only regular file.')


def local_environment(client, home):
    base = {'HOME': str(home), 'TMPDIR': str(home / 'tmp'), 'PATH': '/usr/bin:/bin'}
    if client == 'codex':
        base['CODEX_HOME'] = str(home / 'config')
    else:
        base.update(CLAUDE_CONFIG_DIR=str(home / 'config'), CLAUDE_CODE_TMPDIR=str(home / 'tmp'),
                    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1', DISABLE_AUTOUPDATER='1')
    return base


def sandbox_profile(binary, home):
    return f'''(version 1)
(allow default)
(deny network*)
(deny process-fork)
(deny process-exec)
(allow process-exec (literal {json.dumps(str(binary))}))
(deny file-read-data (subpath "/Users") (subpath "/Volumes") (subpath "/opt")
  (subpath "/Library") (subpath "/private/tmp") (subpath "/private/var/folders")
  (subpath "/private/var/root") (subpath "/System/Volumes/Data"))
(allow file-read-data (literal {json.dumps(str(binary))}) (subpath {json.dumps(str(home))}))
(deny file-write*)
(allow file-write* (subpath {json.dumps(str(home))}) (literal "/dev/null"))
(deny mach-lookup)'''


def app_server_profile(binary, home):
    target = json.dumps(str(binary))
    directory = json.dumps(str(home))
    return f'''(version 1)
(deny default)
(allow process-exec (literal {target}))
(allow file-read-metadata)
(allow file-read-data (literal {target}) (subpath {directory})
  (subpath "/System/Library") (subpath "/usr/lib")
  (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))
(allow file-write* (subpath {directory}) (literal "/dev/null"))
(allow signal (target self))'''


@contextmanager
def scoped_process(binary, client, home, args, *, status_on_stderr=False,
                   profile=sandbox_profile, own_session=False):
    # Never send output to the terminal or evidence store. The supervisor reads
    # only a bounded response and reports closed status labels.
    child = subprocess.Popen(['/usr/bin/sandbox-exec', '-p', profile(binary, home),
                              str(binary), *args], cwd=home / 'work', env=local_environment(client, home),
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, start_new_session=own_session,
                             stderr=subprocess.STDOUT if status_on_stderr else subprocess.DEVNULL)
    try:
        yield child
    finally:
        try:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=3)
        finally:
            try:
                child.stdin.close()
            finally:
                child.stdout.close()


def unique_json(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Hold('Duplicate fields in a startup reply.')
        result[key] = value
    return result


def read_json(data):
    return json.loads(data, object_pairs_hook=unique_json)


def read_messages(process, *, lines, decode=read_json):
    deadline = time.monotonic() + STARTUP_SECONDS
    pending = b''
    total = 0
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        while time.monotonic() < deadline:
            if not selector.select(max(0, deadline - time.monotonic())):
                break
            chunk = os.read(process.stdout.fileno(), 8192)
            if not chunk:
                if pending and not lines:
                    yield decode(pending)
                elif pending:
                    raise Hold('Incomplete startup reply.')
                return
            total += len(chunk)
            if total > MAX_REPLY_BYTES:
                raise Hold('Oversized startup reply.')
            pending += chunk
            if lines:
                while b'\n' in pending:
                    line, pending = pending.split(b'\n', 1)
                    yield decode(line)
    raise Hold('Startup reply timed out.')


def send(process, message):
    process.stdin.write((json.dumps(message) + '\n').encode())
    process.stdin.flush()


def codex_reply(replies, request_id):
    for reply in replies:
        if reply.get('id') == request_id and 'method' not in reply:
            if 'error' not in reply and isinstance(reply.get('result'), dict):
                return reply['result']
            break
    raise Hold('Codex startup metadata was rejected.')


def cancel_ready(child, binary, expected):
    proc = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    proc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
    proc.proc_pidpath.restype = ctypes.c_int
    path = ctypes.create_string_buffer(4096)
    if proc.proc_pidpath(child.pid, path, len(path)) <= 0 or os.fsdecode(path.value) != str(binary):
        raise Hold('The ready worker did not match the pinned executable.')
    if child.poll() is not None:
        raise Hold('Startup worker exited before cancellation.')
    child.terminate()
    if child.wait(timeout=3) not in expected:
        raise Hold('Startup worker did not confirm termination.')


def codex_auth(binary, home):
    args = [*CODEX_CONFIG, 'login', 'status']
    with scoped_process(binary, 'codex', home, args, status_on_stderr=True) as child:
        child.stdin.close()
        records = list(read_messages(child, lines=False, decode=bytes.splitlines))
        status = child.wait(timeout=3)
    if len(records) != 1:
        raise Hold('Codex login status was unavailable.')
    markers = set(records[0]) & {b'Logged in using ChatGPT', b'Not logged in'}
    if status == 0 and markers == {b'Logged in using ChatGPT'}:
        return 'CHATGPT'
    if status == 1 and markers == {b'Not logged in'}:
        return 'SIGNED_OUT'
    raise Hold('Codex reported an unsupported authentication mode.')


def codex_startup(binary, home):
    mode = codex_auth(binary, home)
    with scoped_process(binary, 'codex', home, [*CODEX_CONFIG, 'app-server', '--listen', 'stdio://']) as child:
        with closing(read_messages(child, lines=True)) as replies:
            send(child, CODEX_INIT)
            codex_reply(replies, 1)
            send(child, {'method': 'initialized'})
        cancel_ready(child, binary, (0, -signal.SIGTERM))
        return mode


def claude_auth(binary, home):
    with scoped_process(binary, 'claude', home, ['--safe-mode', 'auth', 'status', '--json']) as child:
        child.stdin.close()
        records = list(read_messages(child, lines=False))
        status = child.wait(timeout=3)
        if len(records) != 1:
            raise Hold('Claude Code startup metadata was rejected.')
        account = records[0]
        if status == 1 and account.get('loggedIn') is False and account.get('authMethod') == 'none':
            return 'SIGNED_OUT'
        if status == 0 and account.get('loggedIn') is True and account.get('authMethod') == 'claude.ai':
            return 'CLAUDE_SUBSCRIPTION'
        raise Hold('Claude Code reported an unsupported authentication mode.')


def claude_startup(binary, home):
    mode = claude_auth(binary, home)
    args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', *CLAUDE_FLAGS]
    with scoped_process(binary, 'claude', home, args) as child:
        send(child, CLAUDE_INIT)
        with closing(read_messages(child, lines=True)) as replies:
            for reply in replies:
                if reply.get('type') != 'control_response':
                    continue
                response = reply.get('response', {})
                if (response.get('request_id') == CLAUDE_INIT['request_id'] and
                        response.get('subtype') == 'success' and
                        response.get('response', {}).get('pid') == child.pid):
                    cancel_ready(child, binary, (128 + signal.SIGTERM, -signal.SIGTERM))
                    return mode
                break
    raise Hold('Claude Code startup control handshake was rejected.')


CANARY = """
const fs = require('node:fs');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const [port, sibling] = process.argv.slice(1);
function denied(effect) {
    try {
        effect();
    } catch (error) {
        if (['EPERM', 'EACCES'].includes(error.code)) return;
        throw error;
    }
    throw new Error('Probe unexpectedly allowed');
}
denied(() => fs.readFileSync(sibling));
denied(() => fs.writeFileSync(sibling + '.write', 'synthetic'));
denied(() => { const result = spawnSync('/usr/bin/true'); if (result.error) throw result.error; });
const conn = net.createConnection({ port: Number(port), host: '127.0.0.1' });
conn.setTimeout(1000, () => { conn.destroy(); process.exitCode = 1; });
conn.once('connect', () => { conn.destroy(); process.exitCode = 1; });
conn.once('error', error => { if (!['EPERM', 'EACCES'].includes(error.code)) process.exitCode = 1; });
"""


def verify_fence(node):
    with tempfile.TemporaryDirectory(prefix='dosai-fence-', dir=PILOT) as folder, socket.socket() as decoy:
        root = Path(folder)
        prepare(root)
        sibling = root / 'outside'
        sibling.write_text('synthetic')
        decoy.bind(('127.0.0.1', 0))
        decoy.listen()
        port = str(decoy.getsockname()[1])
        for client in CLIENTS:
            with scoped_process(node, client, root / client, ['-e', CANARY, port, str(sibling)]) as child:
                if child.wait(timeout=5) != 0:
                    raise Hold('The startup fence did not deny all canaries.')


def stage_pinned_executable(source, root, pin):
    candidate = root / pin[0]
    source_path = pin_binary(source, pin)
    shutil.copyfile(source_path, candidate)
    candidate.chmod(0o500)
    return pin_binary(str(candidate), pin)


def verify_app_server_signer(binary):
    result = subprocess.run(['/usr/bin/codesign', '--verify', '--strict', '-R',
                             APP_SERVER_SIGNER, str(binary)], env={'PATH': '/usr/bin:/bin'},
                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, timeout=10)
    if result.returncode != 0:
        raise Hold('The App Server executable signature was rejected.')


def verify_app_server_fence(node, root):
    home = root / 'codex'
    sibling = root / 'outside'
    sibling.write_text('synthetic')
    # No listener is opened. The policy must deny the loopback connect, even
    # when an ordinary uncontained attempt would report connection refused.
    script = CANARY + """
const marker = process.env.CODEX_HOME + '/canary';
fs.writeFileSync(marker, 'synthetic', { flag: 'wx' });
if (fs.readFileSync(marker, 'utf8') !== 'synthetic') throw new Error('Private profile unavailable');
fs.unlinkSync(marker);
"""
    with scoped_process(node, 'codex', home, ['-e', script, '1', str(sibling)],
                        profile=app_server_profile, own_session=True) as child:
        if child.wait(timeout=5) != 0:
            raise Hold('The App Server fence did not deny every canary.')
        require_group_absent(child.pid)


def require_group_absent(group):
    try:
        os.killpg(group, 0)
    except ProcessLookupError:
        return
    raise Hold('The startup session still has a process group.')


def app_server_startup(binary, home):
    if any((home / 'config').iterdir()):
        raise Hold('The startup proof requires empty app-server configuration.')
    request = {'id': 1, 'method': 'initialize',
               'params': {'clientInfo': {'name': 'dosai-private-beta', 'version': '0.1.0'}}}
    with scoped_process(binary, 'codex', home, APP_SERVER_ARGS,
                        profile=app_server_profile, own_session=True) as child:
        if os.getpgid(child.pid) != child.pid:
            raise Hold('The startup process does not own a distinct process group.')
        with closing(read_messages(child, lines=True)) as replies:
            send(child, request)
            reply = next(replies, None)
            if (not isinstance(reply, dict) or type(reply.get('id')) is not int or reply['id'] != 1 or
                    'error' in reply or 'method' in reply or not isinstance(reply.get('result'), dict) or
                    not isinstance(reply['result'].get('userAgent'), str) or not reply['result']['userAgent']):
                raise Hold('App Server initialization was rejected.')
            send(child, {'method': 'initialized'})
        cancel_ready(child, binary, (0, -signal.SIGTERM))
        require_group_absent(child.pid)


def verify_app_server_startup(binary, node):
    with tempfile.TemporaryDirectory(prefix='dosai-app-server-startup-', dir=PILOT) as folder:
        root = Path(folder)
        private_directory(root)
        prepare(root)
        app_server = stage_pinned_executable(binary, root, APP_SERVER_PIN)
        canary = stage_pinned_executable(node, root, PINS[2])
        verify_app_server_signer(app_server)
        verify_app_server_fence(canary, root)
        app_server_startup(app_server, root / 'codex')
        if os.path.lexists(root / 'codex/config/auth.json'):
            raise Hold('The startup proof unexpectedly created a credential file.')
    print(json.dumps({
        'status': 'PASS', 'scope': 'STARTUP_ONLY', 'executable_sha256': APP_SERVER_PIN[2],
        'signature_verified': True, 'fence_canaries_denied': True,
        'stdio_initialized': True, 'direct_child_reaped': True, 'process_group_absent': True,
        'credential_file_absent': True, 'temporary_profile_removed': True,
        'inference_requests': 0, 'live_launch_permitted': False,
    }))
    return 0


def verify(root, binaries, rehearsal):
    validate_profile(root)
    validate_credential_metadata(root)
    codex, claude, node = binaries
    verify_fence(node)
    codex_mode = codex_startup(codex, root / 'codex')
    claude_mode = claude_startup(claude, root / 'claude')
    receipt = {'codex': codex_mode, 'claude': claude_mode, 'startup_cancelled': True,
               'inference_requests': 0, 'live_launch_permitted': False}
    expected = ('SIGNED_OUT', 'SIGNED_OUT') if rehearsal else ('CHATGPT', 'CLAUDE_SUBSCRIPTION')
    receipt['status'] = 'PASS' if (codex_mode, claude_mode) == expected else 'HOLD'
    print(json.dumps(receipt))
    return 0 if receipt['status'] == 'PASS' else 2


def main(args):
    if sys.platform != 'darwin' or platform.machine() != 'arm64':
        raise Hold('The pinned startup probe requires macOS on Apple silicon.')
    if args == ['--prepare']:
        root = Path(tempfile.mkdtemp(prefix='dosai-startup-', dir=PILOT))
        prepare(root)
        print(root)
        return 0
    if len(args) == 4 and args[0] == '--rehearse':
        binaries = [pin_binary(arg, pin) for arg, pin in zip(args[1:], PINS)]
        with tempfile.TemporaryDirectory(prefix='dosai-startup-', dir=PILOT) as folder:
            root = Path(folder)
            prepare(root)
            return verify(root, binaries, rehearsal=True)
    if len(args) == 5 and args[0] == '--check':
        binaries = [pin_binary(arg, pin) for arg, pin in zip(args[2:], PINS)]
        return verify(Path(args[1]), binaries, rehearsal=False)
    if len(args) == 3 and args[0] == '--app-server-startup':
        return verify_app_server_startup(*args[1:])
    raise Hold('Use --prepare, --rehearse CODEX CLAUDE NODE, --check PROFILE CODEX CLAUDE NODE, '
               'or --app-server-startup APP_SERVER NODE.')


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        sys.exit('HOLD. Startup check interrupted.')
    except Hold as error:
        sys.exit(f'HOLD. {error}')
    except (OSError, ValueError, TypeError, AttributeError, subprocess.SubprocessError):
        sys.exit('HOLD. Startup identity, isolation, or cancellation could not be verified.')
