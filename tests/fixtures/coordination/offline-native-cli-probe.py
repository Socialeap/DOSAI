"""One offline observation per pinned native CLI. No upstream, model response or live launch."""

import hashlib
import http.server
import json
from pathlib import Path
import platform
import re
import secrets
import socket
import stat
import subprocess
import sys
import tempfile
import threading

PINS = (
    ('codex', 280723744, '3ea20787e106af94573d3d6c19480aed93a1334b0dd32b6b04e2f780ce82cf4b'),
    ('2.1.314', 278848096, '21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed'),
    ('node', 120965360, 'ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a'),
)
SANDBOX = '/usr/bin/sandbox-exec'
quote = json.dumps

def profile(binary, root, port):
    return f'''(version 1)
(allow default)
(deny network*)
(allow network-outbound (remote tcp "localhost:{port}"))
(deny process-fork)
(deny process-exec)
(allow process-exec (literal {quote(str(binary))}))
(deny file-read-data (subpath "/Users") (subpath {quote(str(root.parent))})
  (subpath "/Library/Application Support/ClaudeCode")
  (subpath "/Library/Managed Preferences"))
(allow file-read-data (literal {quote(str(binary))}) (subpath {quote(str(root))}))
(deny file-write*)
(allow file-write* (subpath {quote(str(root))}) (literal "/dev/null"))
(deny mach-lookup (global-name "com.apple.securityd")
  (global-name "com.apple.SecurityServer") (global-name "com.apple.security.agent"))'''

class Sink(http.server.BaseHTTPRequestHandler):
    """Observe the first synthetic request. The sink has no forwarding path."""

    timeout = 5

    def log_message(self, *_):
        return

    def do_GET(self):
        self.send_error(404)

    def do_POST(self):
        try:
            self.connection.settimeout(15)
            size = int(self.headers.get('Content-Length', '0'))
            if self.path.split('?')[0] != self.server.path or not 0 < size <= 512 * 1024:
                self.send_error(404)
                return
            raw = self.rfile.read(size)
            if b'Classify this synthetic fixture' not in raw or self.server.received.is_set():
                raise ValueError()
            body = json.loads(raw)
            tools = body.get('tools', [])
            if not isinstance(tools, list) or len(tools) > 100:
                raise ValueError()
            names = [item.get('name') or item.get('type') for item in tools]
            if not all(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', name) for name in names):
                raise ValueError()
            self.server.catalog = names
            self.server.tools_field_present = 'tools' in body
            self.server.received.set()
            self.server.disconnected = not self.connection.recv(1)
        except (ValueError, TypeError, AttributeError, OSError):
            self.server.failed = True
        finally:
            self.server.finished.set()

def env_for(root):
    return {'HOME': str(root), 'TMPDIR': str(root), 'PATH': '/usr/bin:/bin'}

# A synthetic sibling holds the read/write canaries. Both test destinations are
# loopback. A failed fence check blocks both CLI launches.
CANARY = '''
const fs = require('node:fs');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const [allowed, blocked, outside] = process.argv.slice(1);
function denied(effect) {
    try { effect(); } catch (error) {
        if (['EPERM', 'EACCES'].includes(error.code)) return;
        throw error;
    }
    throw new Error('Sandbox canary allowed');
}
function connect(port) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ port: Number(port), host: '127.0.0.1' });
        socket.setTimeout(1000, () => socket.destroy(new Error('canary deadline')));
        socket.once('error', reject);
        socket.once('connect', () => { socket.destroy(); resolve(); });
    });
}
(async () => {
    await connect(allowed);
    await connect(blocked).then(() => { throw new Error('Off-port connection admitted'); }, error => {
        if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    });
    denied(() => fs.readFileSync(outside));
    denied(() => fs.writeFileSync(outside + '.write', 'synthetic'));
    denied(() => { const result = spawnSync('/usr/bin/true'); if (result.error) throw result.error; });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
'''

def test_fence(scratch, sink, canary, node):
    with socket.socket() as blocked:
        blocked.bind(('127.0.0.1', 0))
        blocked.listen()
        command = [SANDBOX, '-p', profile(node, scratch, sink.server_port), str(node),
                   '-e', CANARY, str(sink.server_port), str(blocked.getsockname()[1]), str(canary)]
        subprocess.run(command, cwd=scratch, env=env_for(scratch), check=True, timeout=8)

def run(name, binary, scratch, canary, node):
    with http.server.HTTPServer(('127.0.0.1', 0), Sink) as sink:
        prefix = '/' + secrets.token_hex(16)
        sink.path = prefix + ('/v1/responses' if name == 'codex' else '/v1/messages')
        sink.received = threading.Event()
        sink.finished = threading.Event()
        sink.catalog = None
        sink.tools_field_present = None
        sink.disconnected = False
        sink.failed = False
        reader = threading.Thread(target=sink.serve_forever, daemon=True)
        reader.start()
        proc = None
        try:
            test_fence(scratch, sink, canary, node)
            base = f'http://127.0.0.1:{sink.server_port}{prefix}'
            env = env_for(scratch)
            if name == 'codex':
                env['CODEX_HOME'] = str(scratch)
                fixture = (
                    f'model_providers.dosai_fixture={{name="DOSAI fixture",base_url="{base}/v1",'
                    'wire_api="responses",requires_openai_auth=false,request_max_retries=0,stream_max_retries=0}'
                )
                args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--json',
                        '--sandbox', 'read-only', '-m', 'gpt-5.2', '-c', 'approval_policy="never"',
                        '-c', 'model_provider="dosai_fixture"', '-c', fixture,
                        '-c', 'web_search="disabled"', '-c', 'mcp_servers={}']
                for feature in ('shell_tool', 'unified_exec', 'unified_exec_tty', 'hooks', 'plugins', 'apps',
                                'multi_agent', 'multi_agent_v2', 'image_generation', 'goals', 'view_image', 'default_mode_request_user_input'):
                    args += ['--disable', feature]
            else:
                env.update(CLAUDE_CONFIG_DIR=str(scratch), CLAUDE_CODE_TMPDIR=str(scratch), ANTHROPIC_BASE_URL=base,
                           ANTHROPIC_AUTH_TOKEN='DOSAI_LOCAL_FIXTURE_ONLY',
                           CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1',
                           DISABLE_AUTOUPDATER='1')
                args = ['-p', '--safe-mode', '--restricted', '--tools', '', '--strict-mcp-config',
                        '--no-chrome', '--no-session-persistence', '--permission-prompts', 'none', '--output-format', 'json']
            args += ['Classify this synthetic fixture as ready or pending. No project files.']
            proc = subprocess.Popen([SANDBOX, '-p', profile(binary, scratch, sink.server_port), str(binary), *args],
                                    cwd=scratch, env=env, stdin=subprocess.DEVNULL,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(32):
                if sink.received.wait(0.25) or proc.poll() is not None:
                    break
            pending = proc.poll() is None
            if pending:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=3)
            if sink.received.is_set():
                sink.finished.wait(3)

            return {'worker': name, 'fence_canaries': 'PASS', 'catalog': sink.catalog,
                    'tools_field_present': sink.tools_field_present, 'pending_at_stop': pending,
                    'exit_code': proc.returncode, 'live_launch_permitted': False,
                    'connection_closed': sink.disconnected, 'sink_error': sink.failed}
        finally:
            if proc is not None and proc.poll() is None:
                proc.kill()
                proc.wait(timeout=3)
            sink.shutdown()
            reader.join(timeout=3)

def pinned_path(argument, pin):
    path = Path(argument)
    if not path.is_absolute():
        raise ValueError()
    path = path.resolve(strict=True)
    filename, size, expected = pin
    info = path.stat()
    if path.name != filename or not stat.S_ISREG(info.st_mode) or info.st_size != size:
        raise ValueError()
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise ValueError()
    return path


def main(arguments):
    if sys.platform != 'darwin' or platform.machine() != 'arm64' or len(arguments) != 3:
        raise ValueError()
    codex, claude, node = [pinned_path(path, identity) for path, identity in zip(arguments, PINS)]
    complete = True
    with tempfile.TemporaryDirectory(prefix='dosai-fixture-', dir='/private/tmp') as directory:
        root = Path(directory)
        canary = root / 'outside.txt'
        canary.write_text('synthetic')
        for name, binary in (('codex', codex), ('claude', claude)):
            scratch = root / name
            scratch.mkdir(mode=0o700)
            result = run(name, binary, scratch, canary, node)
            print(json.dumps(result), flush=True)
            complete &= (result['catalog'] is not None and result['pending_at_stop']
                         and result['connection_closed'] and not result['sink_error'])
    return 0 if complete else 2


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except (OSError, ValueError, subprocess.SubprocessError):
        sys.exit('Offline probe stopped. Check the pinned binaries and the local fence.')
