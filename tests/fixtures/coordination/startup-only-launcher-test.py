"""Regression checks for the fixed startup protocol and profile admission."""

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch


SOURCE = Path(__file__).resolve().parents[3] / 'tools/local-coordination-pilot/startup-only-launcher.py'
spec = importlib.util.spec_from_file_location('startup_launcher', SOURCE)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class StartupLauncherTest(unittest.TestCase):
    def test_codex_uses_native_status_without_an_app_server_account_request(self):
        child = object()
        with patch.object(launcher, 'codex_auth', return_value='CHATGPT'), \
                patch.object(launcher, 'scoped_process', return_value=contextlib.nullcontext(child)), \
                patch.object(launcher, 'read_messages', return_value=({'id': 1, 'result': {}} for _ in range(1))), \
                patch.object(launcher, 'send') as send, patch.object(launcher, 'cancel_ready') as cancel:
            self.assertEqual(launcher.codex_startup('/pinned/codex', Path('/isolated')), 'CHATGPT')
        self.assertEqual([call.args[1]['method'] for call in send.call_args_list], ['initialize', 'initialized'])
        cancel.assert_called_once()

    def test_codex_classifies_only_exact_native_status_labels(self):
        for code, output, expected in [
            (0, [b'warning', b'Logged in using ChatGPT'], 'CHATGPT'),
            (1, [b'Not logged in'], 'SIGNED_OUT'),
            (0, [b'Logged in using an API key'], None),
            (0, [b'prefix Logged in using ChatGPT suffix'], None),
            (0, [b'Logged in using ChatGPT', b'Not logged in'], None),
        ]:
            with self.subTest(code=code, expected=expected):
                child = Mock()
                child.wait.return_value = code
                with patch.object(launcher, 'scoped_process', return_value=contextlib.nullcontext(child)) as spawn, \
                        patch.object(launcher, 'read_messages', return_value=iter([output])):
                    if expected is None:
                        with self.assertRaises(launcher.Hold):
                            launcher.codex_auth('/pinned/codex', Path('/isolated'))
                    else:
                        self.assertEqual(launcher.codex_auth('/pinned/codex', Path('/isolated')), expected)
                self.assertTrue(spawn.call_args.kwargs['status_on_stderr'])
                self.assertEqual(spawn.call_args.args[-1][-2:], ['login', 'status'])

    def test_claude_sends_only_initialize_and_cancels_the_matching_peer(self):
        class Child:
            pid = 42

        child = Child()
        event = {'type': 'control_response', 'response': {
            'request_id': 'dosai-startup-only', 'subtype': 'success', 'response': {'pid': child.pid}}}
        with patch.object(launcher, 'claude_auth', return_value='CLAUDE_SUBSCRIPTION'), \
                patch.object(launcher, 'scoped_process', return_value=contextlib.nullcontext(child)), \
                patch.object(launcher, 'read_messages', return_value=(row for row in [event])), \
                patch.object(launcher, 'send') as send, patch.object(launcher, 'cancel_ready') as cancel:
            self.assertEqual(launcher.claude_startup('/pinned/claude', Path('/isolated')), 'CLAUDE_SUBSCRIPTION')
        send.assert_called_once_with(child, {'type': 'control_request', 'request_id': 'dosai-startup-only',
                                             'request': {'subtype': 'initialize'}})
        cancel.assert_called_once()

    def test_claude_rejects_another_process_claiming_readiness(self):
        class Child:
            pid = 42

        event = {'type': 'control_response', 'response': {
            'request_id': 'dosai-startup-only', 'subtype': 'success', 'response': {'pid': 43}}}
        with patch.object(launcher, 'claude_auth', return_value='CLAUDE_SUBSCRIPTION'), \
                patch.object(launcher, 'scoped_process', return_value=contextlib.nullcontext(Child())), \
                patch.object(launcher, 'read_messages', return_value=(row for row in [event])), \
                patch.object(launcher, 'send'), patch.object(launcher, 'cancel_ready') as cancel:
            with self.assertRaises(launcher.Hold):
                launcher.claude_startup('/pinned/claude', Path('/isolated'))
        cancel.assert_not_called()

    def test_signed_out_cannot_pass_the_signed_in_gate(self):
        receipt = io.StringIO()
        with patch.object(launcher, 'validate_profile'), patch.object(launcher, 'validate_credential_metadata'), \
                patch.object(launcher, 'verify_fence'), \
                patch.object(launcher, 'codex_startup', return_value='CHATGPT'), \
                patch.object(launcher, 'claude_startup', return_value='SIGNED_OUT'), \
                contextlib.redirect_stdout(receipt):
            self.assertEqual(launcher.verify(Path('/isolated'), (None, None, None), rehearsal=False), 2)
        self.assertIn('"live_launch_permitted": false', receipt.getvalue())
        self.assertIn('"status": "HOLD"', receipt.getvalue())

    def test_profile_admission_rejects_symlinked_credentials_and_workspace_content(self):
        with tempfile.TemporaryDirectory(prefix='dosai-startup-', dir=launcher.PILOT) as name:
            root = Path(name)
            launcher.prepare(root)
            launcher.validate_profile(root)
            credential = root / 'codex/config/auth.json'
            credential.symlink_to('/dev/null')
            with self.assertRaises(launcher.Hold):
                launcher.validate_credential_metadata(root)
            (root / 'claude/work/not-empty').touch()
            with self.assertRaises(launcher.Hold):
                launcher.validate_profile(root)

    def test_duplicate_early_metadata_fields_fail_closed(self):
        with self.assertRaises(launcher.Hold):
            launcher.unique_json([('account', None), ('account', {})])

    def test_app_server_startup_only_uses_two_methods_and_checks_reaped_group(self):
        with tempfile.TemporaryDirectory(dir=launcher.PILOT) as name:
            home = Path(name)
            (home / 'config').mkdir()
            child = Mock(pid=42)
            reply = {'id': 1, 'result': {'userAgent': 'codex-app-server/0.172.0'}}
            with patch.object(launcher, 'scoped_process', return_value=contextlib.nullcontext(child)) as spawn, \
                    patch.object(launcher, 'read_messages', return_value=(row for row in [reply])), \
                    patch.object(launcher.os, 'getpgid', return_value=42), \
                    patch.object(launcher, 'send') as send, patch.object(launcher, 'cancel_ready') as cancel, \
                    patch.object(launcher, 'require_group_absent') as absent:
                launcher.app_server_startup(Path('/fixture/app-server'), home)
        self.assertEqual([call.args[1]['method'] for call in send.call_args_list], ['initialize', 'initialized'])
        self.assertIs(spawn.call_args.kwargs['profile'], launcher.app_server_profile)
        self.assertIs(spawn.call_args.kwargs['own_session'], True)
        cancel.assert_called_once_with(child, Path('/fixture/app-server'), (0, -launcher.signal.SIGTERM))
        absent.assert_called_once_with(child.pid)

    def test_app_server_missing_scope_or_malformed_handshake_cannot_pass(self):
        for group, reply in [
            (18, {'id': 1, 'result': {'userAgent': 'fixture'}}),
            (42, {'id': True, 'result': {'userAgent': 'fixture'}}),
            (42, {'id': 1, 'method': 'item/tool/requestUserInput', 'result': {'userAgent': 'fixture'}}),
            (42, {'id': 1, 'result': {}}),
            (42, None),
        ]:
            with self.subTest(group=group, reply=reply), tempfile.TemporaryDirectory(dir=launcher.PILOT) as name:
                home = Path(name)
                (home / 'config').mkdir()
                child = Mock(pid=42)
                with patch.object(launcher, 'scoped_process', return_value=contextlib.nullcontext(child)), \
                        patch.object(launcher, 'read_messages', return_value=(row for row in [reply])), \
                        patch.object(launcher.os, 'getpgid', return_value=group), \
                        patch.object(launcher, 'send') as send, patch.object(launcher, 'cancel_ready') as cancel:
                    with self.assertRaises(launcher.Hold):
                        launcher.app_server_startup(Path('/fixture/app-server'), home)
                    self.assertLessEqual(send.call_count, 1)
                    cancel.assert_not_called()

    def test_app_server_fails_closed_on_signature_and_canary_failure(self):
        for blocked in ('verify_app_server_signer', 'verify_app_server_fence'):
            with self.subTest(blocked=blocked), \
                    patch.object(launcher, 'stage_pinned_executable', return_value=Path('/fixture/executable')), \
                    patch.object(launcher, 'verify_app_server_signer'), \
                    patch.object(launcher, 'verify_app_server_fence'), \
                    patch.object(launcher, blocked, side_effect=launcher.Hold('Denied')), \
                    patch.object(launcher, 'app_server_startup') as launch, \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                with self.assertRaises(launcher.Hold):
                    launcher.verify_app_server_startup('/fixture/app-server', '/fixture/node')
                launch.assert_not_called()
                self.assertEqual(output.getvalue(), '')

    def test_staging_rechecks_the_bytes_after_copy(self):
        with tempfile.TemporaryDirectory(dir=launcher.PILOT) as name:
            root = Path(name)
            source = root / 'binary'
            source.write_bytes(b'pinned')
            stage = root / 'stage'
            stage.mkdir()
            pin = ('binary', 6, hashlib.sha256(b'pinned').hexdigest())
            staged = launcher.stage_pinned_executable(str(source), stage, pin)
            self.assertEqual(staged.read_bytes(), b'pinned')
            self.assertEqual(staged.stat().st_mode & 0o777, 0o500)

            def corrupt(_source, destination):
                destination.chmod(0o600)
                destination.write_bytes(b'forged')

            with patch.object(launcher.shutil, 'copyfile', side_effect=corrupt):
                with self.assertRaises(launcher.Hold):
                    launcher.stage_pinned_executable(str(source), stage, pin)

    def test_app_server_reports_only_no_model_startup_after_cleanup(self):
        def stage(_source, root, pin):
            roots.add(root)
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)
            return root / pin[0]

        roots = set()
        with patch.object(launcher, 'stage_pinned_executable', side_effect=stage), \
                patch.object(launcher, 'verify_app_server_signer'), \
                patch.object(launcher, 'verify_app_server_fence'), \
                patch.object(launcher, 'app_server_startup'), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(launcher.verify_app_server_startup('/fixture/app-server', '/fixture/node'), 0)
        receipt = json.loads(output.getvalue())
        self.assertEqual(receipt['scope'], 'STARTUP_ONLY')
        self.assertEqual(receipt['inference_requests'], 0)
        self.assertIs(receipt['live_launch_permitted'], False)
        self.assertIs(receipt['credential_file_absent'], True)
        self.assertEqual(len(roots), 1)
        self.assertFalse(next(iter(roots)).exists())

    def test_existence_probe_never_signals_an_owned_group(self):
        with patch.object(launcher.os, 'killpg', side_effect=ProcessLookupError) as probe:
            launcher.require_group_absent(42)
            probe.assert_called_once_with(42, 0)
        with patch.object(launcher.os, 'killpg') as probe:
            with self.assertRaises(launcher.Hold):
                launcher.require_group_absent(42)
            probe.assert_called_once_with(42, 0)

    def test_cleanup_kills_only_the_owned_child_and_closes_pipes_on_timeout(self):
        child = Mock()
        child.poll.return_value = None
        child.wait.side_effect = subprocess.TimeoutExpired('fixture', 3)
        with patch.object(launcher.subprocess, 'Popen', return_value=child) as spawn:
            with self.assertRaises(subprocess.TimeoutExpired):
                with launcher.scoped_process(Path('/fixture/bin'), 'codex', Path('/fixture/home'), [],
                                             profile=launcher.app_server_profile, own_session=True):
                    pass
        spawn.assert_called_once()
        self.assertEqual(set(spawn.call_args.kwargs['env']), {'HOME', 'TMPDIR', 'PATH', 'CODEX_HOME'})
        child.kill.assert_called_once_with()
        child.wait.assert_called_once_with(timeout=3)
        child.stdin.close.assert_called_once_with()
        child.stdout.close.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
