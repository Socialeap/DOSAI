import { createHash } from 'node:crypto';
import { createPilotBroker, pilotRoles, reviewFixture, reviewStudy } from './broker.mjs';
import { managedTurn, readManagedOutput } from './managed-turn.mjs';
import { runManagedFixtureTurn } from './managed-fixture-runner.mjs';
import { hydrogenModel, createAntigravitySdkFixtureTurn } from './antigravity-sdk-fixture.mjs';

// The desktop entry keeps its fixed Codex/Claude offline fixture.
export function createManagedReview(project, publish, { confirm, execute = runManagedFixtureTurn }) {
  if (project.mode === 'antigravity-review') throw new Error('The Antigravity database requires its own fixture.');
  return createReview(project, publish, { confirm, execute, roles: pilotRoles() });
}

export function createAntigravityFixtureReview(project, publish, { confirm, sdkFixture }) {
  if (project.mode !== 'antigravity-review') throw new Error('A dedicated Antigravity review database is required.');
  const review = createAntigravitySdkFixtureTurn(sdkFixture);
  return createReview(project, publish, {
    confirm, roles: pilotRoles('carbon'), reviewerModel: hydrogenModel,
    execute(turn, options) {
      return turn.actor === 'codex' ? runManagedFixtureTurn(turn, options) : review(options);
    },
  });
}

function createReview(project, publish, { confirm, execute, roles, reviewerModel }) {
  const plan = Object.freeze({
    version: 1, mode: 'offline-fixture', study: reviewStudy, fixture: reviewFixture,
    lead: roles.lead, reviewer: roles.review, turns: 3, externalCostLimitCents: 0,
    ...(reviewerModel ? { reviewerModel } : {}),
  });
  const planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  const tasks = Object.keys(project.snapshot().tasks);
  if (tasks.length !== 1 || tasks[0] !== 'review') throw new Error('A dedicated review database is required.');

  let attempt;
  let notice;

  function view(saved = project.snapshot()) {
    return {
      ...saved, mode: 'managed-review', active: Boolean(attempt && !attempt.controller.signal.aborted),
      notice,
      ...(reviewerModel ? { reviewerModel, ...(saved.phase === 'idle' ? { roles } : {}) } : {}),
    };
  }

  function stop() {
    attempt?.controller.abort();
    const saved = attempt?.broker ? attempt.broker.stop() : project.stop();
    notice = saved.phase === 'idle' ? 'Approval cancelled' : undefined;
    const record = view(saved);
    publish(record);
    return record;
  }

  async function cycle(current) {
    const { signal } = current.controller;
    let started = false;
    try {
      signal.throwIfAborted();
      notice = 'Awaiting local approval';
      publish(view());
      signal.throwIfAborted();
      const approved = await confirm(plan, planDigest, signal);
      signal.throwIfAborted();
      if (approved !== true) {
        notice = 'Approval declined';
        return;
      }

      project.start(roles);
      started = true;
      const broker = createPilotBroker(project, { lifetimeMs: 12_000, reviewer: roles.review });
      current.broker = broker;
      const lead = broker.bind(roles.lead);
      const specialist = broker.bind(roles.review);

      async function turn(step, finding, onStart) {
        signal.throwIfAborted();
        lead.call('dosai_read_project', {});
        const request = managedTurn(step, finding, roles.review);
        const output = await execute(request, { signal, onStart });
        signal.throwIfAborted();
        return readManagedOutput(request, output);
      }

      notice = 'Codex is assigning the review';
      publish(view());
      await turn('assign');
      const assignment = lead.call('dosai_assign_review', { expectedRevision: 0 });
      notice = undefined;
      publish(view());

      let progress;
      const finding = await turn('review', undefined, () => {
        signal.throwIfAborted();
        progress = specialist.call('dosai_report_review', {
          expectedRevision: assignment.revision, note: 'checking',
        });
        publish(view());
      });
      if (!progress) throw new Error('Review launch was not observed.');
      notice = 'Codex is receiving the review';
      publish(view());
      await turn('acknowledge', finding);
      specialist.call('dosai_complete_review', { expectedRevision: progress.revision, note: finding });
      notice = undefined;
      lead.close();
      specialist.close();
    } catch {
      if (!signal.aborted) {
        current.controller.abort();
        if (started) {
          if (current.broker) current.broker.stop();
          else project.stop();
        }
        notice = 'Review blocked';
      }
    } finally {
      attempt = undefined;
      publish(view());
    }
  }

  async function run() {
    if (attempt || project.snapshot().phase !== 'idle') return view();
    const current = { controller: new AbortController() };
    attempt = current;
    current.completion = Promise.resolve().then(() => cycle(current));
    await current.completion;
    return view();
  }

  async function shutdown() {
    if (!attempt) return;
    const { completion } = attempt;
    try {
      stop();
    } finally {
      await completion;
    }
  }

  return Object.freeze({ run, stop, view, shutdown });
}
