import { DOSAI_REVIEW_SAMPLE, REVIEW_LANES, REVIEW_VERDICTS } from '../src/contracts/review-session.ts';
import { parseStrictJsonBytes } from '../src/contracts/strict-json.ts';

const MAX_SUMMARY_BYTES = 2048;
const REJECTED = 'DOSAI_REVIEW_SUMMARY_REJECTED';

function rejectSummary() {
  throw new Error(REJECTED);
}

function hasExactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function verifyReports(reports, expected) {
  if (!Array.isArray(reports) || reports.length !== REVIEW_LANES.length) rejectSummary();

  const seen = new Set();
  for (const report of reports) {
    if (!hasExactKeys(report, ['lane', 'reviewer', 'verdict', 'findings', 'provenance'])) rejectSummary();

    const { lane, reviewer, verdict, findings, provenance } = report;
    const assigned = lane === 'correctness' ? expected.correctness : expected.testCoverage;
    if (!REVIEW_LANES.includes(lane) || seen.has(lane) || reviewer !== assigned ||
        !REVIEW_VERDICTS.includes(verdict) || !Number.isSafeInteger(findings) || findings < 0 || findings > 99 ||
        (verdict === 'No findings' && findings !== 0) || (verdict === 'Findings' && findings === 0) ||
        provenance !== 'OPERATOR_RECORDED_UNVERIFIED') {
      rejectSummary();
    }
    seen.add(lane);
  }
}

export function verifyDesktopReviewSummary(bytes, expected) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_SUMMARY_BYTES) rejectSummary();

  let summary;
  try {
    summary = parseStrictJsonBytes(bytes);
  } catch {
    rejectSummary();
  }

  if (!hasExactKeys(summary, ['version', 'status', 'repository', 'base', 'candidate', 'patchSha256', 'effects', 'reports']) ||
      summary.version !== 1 || summary.status !== 'both-reports-recorded' ||
      summary.repository !== expected.repository || summary.base !== expected.base ||
      summary.candidate !== expected.head || summary.patchSha256 !== expected.patchSha256 ||
      summary.effects !== 'MANUAL_REVIEW_COORDINATION_ONLY') {
    rejectSummary();
  }
  verifyReports(summary.reports, expected);
}

async function readSummary() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > MAX_SUMMARY_BYTES) rejectSummary();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

if (import.meta.main) {
  if (process.versions.node !== '24.18.0' || process.argv.length !== 2 || process.stdin.isTTY) {
    console.error('DOSAI_REVIEW_SUMMARY_REQUIRES_PINNED_NODE_AND_STDIN');
    process.exitCode = 2;
  } else {
    try {
      verifyDesktopReviewSummary(await readSummary(), DOSAI_REVIEW_SAMPLE);
      console.log('DOSAI_SAMPLE_SUMMARY_MATCHED');
    } catch {
      console.error(REJECTED);
      process.exitCode = 1;
    }
  }
}
