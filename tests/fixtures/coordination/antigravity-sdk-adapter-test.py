"""Exercise the source-only SDK mapping with a simulated Antigravity client."""

import asyncio
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "tools/local-coordination-pilot/antigravity-sdk-adapter.py"
SPEC = importlib.util.spec_from_file_location("antigravity_sdk_adapter", SOURCE)
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)


class SdkFixture:
    def __init__(self, chunks=('{"finding":', '"missing_validation"}')):
        self.chunks = chunks
        self.configurations = []
        self.prompts = []
        self.closed = 0

    def LocalAgentConfig(self, **config):
        self.configurations.append(config)
        return config

    CapabilitiesConfig = staticmethod(dict)
    RetryConfig = staticmethod(dict)
    ModelAPIRetryConfig = staticmethod(dict)
    ModelOutputRetryConfig = staticmethod(dict)

    def Agent(self, config):
        sdk = self

        class Agent:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                sdk.closed += 1

            async def chat(self, prompt):
                sdk.prompts.append(prompt)

                async def output():
                    for chunk in sdk.chunks:
                        yield chunk

                return output()

        return Agent()


def deny(pattern):
    return ("deny", pattern)


class AntigravitySdkAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_single_pinned_hydrogen_turn_disables_tools_and_retries(self):
        sdk = SdkFixture()
        result = await adapter.review_fixture(adapter.EXPECTED_REQUEST, sdk=sdk, deny=deny)
        self.assertEqual(result, b'{"finding":"missing_validation"}')
        self.assertEqual(len(sdk.prompts), 1)
        self.assertTrue(sdk.prompts[0].startswith(adapter.EXPECTED_REQUEST["prompt"]))
        self.assertEqual(sdk.configurations, [{
            "model": "gemini-4-hydrogen", "vertex": False,
            "capabilities": {"enabled_tools": [], "enable_subagents": False},
            "policies": [("deny", "*")], "tools": [], "mcp_servers": [], "skills_paths": [],
            "inline_skills": [], "subagents": [], "hooks": [], "triggers": [], "workspaces": [],
            "retry_config": {"api_retry": {"max_retries": 0}, "model_output_retry": {"max_retries": 0}},
        }])
        self.assertEqual(sdk.closed, 1)

    async def test_forged_model_prompt_schema_or_live_mode_stops_before_sdk_configuration(self):
        sdk = SdkFixture()
        for change in (
            {"model": "gemini-4-carbon"}, {"mode": "live"}, {"prompt": "Read my working tree."},
            {"schema": {}}, {"apiKey": "unexpected"}, {"workspaces": ["/repo"]},
        ):
            with self.subTest(change=change), self.assertRaises(ValueError):
                await adapter.review_fixture({**adapter.EXPECTED_REQUEST, **change}, sdk=sdk, deny=deny)
        changed = copy.deepcopy(adapter.EXPECTED_REQUEST)
        changed["schema"]["additionalProperties"] = True
        with self.assertRaises(ValueError):
            await adapter.review_fixture(changed, sdk=sdk, deny=deny)
        self.assertEqual(sdk.configurations, [])

    async def test_invalid_or_unbounded_stream_closes_fixture_session(self):
        for chunks in ([], [None], ["é" * (adapter.MAX_OUTPUT_BYTES // 2 + 1)],
                       [""] * (adapter.MAX_CHUNKS + 1)):
            with self.subTest(length=len(chunks)):
                sdk = SdkFixture(chunks)
                with self.assertRaises(ValueError):
                    await adapter.review_fixture(adapter.EXPECTED_REQUEST, sdk=sdk, deny=deny)
                self.assertEqual(sdk.closed, 1)
                self.assertEqual(len(sdk.prompts), 1)


if __name__ == "__main__":
    if sys.argv[1:] == ["--fixture-stdio"]:
        raw = sys.stdin.buffer.read(2049)
        if len(raw) > 2048:
            raise SystemExit(2)
        result = asyncio.run(adapter.review_fixture(json.loads(raw), sdk=SdkFixture(), deny=deny))
        sys.stdout.buffer.write(result)
    else:
        unittest.main()
