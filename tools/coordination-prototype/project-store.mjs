import { DatabaseSync } from 'node:sqlite';
import './session.js';

const { defaultRoles, isRoleMap, names, tasks } = globalThis.dosaiCoordinationPrototype;
const applicationId = 0x444f5341;
const taskIds = Object.keys(tasks);
const nextState = { assignment: 'assigned', progress: 'reviewing', result: 'complete' };
const priorStates = {
  assignment: ['pending'], progress: ['assigned', 'reviewing'], result: ['reviewing'],
};
const maxEvents = 64;

function taskState(events, id) {
  const latest = events.findLast(event => event.task === id);
  return {
    status: latest ? nextState[latest.type] : 'pending',
    revision: latest?.sequence ?? 0,
    note: latest?.text ?? '',
  };
}

export function openProject(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=1500; PRAGMA trusted_schema=OFF;');
    const version = db.prepare('PRAGMA application_id').get().application_id;
    if (version !== applicationId) {
      if (version !== 0 || db.prepare('SELECT name FROM sqlite_master LIMIT 1').get()) {
        throw new Error('Unexpected coordination database.');
      }
    }
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA fullfsync=ON;');
    if (version === 0) {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS team (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          lead TEXT NOT NULL, reviewer TEXT NOT NULL, tester TEXT NOT NULL,
          stopped INTEGER NOT NULL DEFAULT 0 CHECK(stopped IN (0, 1))
        ) STRICT;
        CREATE TABLE IF NOT EXISTS event (
          sequence INTEGER PRIMARY KEY,
          task TEXT NOT NULL CHECK(task IN ('review', 'test')),
          type TEXT NOT NULL CHECK(type IN ('assignment', 'progress', 'result')),
          actor TEXT NOT NULL,
          note TEXT NOT NULL CHECK(length(note) BETWEEN 1 AND 160)
        ) STRICT;
        PRAGMA application_id=${applicationId};
        COMMIT;`);
    }
  } catch (error) {
    db.close();
    throw error;
  }

  function transaction(mode, operation) {
    db.exec(mode);
    try {
      const value = operation();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function read() {
    const team = db.prepare('SELECT lead, reviewer, tester, stopped FROM team WHERE id = 1').get();
    const roles = team ? { lead: team.lead, review: team.reviewer, test: team.tester } : defaultRoles;
    if (!isRoleMap(roles)) throw new Error('Invalid recorded roles.');
    const rows = db.prepare('SELECT sequence, task, type, actor, note FROM event ORDER BY sequence LIMIT ?')
      .all(maxEvents + 1);
    if (rows.length > maxEvents || (!team && rows.length)) throw new Error('Invalid saved activity.');
    const last = { review: 'pending', test: 'pending' };
    const events = rows.map((row, index) => {
      if (!Object.hasOwn(tasks, row.task) || !Object.hasOwn(priorStates, row.type) ||
          row.sequence !== index + 1 || !priorStates[row.type].includes(last[row.task]) ||
          row.actor !== (row.type === 'assignment' ? roles.lead : roles[row.task]) || !validNote(row.note)) {
        throw new Error('Invalid saved activity.');
      }
      last[row.task] = nextState[row.type];
      return {
        sequence: row.sequence, type: row.type, task: row.task, from: row.actor,
        to: row.type === 'assignment' ? roles[row.task] : roles.lead, text: row.note,
      };
    });
    const board = Object.fromEntries(taskIds.map(id => [id, taskState(events, id)]));
    const complete = taskIds.every(id => board[id].status === 'complete');
    const phase = !team ? 'idle' : complete ? 'complete' : team.stopped ? 'stopped' : 'running';
    return { phase, roles, tasks: board, events, revision: events.length + (team?.stopped ?? 0) };
  }

  function snapshot() {
    return transaction('BEGIN', read);
  }

  function start(roles) {
    if (!isRoleMap(roles)) throw new Error('Invalid team.');
    return transaction('BEGIN IMMEDIATE', () => {
      if (read().phase !== 'idle') throw new Error('Project already has a team.');
      db.prepare('INSERT INTO team (id, lead, reviewer, tester) VALUES (1, ?, ?, ?)')
        .run(roles.lead, roles.review, roles.test);
      return read();
    });
  }

  function forActor(actor, assertAdmitted = () => {}) {
    if (typeof actor !== 'string' || !Object.hasOwn(names, actor)) throw new Error('Unknown actor.');
    function update({ task, type, expectedRevision, note }) {
      if (typeof task !== 'string' || !Object.hasOwn(tasks, task) ||
          typeof type !== 'string' || !Object.hasOwn(priorStates, type) ||
          !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
          !validNote(note)) {
        throw new Error('Invalid task update.');
      }
      return transaction('BEGIN IMMEDIATE', () => {
        const current = read();
        const assigned = type === 'assignment' ? current.roles.lead : current.roles[task];
        const previous = current.tasks[task];
        if (current.phase !== 'running' || actor !== assigned ||
            previous.revision !== expectedRevision || !priorStates[type].includes(previous.status) ||
            current.events.length >= maxEvents) {
          throw new Error('Task update rejected.');
        }
        assertAdmitted(current);
        db.prepare('INSERT INTO event (task, type, actor, note) VALUES (?, ?, ?, ?)').run(task, type, actor, note.trim());
        return read();
      });
    }
    return Object.freeze({ snapshot, update });
  }

  function stop() {
    return transaction('BEGIN IMMEDIATE', () => {
      if (read().phase === 'running') db.exec('UPDATE team SET stopped = 1 WHERE id = 1');
      return read();
    });
  }

  return Object.freeze({ snapshot, start, forActor, stop, close: () => db.close() });
}

function validNote(note) {
  return typeof note === 'string' && note.length <= 160 && Boolean(note.trim()) &&
    !/[\u0000-\u001f\u007f]/.test(note);
}
