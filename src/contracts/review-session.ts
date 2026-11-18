export const REVIEW_AGENTS = ['Codex', 'Claude', 'Gemini'] as const;
export type ReviewAgent = (typeof REVIEW_AGENTS)[number];
export const REVIEW_LANES = ['correctness', 'test-coverage'] as const;
export type ReviewLane = (typeof REVIEW_LANES)[number];
export const REVIEW_VERDICTS = ['No findings', 'Findings', 'Incomplete'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export interface ReviewConfig {
  readonly repository: string;
  readonly base: string;
  readonly head: string;
  readonly patchSha256: string;
  readonly correctness: ReviewAgent;
  readonly testCoverage: ReviewAgent;
}

export const DOSAI_REVIEW_SAMPLE: ReviewConfig = Object.freeze({
  repository: 'Socialeap/DOSAI',
  base: '1f2ef15fa6bb426046cb859d36469144f0d40174',
  head: '314b633c524d35a988f80f0cd7b9c3806eb93124',
  patchSha256: '0263b017cda1a7163e6ebdcc2b29699bbe3e9904e239bc157e4a19251a53ea39',
  correctness: 'Codex',
  testCoverage: 'Claude',
});

export const REVIEW_LANE_LABELS = Object.freeze({
  correctness: 'Correctness',
  'test-coverage': 'Test coverage',
} as const);

export interface ReviewSessionRef {
  readonly sessionId: string;
  readonly planSha256: string;
}

export interface ReviewPlan extends ReviewSessionRef {
  readonly version: 1;
  readonly config: ReviewConfig;
  readonly approvalExpiresAt: string;
}

export interface ReviewHandoff {
  readonly lane: ReviewLane;
  readonly agent: ReviewAgent;
  readonly handoffId: string;
  readonly prompt: string;
}

export interface ReviewReportInput extends ReviewSessionRef {
  readonly lane: ReviewLane;
  readonly handoffId: string;
  readonly verdict: ReviewVerdict;
  readonly findings: number;
}

export interface ReviewReport {
  readonly lane: ReviewLane;
  readonly handoffId: string;
  readonly verdict: ReviewVerdict;
  readonly findings: number;
  readonly provenance: 'OPERATOR_RECORDED_UNVERIFIED';
}

export type ReviewStatus = 'awaiting-approval' | 'active' | 'denied' | 'expired' | 'stopped' | 'complete';
export type ReviewEvent = Readonly<{
  type: 'prepared' | 'locally-approved' | 'denied' | 'confirmation-unavailable' |
    'expired' | 'stopped' | 'report-recorded' | 'completed';
  at: string;
  lane?: ReviewLane;
}>;

export interface ReviewReceipt {
  readonly body: Readonly<{
    version: 1;
    plan: ReviewPlan;
    status: ReviewStatus;
    events: readonly ReviewEvent[];
    reports: readonly ReviewReport[];
    assurance: 'VOLATILE_UNSIGNED';
    effects: 'MANUAL_REVIEW_COORDINATION_ONLY';
  }>;
  readonly sha256: string;
}

export interface ReviewSession {
  readonly plan: ReviewPlan;
  readonly status: ReviewStatus;
  readonly handoffs: readonly ReviewHandoff[];
  readonly reports: readonly ReviewReport[];
  readonly receipt: ReviewReceipt;
}

export interface ReviewBridge {
  getSession(): Promise<ReviewSession | null>;
  prepare(config: ReviewConfig): Promise<ReviewSession>;
  requestApproval(ref: ReviewSessionRef): Promise<ReviewSession>;
  recordReport(report: ReviewReportInput): Promise<ReviewSession>;
  stop(ref: ReviewSessionRef): Promise<ReviewSession>;
}
