import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectNativeReview } from '../../tools/local-coordination-pilot/native-review-preflight.mjs';

function observation() {
  return {
    codex: {
      version: 'codex-cli 0.169.0-alpha.11.1\n',
      sha256: '3ea20787e106af94573d3d6c19480aed93a1334b0dd32b6b04e2f780ce82cf4b',
      help: '  --disable <FEATURE>\n  -s, --sandbox <MODE>\n  --ephemeral\n  --ignore-user-config\n  --output-schema <FILE>\n  --json\n',
      features: 'shell_tool  stable  false\nunified_exec  stable  true\nunified_exec_tty  stable  false\n' +
        'hooks  stable  false\nplugins  stable  false\napps  stable  false\nmulti_agent  deprecated  false\n',
    },
    claude: {
      version: '2.1.314 (Claude Code)\n',
      sha256: '21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed',
      help: '  --restricted\n  --safe-mode\n  --tools <tools...>\n  --disallowedTools, --disallowed-tools <tools...>\n' +
        '  --strict-mcp-config\n  --no-session-persistence\n  --no-chrome\n  --permission-prompts <target>\n' +
        '  --json-schema <schema>\n  --output-format <format>\n',
    },
  };
}

test('the observed unified execution discrepancy keeps live launch held', () => {
  const verdict = inspectNativeReview(observation());
  assert.equal(verdict.status, 'HOLD');
  assert.equal(verdict.liveLaunchPermitted, false);
  assert.deepEqual(verdict.clients.codex, {
    identityMatches: true, missingHelpFlags: [], reportedEnabledFeatures: ['unified_exec'], missingFeatureRows: [],
  });
  assert.deepEqual(verdict.clients.claude, { identityMatches: true, missingHelpFlags: [] });
  assert.ok(verdict.blockers.includes('CODEX_FEATURES_REPORTED_ENABLED'));
});

test('even matching identities and all switches reported off confer no live authority', () => {
  const input = observation();
  input.codex.features = input.codex.features.replace('true', 'false');
  const verdict = inspectNativeReview(input);
  assert.equal(verdict.liveLaunchPermitted, false);
  assert.deepEqual(verdict.blockers, [
    'EFFECTIVE_TOOL_AND_PROCESS_BOUNDARY_UNVERIFIED',
    'INCLUDED_ONLY_USAGE_UNVERIFIED',
    'FRESH_LOCAL_APPROVAL_REQUIRED',
  ]);
  assert.throws(() => inspectNativeReview({ ...input, approved: true }), /Expected two CLI observations/);
});

test('identity drift, absent help declarations, and incomplete feature output are identified', () => {
  const input = observation();
  input.codex.sha256 = 'a'.repeat(64);
  input.codex.features = 'shell_tool stable false';
  input.claude.help = input.claude.help.replace('  --restricted', '    description mentions --restricted');
  const verdict = inspectNativeReview(input);
  assert.ok(verdict.blockers.includes('CODEX_IDENTITY_DRIFT'));
  assert.ok(verdict.blockers.includes('CODEX_FEATURE_OBSERVATION_INCOMPLETE'));
  assert.deepEqual(verdict.clients.claude.missingHelpFlags, ['restricted']);
});

test('repeated or malformed feature rows and oversized observations fail closed', () => {
  for (const row of ['unified_exec stable false', 'shell_tool stable unknown']) {
    const input = observation();
    input.codex.features += row + '\n';
    assert.throws(() => inspectNativeReview(input), /Invalid Codex feature observation/);
  }
  const input = observation();
  input.claude.help = 'x'.repeat(65537);
  assert.throws(() => inspectNativeReview(input), /Invalid CLI observation fields/);
});
