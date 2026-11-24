"""Source-only Hydrogen review adapter. The offline harness supplies the SDK API."""

import json


MODEL = "gemini-4-hydrogen"
MAX_OUTPUT_BYTES = 16 * 1024
MAX_CHUNKS = 256
FINDINGS = ["missing_validation", "no_issue"]
EXPECTED_REQUEST = {
    "mode": "offline-fixture",
    "model": MODEL,
    "prompt": (
        "As review specialist, compare the observed and expected behavior. Choose one finding.\n"
        'Synthetic data: {"suppliedInput":"","expected":"reject empty input","observed":"accepted"}'
    ),
    "schema": {
        "type": "object",
        "properties": {"finding": {"type": "string", "enum": FINDINGS}},
        "required": ["finding"],
        "additionalProperties": False,
    },
}


async def review_fixture(request, *, sdk, deny):
    """Translate the fixed fixture into one SDK turn and return bounded raw JSON bytes."""
    if type(request) is not dict or request != EXPECTED_REQUEST:
        raise ValueError("Antigravity fixture request rejected.")
    config = sdk.LocalAgentConfig(
        model=MODEL,
        vertex=False,
        capabilities=sdk.CapabilitiesConfig(enabled_tools=[], enable_subagents=False),
        policies=[deny("*")],
        tools=[],
        mcp_servers=[],
        skills_paths=[],
        inline_skills=[],
        subagents=[],
        hooks=[],
        triggers=[],
        workspaces=[],
        retry_config=sdk.RetryConfig(
            api_retry=sdk.ModelAPIRetryConfig(max_retries=0),
            model_output_retry=sdk.ModelOutputRetryConfig(max_retries=0),
        ),
    )
    prompt = (
        EXPECTED_REQUEST["prompt"] + "\nReturn exactly one JSON object with this schema: "
        + json.dumps(EXPECTED_REQUEST["schema"], separators=(",", ":"))
    )
    output = bytearray()
    # Consume text only. The DOSAI broker validates the closed finding schema.
    async with sdk.Agent(config) as agent:
        response = await agent.chat(prompt)
        count = 0
        async for chunk in response:
            count += 1
            if type(chunk) is not str or count > MAX_CHUNKS or len(chunk) > MAX_OUTPUT_BYTES - len(output):
                raise ValueError("Antigravity fixture response exceeded its bound.")
            data = chunk.encode("utf-8")
            if len(data) > MAX_OUTPUT_BYTES - len(output):
                raise ValueError("Antigravity fixture response exceeded its bound.")
            output.extend(data)
    if not output:
        raise ValueError("Antigravity fixture response was empty.")
    return bytes(output)
