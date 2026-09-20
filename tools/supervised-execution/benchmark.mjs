import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createLocalFixtureSession } from './runtime.mjs';
import { createEvidenceDirectory } from './evidence-directory.ts';

if (process.version !== 'v24.18.0') throw new Error('PINNED_RUNTIME_REQUIRED');

// Automated fixtures use synthetic confirmations, never physical-owner or provider authority.
const directory = await createEvidenceDirectory(resolve(import.meta.dirname, '../..'), 'execution-benchmark-');
const samples = [];
for (let index = 0; index < 10; index++) {
  const start = performance.now();
  const engine = await createLocalFixtureSession(join(directory, `sample-${index}.sqlite3`));
  const ready = performance.now();
  const plan = engine.prepare({ version: 1, action: index % 2 === 0 ? 'SUMMARIZE_FIXTURE' : 'LIST_FIXTURE_FAILURES',
    fixture: 'beta-core-v1', generation: '1' });
  const receipt = plan.status === 'AWAITING_APPROVAL' ? engine.run(plan, plan.approvalInstruction) : plan;
  const end = performance.now();
  samples.push({ setupMs: ready - start, governedFixtureMs: end - ready, totalMs: end - start,
    status: receipt.body.status, audit: receipt.audit });
}
const percentile = (key, fraction) => {
  const sorted = samples.map(sample => sample[key]).sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
};
const report = {
  version: 1, mode: 'AUTOMATED_SYNTHETIC_FIXTURES', samples: samples.length,
  runtime: process.version, platform: process.platform, architecture: process.arch,
  succeeded: samples.filter(sample => sample.status === 'SUCCEEDED' && sample.audit === 'LOCAL_DURABLE').length,
  setupMs: { p50: percentile('setupMs', 0.5), p95: percentile('setupMs', 0.95) },
  governedFixtureMs: { p50: percentile('governedFixtureMs', 0.5), p95: percentile('governedFixtureMs', 0.95) },
  totalMs: { p50: percentile('totalMs', 0.5), p95: percentile('totalMs', 0.95) },
  externalCalls: 0, modelCalls: 0, providerSpend: 0,
  improvementVersusProvider: 'UNMEASURED', humanApprovalLatency: 'EXCLUDED',
  limitations: ['10_LOCAL_SAMPLES_ONLY', 'NO_PROVIDER_COMPARISON', 'NO_BETA_RELIABILITY_INFERENCE', 'NO_PHYSICAL_OWNER_APPROVAL'],
  observations: samples,
};
await writeFile(join(directory, 'benchmark.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
console.log(`Local evidence: ${directory}`);
process.exitCode = report.succeeded === samples.length ? 0 : 1;
