import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

import { projectDemo } from '../../tools/coordination-prototype/project-demo.mjs';
import { openProject } from '../../tools/coordination-prototype/project-store.mjs';

const roles = { lead: 'carbon', review: 'claude', test: 'codex' };
const immediate = async () => {};

function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dosai-project-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, 'project.sqlite');
}

function write(actor, type, task, expectedRevision, note = 'Synthetic note') {
  return actor.update({ type, task, expectedRevision, note });
}

test('independently opened actors share notes and isolated task revisions', t => {
  const path = scratch(t);
  const first = openProject(path);
  let second;
  try {
    first.start(roles);
    second = openProject(path);
    const lead = first.forActor('carbon');
    const reviewer = first.forActor('claude');
    const tester = second.forActor('codex');
    write(lead, 'assignment', 'review', 0, 'Review assignment');
    write(lead, 'assignment', 'test', 0, 'Test assignment');
    const initial = tester.snapshot();
    assert.deepEqual(initial.roles, roles);

    const review = write(reviewer, 'progress', 'review', initial.tasks.review.revision, 'Review note');
    const both = write(tester, 'progress', 'test', initial.tasks.test.revision, 'Test note');
    assert.equal(both.tasks.review.note, 'Review note');
    assert.equal(lead.snapshot().tasks.test.note, 'Test note');
    assert.throws(() => write(reviewer, 'progress', 'review', initial.tasks.review.revision), /rejected/);
    assert.throws(() => write(reviewer, 'result', 'test', both.tasks.test.revision), /rejected/);
    assert.throws(() => write(lead, 'result', 'review', review.tasks.review.revision), /rejected/);
    assert.throws(() => write(lead, 'execute', 'test', both.tasks.test.revision), /Invalid task update/);
    write(reviewer, 'result', 'review', review.tasks.review.revision, 'Review result');
    write(tester, 'result', 'test', both.tasks.test.revision, 'Test result');
    assert.equal(lead.snapshot().phase, 'complete');
  } finally {
    second?.close();
    first.close();
  }

  const reopened = openProject(path);
  try {
    assert.deepEqual(reopened.snapshot().events.map(event => event.type),
      ['assignment', 'assignment', 'progress', 'progress', 'result', 'result']);
    assert.equal(reopened.snapshot().tasks.test.note, 'Test result');
    assert.equal(reopened.snapshot().phase, 'complete');
    assert.throws(() => reopened.start(roles), /already has a team/);
  } finally {
    reopened.close();
  }
});

test('the fixture resumes from a saved task without duplicating assignments or results', async t => {
  const path = scratch(t);
  const initial = openProject(path);
  try {
    initial.start(roles);
    const lead = initial.forActor('carbon');
    const specialist = initial.forActor('claude');
    const assignment = write(lead, 'assignment', 'review', 0);
    const progress = write(specialist, 'progress', 'review', assignment.tasks.review.revision);
    write(specialist, 'result', 'review', progress.tasks.review.revision, 'Keep my earlier result');
    write(lead, 'assignment', 'test', 0);
  } finally {
    initial.close();
  }

  const reopened = openProject(path);
  try {
    const published = [];
    const demo = projectDemo(reopened, view => published.push(view), { pause: immediate });
    assert.equal(demo.view().active, false);
    const result = await demo.run();
    assert.equal(result.phase, 'complete');
    assert.equal(result.tasks.review.note, 'Keep my earlier result');
    assert.equal(result.tasks.test.note, 'Missing test: empty input.');
    assert.deepEqual(result.events.map(event => event.sequence), [1, 2, 3, 4, 5, 6]);
    assert.ok(published.some(view => view.tasks.test.status === 'reviewing'));
  } finally {
    reopened.close();
  }
});

test('concurrent independent writers preserve both task notes and reject a stale same-task write', async t => {
  const path = scratch(t);
  const project = openProject(path);
  const moduleUrl = new URL('../../tools/coordination-prototype/project-store.mjs', import.meta.url).href;
  function workerWrite(actor, task, expectedRevision, note) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        import(workerData.moduleUrl).then(({ openProject }) => {
          const project = openProject(workerData.path);
          let accepted = false;
          try {
            const { task, expectedRevision, note } = workerData;
            project.forActor(workerData.actor).update({ task, expectedRevision, note, type: 'progress' });
            accepted = true;
          } catch (error) {
            if (error.message !== 'Task update rejected.') throw error;
          } finally {
            project.close();
          }
          parentPort.postMessage(accepted);
        });
      `, { eval: true, workerData: { moduleUrl, path, actor, task, expectedRevision, note } });
      let accepted;
      worker.on('message', value => { accepted = value; });
      worker.once('error', reject);
      worker.once('exit', code => code === 0 && typeof accepted === 'boolean'
        ? resolve(accepted)
        : reject(new Error('Writer did not exit cleanly.')));
    });
  }

  try {
    project.start(roles);
    const lead = project.forActor(roles.lead);
    write(lead, 'assignment', 'review', 0);
    const assigned = write(lead, 'assignment', 'test', 0);
    assert.deepEqual(await Promise.all([
      workerWrite(roles.review, 'review', assigned.tasks.review.revision, 'Review progress'),
      workerWrite(roles.test, 'test', assigned.tasks.test.revision, 'Test progress'),
    ]), [true, true]);
    const saved = project.snapshot();
    assert.equal(saved.tasks.review.note, 'Review progress');
    assert.equal(saved.tasks.test.note, 'Test progress');
    const raced = await Promise.all([
      workerWrite(roles.test, 'test', saved.tasks.test.revision, 'One update'),
      workerWrite(roles.test, 'test', saved.tasks.test.revision, 'Another update'),
    ]);
    assert.equal(raced.filter(Boolean).length, 1);
    assert.equal(project.snapshot().revision, 5);
  } finally {
    project.close();
  }
});

test('stop persists and revokes pending fixture updates', async t => {
  const path = scratch(t);
  const project = openProject(path);
  try {
    const suspended = Promise.withResolvers();
    const demo = projectDemo(project, () => {}, { pause: () => suspended.promise });
    const running = demo.run(roles);
    assert.equal(demo.view().active, true);
    const stopped = demo.stop();
    suspended.resolve();
    assert.deepEqual(await running, stopped);
    assert.equal(stopped.events.length, 0);
  } finally {
    project.close();
  }
  const reopened = openProject(path);
  try {
    assert.equal(reopened.snapshot().phase, 'stopped');
    assert.throws(() => write(reopened.forActor('carbon'), 'assignment', 'test', 0), /rejected/);
  } finally {
    reopened.close();
  }
});

test('duplicate roles, unrelated databases and incorrectly attributed history fail closed', t => {
  const path = scratch(t);
  const other = new DatabaseSync(path);
  other.exec('CREATE TABLE unrelated (id INTEGER)');
  other.close();
  assert.throws(() => openProject(path), /Unexpected coordination database/);

  const owned = scratch(t);
  const project = openProject(owned);
  try {
    assert.throws(() => project.start({ ...roles, review: roles.lead }), /Invalid team/);
    project.start(roles);
    write(project.forActor('carbon'), 'assignment', 'test', 0);
  } finally {
    project.close();
  }
  const edit = new DatabaseSync(owned);
  edit.exec("UPDATE event SET actor = 'claude' WHERE sequence = 1");
  edit.close();
  const reopened = openProject(owned);
  try {
    assert.throws(() => reopened.snapshot(), /Invalid saved activity/);
  } finally {
    reopened.close();
  }
});
