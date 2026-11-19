"""Regression checks for the fixed startup protocol and profile admission."""

import contextlib
import importlib.util
import io
from pathlib import Path
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


if __name__ == '__main__':
    unittest.main()
