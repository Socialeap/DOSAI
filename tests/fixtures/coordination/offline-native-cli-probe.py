"""Bounded offline probes for pinned native CLIs with no upstream or live launch."""

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
            if b'Classify this synthetic fixture' not in raw and not self.server.received.is_set():
                raise ValueError()
            self.handle_fixture(json.loads(raw))
        except (ValueError, TypeError, AttributeError, OSError):
            self.server.failed = True
            self.server.finished.set()

    def observe_catalog(self, body):
        if self.server.received.is_set():
            raise ValueError()
        tools = body.get('tools', [])
        if not isinstance(tools, list) or len(tools) > 100:
            raise ValueError()
        names = [item.get('name') or item.get('type') for item in tools]
        if not all(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', name) for name in names):
            raise ValueError()
        self.server.catalog = names
        self.server.tools_field_present = 'tools' in body
        self.server.received.set()

    def handle_fixture(self, body):
        self.observe_catalog(body)
        self.server.disconnected = not self.connection.recv(1)
        self.server.finished.set()


class InputDenialSink(Sink):
    """Send one harmless synthetic question, then stop at the tool result."""

    call_id = 'call_dosai_fixture'
    response_id = 'resp_dosai_fixture'

    def handle_fixture(self, body):
        if not self.server.received.is_set():
            self.observe_catalog(body)
            if self.server.catalog != ['request_user_input']:
                raise ValueError()
            question = {
                'id': 'fixture-label', 'header': 'Fixture', 'question': 'Which synthetic label?',
                'options': [
                    {'label': 'Ready', 'description': 'Choose ready.'},
                    {'label': 'Pending', 'description': 'Choose pending.'},
                ],
            }
            events = [
                {'type': 'response.created', 'response': {'id': self.response_id}},
                {'type': 'response.output_item.done', 'item': {
                    'id': 'fc_dosai_fixture', 'type': 'function_call', 'call_id': self.call_id,
                    'name': 'request_user_input', 'arguments': json.dumps({'questions': [question]}),
                }},
                {'type': 'response.completed', 'response': {'id': self.response_id, 'usage': {
                    'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2,
                }}},
            ]
            data = ''.join(f"event: {event['type']}\ndata: {json.dumps(event)}\n\n" for event in events).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if self.server.finished.is_set():
            raise ValueError()
        outputs = [item.get('output') for item in body.get('input', [])
                   if item.get('type') == 'function_call_output' and item.get('call_id') == self.call_id]
        self.server.input_denied = outputs == ['request_user_input is unavailable in Default mode']
        # The fixture never supplies a subsequent model response or accepts an answer.
        self.send_error(400)
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

def run(name, binary, scratch, canary, node, *, input_denial=False):
    handler = InputDenialSink if input_denial else Sink
    with http.server.HTTPServer(('127.0.0.1', 0), handler) as sink:
        prefix = '/' + secrets.token_hex(16)
        sink.path = prefix + ('/v1/responses' if name == 'codex' else '/v1/messages')
        sink.received = threading.Event()
        sink.finished = threading.Event()
        sink.catalog = None
        sink.tools_field_present = None
        sink.disconnected = False
        sink.failed = False
        sink.input_denied = False
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
            if input_denial:
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    pass
            else:
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

            if input_denial:
                return {'worker': name, 'fence_canaries': 'PASS', 'catalog': sink.catalog,
                        'input_denied': sink.input_denied and not sink.failed,
                        'timed_out': pending, 'exit_code': proc.returncode,
                        'live_launch_permitted': False}
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
    if sys.platform != 'darwin' or platform.machine() != 'arm64':
        raise ValueError()
    input_denial = arguments[:1] == ['--input-denial']
    if len(arguments) != 3:
        raise ValueError()
    if input_denial:
        clients = [('codex', pinned_path(arguments[1], PINS[0]))]
    else:
        clients = [(name, pinned_path(argument, pin))
                   for name, argument, pin in zip(('codex', 'claude'), arguments, PINS)]
    node = pinned_path(arguments[-1], PINS[2])
    complete = True
    with tempfile.TemporaryDirectory(prefix='dosai-fixture-', dir='/private/tmp') as directory:
        root = Path(directory)
        canary = root / 'outside.txt'
        canary.write_text('synthetic')
        for name, binary in clients:
            scratch = root / name
            scratch.mkdir(mode=0o700)
            result = run(name, binary, scratch, canary, node, input_denial=input_denial)
            print(json.dumps(result), flush=True)
            if input_denial:
                return 0 if result['input_denied'] and not result['timed_out'] and result['exit_code'] == 1 else 2
            complete &= (result['catalog'] is not None and result['pending_at_stop']
                         and result['connection_closed'] and not result['sink_error'])
    return 0 if complete else 2


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except (OSError, ValueError, subprocess.SubprocessError):
        sys.exit('Offline probe stopped. Check the pinned binaries and the local fence.')
