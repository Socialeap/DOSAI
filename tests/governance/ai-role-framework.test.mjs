import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const paths = {
  agents: resolve(root, 'AGENTS.md'),
  readme: resolve(root, 'README.md'),
  registry: resolve(root, 'docs/development/ai-roles/README.md'),
  technicalPeer: resolve(
    root,
    'docs/development/ai-roles/technical-peer-reviewer-v1.md',
  ),
  assignments: resolve(root, 'docs/development/ai-roles/assignments.md'),
};

async function loadFramework() {
  const [agents, readme, registry, technicalPeer, assignments] = await Promise.all(
    Object.values(paths).map((path) => readFile(path, 'utf8')),
  );
  return { agents, readme, registry, technicalPeer, assignments };
}

test('root initialization discovers the role registry after governing sources', async () => {
  const { agents, readme } = await loadFramework();
  const expectedOrder = [
    'SECURITY.md',
    'docs/product/dosai-specification-v2.md',
    'docs/decisions/README.md',
    'docs/development/live-development-plan.md',
    'docs/development/ai-roles/README.md',
    'Identify the explicitly assigned role ID',
    'selected model-independent role definition',
    'docs/development/ai-roles/assignments.md',
    'Adopt the role only after the definition and current assignment agree',
  ];
  let previous = -1;
  for (const source of expectedOrder) {
    const index = agents.indexOf(source);
    assert.ok(index > previous, `${source} must appear in initialization order`);
    previous = index;
  }
  assert.match(agents, /Do not infer a specialized role/);
  assert.match(agents, /separate, replaceable record/);
  assert.match(agents, /never grants tool,/);
  assert.match(readme, /\[AI agent initialization\]\(AGENTS\.md\)/);
  assert.match(
    readme,
    /\[AI role registry\]\(docs\/development\/ai-roles\/README\.md\)/,
  );
  assert.match(
    readme,
    /\[Technical Peer Reviewer v1\]\(docs\/development\/ai-roles\/technical-peer-reviewer-v1\.md\)/,
  );
});

test('registry separates model-independent roles from assignments', async () => {
  const { registry } = await loadFramework();
  for (const heading of [
    '## Purpose',
    '## Initialization Order',
    '## Role Selection',
    '## Authority Hierarchy',
    '## Role Catalog',
    '## Assignment Record',
    '## Planned Role Slots',
    '## Role Definition Contract',
    '## Interaction Protocol',
    '## Adding A Role',
  ]) {
    assert.ok(registry.includes(heading), `missing registry heading: ${heading}`);
  }
  assert.match(registry, /`technical-peer-reviewer` \| Technical Peer Reviewer \| 1/);
  assert.match(
    registry,
    /\[Technical Peer Reviewer v1\]\(technical-peer-reviewer-v1\.md\)/,
  );
  assert.match(registry, /\[the assignment record\]\(assignments\.md\)/);
  assert.doesNotMatch(registry, /Big Pickle|OpenRouter|Claude|Codex|Gemini|Antigravity/);
  for (const role of [
    'primary-implementation-engineer',
    'secondary-implementation-engineer',
    'architect',
    'workflow-orchestrator',
    'prompt-engineer',
    'qa-reviewer',
    'documentation-reviewer',
  ]) {
    assert.ok(registry.includes(`\`${role}\``), `missing planned role: ${role}`);
  }
  assert.match(registry, /does not require changing any existing role definition/);
  assert.match(
    registry,
    /Replacing a model or platform changes only the\s+assignment record/,
  );
});

test('Technical Peer Reviewer contains the complete model-independent contract', async () => {
  const { technicalPeer } = await loadFramework();
  assert.match(technicalPeer, /\*\*Role ID:\*\* `technical-peer-reviewer`/);
  assert.match(technicalPeer, /\*\*Version:\*\* 1/);
  assert.match(technicalPeer, /\*\*Authority class:\*\* `ADVISORY_REVIEW_ONLY`/);
  for (const heading of [
    '## Purpose',
    '## Responsibilities',
    '## Authority',
    '## Confidence Model',
    '## Review Methodology',
    '## Decision Boundaries',
    '## Expected Inputs',
    '## Expected Outputs',
    '## Interaction Rules',
    '## Required Review Format',
    '## Implementation Handoff Specification',
    '## Success Criteria',
  ]) {
    assert.ok(technicalPeer.includes(heading), `missing role heading: ${heading}`);
  }
  assert.match(technicalPeer, /risk and ripple effects/);
  assert.match(technicalPeer, /Identify simpler alternatives/);
  assert.doesNotMatch(technicalPeer, /Big Pickle|OpenRouter/);
});

test('Technical Peer Reviewer remains advisory and produces reproducible handoffs', async () => {
  const { technicalPeer } = await loadFramework();
  for (const boundary of [
    'cannot:',
    'accept or reject an ADR',
    'merge, push, publish, deploy',
    'Implementation requires a separate explicit task or role transition',
  ]) {
    assert.ok(technicalPeer.includes(boundary), `missing authority boundary: ${boundary}`);
  }
  for (const confidence of ['VERIFIED', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']) {
    assert.ok(
      technicalPeer.includes(`\`${confidence}\``),
      `missing confidence label: ${confidence}`,
    );
  }
  for (const reviewField of [
    'BP-###',
    'why and how the fault occurs',
    'validation needed to close the finding',
    'exact in-scope components and explicit do-not-change boundaries',
    'completion criteria that another reviewer can independently verify',
  ]) {
    assert.ok(technicalPeer.includes(reviewField), `missing review field: ${reviewField}`);
  }
});

test('Technical Peer Reviewer requires owner-first explanation and advisory follow-up prompts', async () => {
  const { technicalPeer, registry, agents } = await loadFramework();
  for (const requirement of [
    'mandatory first-stage plain-English interpretation for every review',
    '## Plain-English Interpretation',
    'what the engineering AI is proposing',
    'what problem it is trying to solve',
    'why it recommends that approach',
    'the practical effect on DOSAI and its operator',
    'Avoid jargon wherever practical',
    'before the technical assessment',
    'repository evidence,\n   governing documentation, accepted architecture, current implementation\n   patterns, task scope, and regression risk',
    '## Advisory Engineering Follow-Up Prompt',
    'explicitly advisory and non-authoritative',
    'target role or platform, when known',
    'regression or ripple-effect risks',
    'No engineering follow-up prompt is necessary.',
  ]) {
    assert.ok(technicalPeer.includes(requirement), `missing reviewer requirement: ${requirement}`);
  }
  for (const heading of [
    '1. **Plain-English Explanation:**',
    '2. **Technical Assessment:**',
    '3. **Evidence and Confidence Classification:**',
    '4. **Risks and Opportunities:**',
    '5. **Simpler Alternative Assessment:**',
    '6. **Recommendation:**',
    '7. **Copy-and-Paste Engineering Follow-Up Prompt:**',
  ]) {
    assert.ok(technicalPeer.includes(heading), `missing review format section: ${heading}`);
  }
  assert.match(technicalPeer, /cannot approve implementation, compel a change, alter\naccepted architecture, merge, deploy, or override the repository owner/);
  assert.match(registry, /plain-English explanation\n  before technical assessment/);
  assert.doesNotMatch(agents, /Advisory Engineering Follow-Up Prompt/);
});

test('current model assignment is replaceable and the only Big Pickle reference', async () => {
  const { assignments, agents, registry, technicalPeer } = await loadFramework();
  assert.match(
    assignments,
    /\| Role ID \| Current assigned model or platform \| Assignment status \| Fallback or alternate model \|/,
  );
  assert.match(assignments, /`technical-peer-reviewer` \| Big Pickle via OpenRouter \| `CURRENT`/);
  assert.match(assignments, /Replace the current model or platform and fallback fields in this record only/);
  assert.doesNotMatch(assignments, /Big Pickle Reviewer/);
  assert.doesNotMatch(agents, /Big Pickle/);
  assert.doesNotMatch(registry, /Big Pickle/);
  assert.doesNotMatch(technicalPeer, /Big Pickle/);
});

test('no obsolete model-specific role definition remains', async () => {
  const files = await readdir(resolve(root, 'docs/development/ai-roles'));
  assert.ok(files.includes('technical-peer-reviewer-v1.md'));
  assert.ok(files.includes('assignments.md'));
  assert.ok(!files.includes('big-pickle-reviewer-v1.md'));
});
