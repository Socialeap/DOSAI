import type { ReviewSession } from '../contracts/review-session';

export function createReviewSummary(session: ReviewSession | null) {
  const body = session?.receipt.body;
  if (body?.status !== 'complete') return null;

  const { repository, base, head, patchSha256, correctness, testCoverage } = body.plan.config;
  return {
    version: 1,
    status: 'both-reports-recorded',
    repository,
    base,
    candidate: head,
    patchSha256,
    effects: body.effects,
    reports: body.reports.map(({ lane, verdict, findings, provenance }) => ({
      lane,
      reviewer: lane === 'correctness' ? correctness : testCoverage,
      verdict,
      findings,
      provenance,
    })),
  };
}
