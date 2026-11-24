// Only a trusted supervisor may call bind(). It is not part of the agent API.
const assignment = 'Review the synthetic input handling fixture.';
export const reviewStudy = 'synthetic-empty-input-review';
export const reviewFixture = Object.freeze({ suppliedInput: '', expected: 'reject empty input', observed: 'accepted' });

const notes = Object.freeze({
  progress: Object.freeze({
    checking: 'Checking the synthetic empty-input case.',
    compared: 'Compared the observed and expected fixture behavior.',
  }),
  result: Object.freeze({
    missing_validation: 'The fixture needs an empty-input check.',
    no_issue: 'No issue found in the supplied fixture.',
  }),
});
export const reviewFindings = Object.freeze(Object.keys(notes.result));
const operations = {
  dosai_assign_review: 'assignment',
  dosai_report_review: 'progress',
  dosai_complete_review: 'result',
};
const objectSchema = (properties, required = []) => ({
  type: 'object', additionalProperties: false, properties, required,
});
const revision = { type: 'integer', minimum: 0 };
const readTool = {
  name: 'dosai_read_project',
  description: 'Read the saved synthetic review task and its revision.',
  inputSchema: objectSchema({}),
};
const schemas = {
  dosai_assign_review: objectSchema({ expectedRevision: revision }, ['expectedRevision']),
  dosai_report_review: objectSchema({
    expectedRevision: revision, note: { enum: Object.keys(notes.progress) },
  }, ['expectedRevision', 'note']),
  dosai_complete_review: objectSchema({
    expectedRevision: revision, note: { enum: reviewFindings },
  }, ['expectedRevision', 'note']),
};
const tool = (name, description) => ({ name, description, inputSchema: schemas[name] });
const leadTools = [readTool, tool('dosai_assign_review', 'Assign the fixed review to the specialist.')];
const specialistTools = [
  readTool,
  tool('dosai_report_review', 'Record a synthetic review status for the assigned task.'),
  tool('dosai_complete_review', 'Complete the assigned review with a synthetic result.'),
];

export function pilotRoles(reviewer = 'claude') {
  if (reviewer !== 'claude' && reviewer !== 'carbon') throw new Error('Pilot reviewer rejected.');
  return Object.freeze({ lead: 'codex', review: reviewer, test: reviewer === 'claude' ? 'carbon' : 'claude' });
}

function keysAre(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

function requireScope(saved, roles) {
  if (Object.keys(roles).some(role => saved.roles[role] !== roles[role]) ||
      saved.events.some(event => event.task !== 'review' || (
        event.type === 'assignment' ? event.text !== assignment : !Object.values(notes[event.type]).includes(event.text)
      ))) {
    throw new Error('Project does not match the synthetic pilot scope.');
  }
}

function projectView(saved) {
  return {
    study: reviewStudy,
    status: saved.phase === 'stopped' ? 'stopped' : saved.tasks.review.status,
    revision: saved.tasks.review.revision,
    note: saved.tasks.review.note,
    fixture: { ...reviewFixture },
  };
}

export function createPilotBroker(project, { clock = () => performance.now(), lifetimeMs = 120_000, reviewer } = {}) {
  const roles = pilotRoles(reviewer);
  if (roles.review === 'carbon' && project.mode !== 'antigravity-review') {
    throw new Error('A dedicated Antigravity review database is required.');
  }
  const initial = project.snapshot();
  requireScope(initial, roles);
  if (initial.phase !== 'running' || initial.tasks.review.status === 'complete') {
    throw new Error('An admitted synthetic project is required.');
  }
  if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 600_000) {
    throw new Error('Invalid pilot lifetime.');
  }
  let last = clock();
  if (!Number.isFinite(last)) throw new Error('Pilot clock unavailable.');
  const deadline = last + lifetimeMs;
  if (!Number.isFinite(deadline) || deadline <= last) throw new Error('Pilot clock unavailable.');
  const leases = new Map();
  let closed = false;
  let generation = 0;

  function revoke() {
    closed = true;
    leases.clear();
  }

  function requireOpen() {
    const now = clock();
    if (!Number.isFinite(now) || now < last || now >= deadline) revoke();
    last = now;
    if (closed) throw new Error('Pilot window closed.');
  }

  function requireUnchangedScope(saved) {
    try {
      requireScope(saved, roles);
    } catch (error) {
      revoke();
      throw error;
    }
  }

  function readProject() {
    const saved = project.snapshot();
    requireUnchangedScope(saved);
    return saved;
  }

  function bind(actor) {
    requireOpen();
    if ((actor !== roles.lead && actor !== roles.review) || leases.has(actor) || readProject().phase !== 'running') {
      throw new Error('Pilot endpoint rejected.');
    }
    const catalog = actor === roles.lead ? leadTools : specialistTools;
    const lease = ++generation;
    leases.set(actor, lease);

    function requireLease() {
      requireOpen();
      if (leases.get(actor) !== lease) throw new Error('Endpoint revoked.');
    }

    function readScoped() {
      requireLease();
      const saved = readProject();
      requireLease();
      if (saved.phase !== 'running') throw new Error('Pilot project closed.');
      return saved;
    }

    // Recheck lease inside the same SQLite transaction that inserts the update.
    const writer = project.forActor(actor, saved => {
      requireLease();
      requireUnchangedScope(saved);
    });
    function call(name, args) {
      const saved = readScoped();
      if (!catalog.some(entry => entry.name === name)) throw new Error('Tool rejected.');
      if (name === readTool.name) {
        if (!keysAre(args, [])) throw new Error('Read arguments rejected.');
        return projectView(saved);
      }

      const type = operations[name];
      const needsNote = type !== 'assignment';
      if (!keysAre(args, needsNote ? ['expectedRevision', 'note'] : ['expectedRevision']) ||
          !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 ||
          (needsNote && (typeof args.note !== 'string' || !Object.hasOwn(notes[type], args.note)))) {
        throw new Error('Update arguments rejected.');
      }
      return projectView(writer.update({
        task: 'review',
        type,
        expectedRevision: args.expectedRevision,
        note: needsNote ? notes[type][args.note] : assignment,
      }));
    }

    return Object.freeze({
      tools() {
        readScoped();
        return structuredClone(catalog);
      },
      call,
      close() {
        if (leases.get(actor) === lease) leases.delete(actor);
      },
    });
  }

  return Object.freeze({
    bind,
    stop() {
      revoke();
      return project.stop();
    },
  });
}
