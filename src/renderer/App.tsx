import { useEffect, useState, type FormEvent } from 'react';

import {
  DOSAI_REVIEW_SAMPLE, REVIEW_AGENTS, REVIEW_LANES, REVIEW_LANE_LABELS, REVIEW_VERDICTS,
  type ReviewAgent, type ReviewConfig, type ReviewHandoff, type ReviewReport,
  type ReviewReportInput, type ReviewSession, type ReviewSessionRef, type ReviewStatus, type ReviewVerdict,
} from '../contracts/review-session';
import type { RuntimeSnapshot } from '../contracts/runtime';

const STATUS: Record<ReviewStatus, string> = {
  'awaiting-approval': 'Awaiting local approval',
  active: 'In review',
  denied: 'Approval denied',
  expired: 'Approval expired',
  stopped: 'Stopped',
  complete: 'Both reports recorded',
};

function ReviewerSelect({ name, agent, onChange }: {
  name: string;
  agent: ReviewAgent;
  onChange: (agent: ReviewAgent) => void;
}) {
  return (
    <label>
      {name}
      <select value={agent} onChange={(event) => onChange(event.target.value as ReviewAgent)}>
        {REVIEW_AGENTS.map((reviewer) => <option key={reviewer}>{reviewer}</option>)}
      </select>
    </label>
  );
}

function ReportForm({ handoff, session, busy, onRecord }: {
  handoff: ReviewHandoff;
  session: ReviewSessionRef;
  busy: boolean;
  onRecord: (report: ReviewReportInput) => void;
}) {
  const [handoffId, setHandoffId] = useState('');
  const [candidateSha, setCandidateSha] = useState('');
  const [verdict, setVerdict] = useState<ReviewVerdict>('No findings');
  const [findings, setFindings] = useState('0');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRecord({
      sessionId: session.sessionId, planSha256: session.planSha256, lane: handoff.lane,
      handoffId: handoffId.trim(), candidateSha, verdict, findings: Number(findings),
    });
  }

  return (
    <form className="report-form" onSubmit={submit}>
      <label>
        Handoff ID returned by reviewer
        <input value={handoffId} onChange={(event) => setHandoffId(event.target.value)}
          required maxLength={36} spellCheck={false} className="mono" />
      </label>
      <label>
        Candidate SHA returned by reviewer
        <input value={candidateSha} onChange={(event) => setCandidateSha(event.target.value)}
          required pattern="[0-9a-f]{40}" spellCheck={false} className="mono" />
      </label>
      <div className="field-pair">
        <label>
          Verdict
          <select value={verdict} onChange={(event) => setVerdict(event.target.value as ReviewVerdict)}>
            {REVIEW_VERDICTS.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Finding count
          <input type="number" min={0} max={99} value={findings} required
            onChange={(event) => setFindings(event.target.value)} />
        </label>
      </div>
      <button disabled={busy} type="submit">Record report</button>
    </form>
  );
}

function ReportDetails({ report }: { report: ReviewReport }) {
  return (
    <p className="report-summary">
      <strong>{report.verdict}</strong>
      <span>{report.findings} {report.findings === 1 ? 'finding' : 'findings'} · Operator recorded</span>
    </p>
  );
}

export function App({ runtime, initialSession }: {
  readonly runtime: RuntimeSnapshot;
  readonly initialSession: ReviewSession | null;
}) {
  const [config, setConfig] = useState<ReviewConfig>(initialSession?.plan.config ?? DOSAI_REVIEW_SAMPLE);
  const [session, setSession] = useState(initialSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = session?.status === 'awaiting-approval';
  const active = session?.status === 'active';
  const locked = pending || active;

  useEffect(() => {
    if (!pending || busy || session === null) return;
    let cancelled = false;
    const refresh = setInterval(() => {
      void window.dosai.review.getSession().then((current) => {
        if (!cancelled && current?.status === 'expired') setSession(current);
      }).catch(() => {
        if (!cancelled) setError('Could not refresh the local review status.');
      });
    }, 5_000);
    return () => { cancelled = true; clearInterval(refresh); };
  }, [pending, busy, session]);

  async function run(operation: () => Promise<ReviewSession>) {
    setBusy(true);
    setError('');
    try {
      setSession(await operation());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The review action failed.');
    } finally {
      setBusy(false);
    }
  }

  function update(field: keyof ReviewConfig, value: string) {
    setConfig((previous) => ({ ...previous, [field]: value }));
  }

  function refFor(plan: ReviewSessionRef): ReviewSessionRef {
    return { sessionId: plan.sessionId, planSha256: plan.planSha256 };
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <h1>DOSAI</h1>
        <div className="shell-state"><span className="status-dot" aria-hidden="true" />Local review</div>
      </header>
      <main className="workspace">
        <header className="workspace-heading">
          <div>
            <h2>Two-agent code review</h2>
            <p>Pin a patch and give each reviewer an independent assignment.</p>
          </div>
          <span className="session-state" role="status">{session ? STATUS[session.status] : 'Ready to configure'}</span>
        </header>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="columns">
          <section className="panel" aria-labelledby="target-heading">
            <h3 id="target-heading">Review target</h3>
            <form onSubmit={(event) => {
              event.preventDefault();
              void run(() => window.dosai.review.prepare(config));
            }}>
              <fieldset disabled={locked || busy}>
                <label>
                  Repository
                  <input required maxLength={140} placeholder="owner/repository" value={config.repository}
                    onChange={(event) => update('repository', event.target.value)} spellCheck={false} />
                </label>
                <label>
                  Base commit
                  <input required maxLength={40} value={config.base} onChange={(event) => update('base', event.target.value)}
                    spellCheck={false} className="mono" />
                </label>
                <label>
                  Candidate commit
                  <input required maxLength={40} value={config.head} onChange={(event) => update('head', event.target.value)}
                    spellCheck={false} className="mono" />
                </label>
                <label>
                  Patch SHA-256
                  <input required maxLength={64} value={config.patchSha256}
                    onChange={(event) => update('patchSha256', event.target.value)} spellCheck={false} className="mono" />
                </label>
                <div className="field-pair">
                  <ReviewerSelect name="Correctness reviewer" agent={config.correctness}
                    onChange={(agent) => update('correctness', agent)} />
                  <ReviewerSelect name="Test coverage reviewer" agent={config.testCoverage}
                    onChange={(agent) => update('testCoverage', agent)} />
                </div>
              </fieldset>

              {!locked && (
                <div className="actions">
                  <button className="primary" disabled={busy} type="submit">Prepare review</button>
                  <button type="button" disabled={busy} onClick={() => setConfig(DOSAI_REVIEW_SAMPLE)}>Use DOSAI sample</button>
                </div>
              )}
            </form>

            {pending && session && (
              <p className="hint">Approval expires at {new Date(session.plan.approvalExpiresAt).toLocaleTimeString()}.</p>
            )}
            {locked && session && (
              <div className="actions">
                {pending && (
                  <button className="primary" disabled={busy} type="button"
                    onClick={() => void run(() => window.dosai.review.requestApproval(refFor(session.plan)))}>
                    Start review
                  </button>
                )}
                <button type="button" disabled={busy}
                  onClick={() => void run(() => window.dosai.review.stop(refFor(session.plan)))}>Stop review</button>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="handoff-heading">
            <h3 id="handoff-heading">Reviewers</h3>
            <p className="hint">{active
              ? 'Share each handoff with its assigned reviewer in a separate chat. Record the verdict and count here.'
              : 'Handoffs are available after approval in the native macOS dialog.'}</p>
            {REVIEW_LANES.map((lane) => {
              const handoff = session?.handoffs.find((item) => item.lane === lane);
              const report = session?.reports.find((item) => item.lane === lane);
              const assignments = session?.plan.config ?? config;
              const agent = lane === 'correctness' ? assignments.correctness : assignments.testCoverage;
              return (
                <article className="reviewer" key={lane}>
                  <div className="reviewer-heading"><h4>{REVIEW_LANE_LABELS[lane]}</h4><span>{agent}</span></div>
                  {report && <ReportDetails report={report} />}
                  {session && handoff && !report && (
                    <>
                      <label>
                        Handoff prompt
                        <textarea rows={6} readOnly value={handoff.prompt} spellCheck={false} className="mono"
                          onFocus={(event) => event.currentTarget.select()} />
                      </label>
                      <ReportForm key={handoff.handoffId} handoff={handoff} session={session.plan} busy={busy}
                        onRecord={(result) => void run(() => window.dosai.review.recordReport(result))} />
                    </>
                  )}
                </article>
              );
            })}
          </section>
        </div>

        {session && (
          <details className="panel receipt">
            <summary>Local session receipt</summary>
            <p className="hint">Unsigned and held in memory. Copy it before closing this window or starting a new review.</p>
            <label>
              Receipt JSON
              <textarea className="mono" rows={8} readOnly value={JSON.stringify(session.receipt, null, 2)}
                onFocus={(event) => event.currentTarget.select()} spellCheck={false} />
            </label>
          </details>
        )}
      </main>
      <footer className="statusbar">
        <span>{runtime.platform}/{runtime.architecture}</span>
        <span>Manual handoffs · Local approval</span>
      </footer>
    </div>
  );
}
