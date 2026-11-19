import { parseStrictJsonBytes } from '../../src/contracts/strict-json.ts';

const limit = 64 * 1024;
const observations = Object.freeze({
  codex: {
    version: 'codex-cli 0.169.0-alpha.11.1',
    sha256: '3ea20787e106af94573d3d6c19480aed93a1334b0dd32b6b04e2f780ce82cf4b',
    flags: ['disable', 'sandbox', 'ephemeral', 'ignore-user-config', 'output-schema', 'json'],
  },
  claude: {
    version: '2.1.314 (Claude Code)',
    sha256: '21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed',
    flags: ['restricted', 'safe-mode', 'tools', 'disallowedTools', 'strict-mcp-config',
      'no-session-persistence', 'no-chrome', 'permission-prompts', 'json-schema', 'output-format'],
  },
});
const codexFeatures = ['shell_tool', 'unified_exec', 'unified_exec_tty', 'hooks', 'plugins', 'apps', 'multi_agent'];

function exactKeys(record, keys) {
  return record !== null && typeof record === 'object' && !Array.isArray(record) &&
    Object.keys(record).length === keys.length && keys.every(key => Object.hasOwn(record, key));
}

function helpFlags(help) {
  return new Set([...help.matchAll(/^[ \t]+(?:-[a-zA-Z],\s+)?--([a-zA-Z][\w-]*)(?=[\s,]|$)/gm)]
    .map(match => match[1]));
}

function featureStates(source) {
  const states = new Map();
  for (const line of source.split('\n')) {
    const [name] = line.trim().split(/\s+/, 1);
    if (!codexFeatures.includes(name)) continue;
    const value = /^\s*\w+\s+[a-z][a-z ]+\s+(true|false)\s*$/.exec(line);
    if (!value || states.has(name)) throw new Error('Invalid Codex feature observation.');
    states.set(name, value[1] === 'true');
  }
  return states;
}

// Input is captured metadata in a disposable profile. It is not an attestation,
// a billing check, or authority to execute. No result from here can permit launch.
export function inspectNativeReview(input) {
  if (!exactKeys(input, ['codex', 'claude'])) throw new Error('Expected two CLI observations.');
  const blockers = [
    'EFFECTIVE_TOOL_AND_PROCESS_BOUNDARY_UNVERIFIED',
    'INCLUDED_ONLY_USAGE_UNVERIFIED',
    'FRESH_LOCAL_APPROVAL_REQUIRED',
  ];
  const clients = {};
  for (const [name, expected] of Object.entries(observations)) {
    const keys = name === 'codex' ? ['version', 'sha256', 'help', 'features'] : ['version', 'sha256', 'help'];
    const observed = input[name];
    if (!exactKeys(observed, keys) || keys.some(key =>
      typeof observed[key] !== 'string' || Buffer.byteLength(observed[key]) > limit)) {
      throw new Error('Invalid CLI observation fields.');
    }
    const identityMatches = observed.version.trim() === expected.version && observed.sha256 === expected.sha256;
    if (!identityMatches) blockers.push(`${name.toUpperCase()}_IDENTITY_DRIFT`);
    const flags = helpFlags(observed.help);
    const missingHelpFlags = expected.flags.filter(flag => !flags.has(flag));
    if (missingHelpFlags.length) blockers.push(`${name.toUpperCase()}_REQUIRED_HELP_FLAGS_MISSING`);
    clients[name] = { identityMatches, missingHelpFlags };
  }
  const states = featureStates(input.codex.features);
  clients.codex.reportedEnabledFeatures = codexFeatures.filter(name => states.get(name) === true);
  clients.codex.missingFeatureRows = codexFeatures.filter(name => !states.has(name));
  if (clients.codex.reportedEnabledFeatures.length) blockers.push('CODEX_FEATURES_REPORTED_ENABLED');
  if (clients.codex.missingFeatureRows.length) blockers.push('CODEX_FEATURE_OBSERVATION_INCOMPLETE');
  return { status: 'HOLD', liveLaunchPermitted: false, clients, blockers };
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 2) throw new Error('Unexpected arguments.');
    const chunks = [];
    let length = 0;
    for await (const bytes of process.stdin) {
      length += bytes.length;
      if (length > limit) throw new Error('Observation too large.');
      chunks.push(bytes);
    }
    const report = inspectNativeReview(parseStrictJsonBytes(Buffer.concat(chunks, length)));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
  } catch {
    console.error('Invalid native-review observation.');
    process.exitCode = 1;
  }
}
