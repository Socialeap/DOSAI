import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openProject } from '../../tools/coordination-prototype/project-store.mjs';
import { createPilotBroker } from '../../tools/local-coordination-pilot/broker.mjs';
import { openMcpSession } from '../../tools/local-coordination-pilot/mcp-session.mjs';

const roles = { lead: 'codex', review: 'claude', test: 'carbon' };
const encode = value => Buffer.from(JSON.stringify(value));

function projectFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dosai-pilot-test-'));
  const path = join(root, 'project.sqlite');
  const project = openProject(path);
  project.start(roles);
  t.after(() => {
    project.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { project, path };
}

function client(broker, actor, clientName = actor) {
  const rpc = openMcpSession(broker.bind(actor));
  let sequence = 0;
  const request = (method, params) => rpc.handle(encode({
    jsonrpc: '2.0', id: ++sequence, method, ...(params === undefined ? {} : { params }),
  }));
  function initialize() {
    const start = request('initialize', {
      protocolVersion: '2025-06-18', clientInfo: { name: clientName, version: 'fixture' }, capabilities: {},
    });
    assert.equal(start.result.protocolVersion, '2025-06-18');
    assert.equal(rpc.handle(encode({ jsonrpc: '2.0', method: 'notifications/initialized' })), undefined);
  }
  const invoke = (name, args) => request('tools/call', { name, arguments: args });
  function call(name, args = {}) {
    const { result } = invoke(name, args);
    assert.equal(result.isError, undefined);
    return JSON.parse(result.content[0].text);
  }
  return { rpc, request, initialize, invoke, call };
}

test('two bound clients exchange assignments, progress and results through their MCP tool views', t => {
  const { project, path } = projectFixture(t);
  const broker = createPilotBroker(project);
  const lead = client(broker, 'codex');
  const specialist = client(broker, 'claude');
  lead.initialize();
  specialist.initialize();

  assert.deepEqual(lead.request('tools/list').result.tools.map(tool => tool.name),
    ['dosai_read_project', 'dosai_assign_review']);
  assert.deepEqual(specialist.request('tools/list').result.tools.map(tool => tool.name),
    ['dosai_read_project', 'dosai_report_review', 'dosai_complete_review']);
  assert.equal(specialist.call('dosai_read_project').status, 'pending');

  lead.call('dosai_assign_review', { expectedRevision: 0 });
  const assigned = specialist.call('dosai_read_project');
  assert.equal(assigned.status, 'assigned');
  const progress = specialist.call('dosai_report_review', { expectedRevision: assigned.revision, note: 'checking' });
  assert.equal(lead.call('dosai_read_project').note, progress.note);
  const result = specialist.call('dosai_complete_review', {
    expectedRevision: progress.revision, note: 'missing_validation',
  });
  assert.equal(result.status, 'complete');
  assert.deepEqual(lead.call('dosai_read_project'), result);

  const dashboard = openProject(path);
  try {
    const saved = dashboard.snapshot();
    assert.equal(saved.tasks.review.note, result.note);
    assert.equal(saved.tasks.test.status, 'pending');
    assert.deepEqual(saved.events.map(event => [event.from, event.to]), [
      ['codex', 'claude'], ['claude', 'codex'], ['claude', 'codex'],
    ]);
  } finally {
    dashboard.close();
  }
});

test('two isolated fixture processes pick up and complete one assignment without relaying messages', { timeout: 5000 }, async t => {
  const { project } = projectFixture(t);
  const broker = createPilotBroker(project);
  const program = new URL('../fixtures/coordination/pilot-client.mjs', import.meta.url);
  const children = [['codex', 'lead'], ['claude', 'specialist']].map(([actor, role]) => {
    const rpc = openMcpSession(broker.bind(actor));
    const child = fork(program, [role], {
      execArgv: [],
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      signal: t.signal,
    });
    child.on('message', frame => {
      if (typeof frame !== 'string') {
        rpc.close();
        child.kill();
        return;
      }
      const answer = rpc.handle(Buffer.from(frame));
      if (answer !== undefined) child.send(answer, error => { if (error) child.kill(); });
    });
    child.once('close', rpc.close);
    return { child, closed: once(child, 'close') };
  });
  try {
    assert.deepEqual(await Promise.all(children.map(({ closed }) => closed)), [[0, null], [0, null]]);
    const saved = project.snapshot();
    assert.equal(saved.tasks.review.status, 'complete');
    assert.deepEqual(saved.events.map(event => event.type), ['assignment', 'progress', 'result']);
  } finally {
    for (const { child } of children) if (child.exitCode === null && child.signalCode === null) child.kill();
    await Promise.allSettled(children.map(({ closed }) => closed));
  }
});

test('claimed client name and extra role or project fields cannot grant tool authority', t => {
  const { project } = projectFixture(t);
  const broker = createPilotBroker(project);
  const specialist = client(broker, 'claude', 'codex');
  const lead = client(broker, 'codex');
  specialist.initialize();
  lead.initialize();
  assert.throws(() => broker.bind('carbon'), /rejected/);
  assert.throws(() => broker.bind('claude'), /rejected/);
  assert.equal(specialist.invoke('dosai_assign_review', { expectedRevision: 0 }).result.isError, true);
  assert.equal(lead.invoke('dosai_assign_review', { expectedRevision: 0, project: 'other' }).result.isError, true);
  assert.equal(lead.invoke('dosai_execute', {}).result.isError, true);
  assert.equal(project.snapshot().events.length, 0);

  lead.call('dosai_assign_review', { expectedRevision: 0 });
  assert.equal(specialist.invoke('dosai_report_review', { expectedRevision: 1, note: 'arbitrary text' }).result.isError, true);
  assert.equal(specialist.invoke('dosai_report_review', { expectedRevision: 1, note: 'checking', actor: 'codex' }).result.isError, true);
  assert.equal(specialist.invoke('dosai_complete_review', { expectedRevision: 1, note: 'no_issue' }).result.isError, true);
  specialist.call('dosai_report_review', { expectedRevision: 1, note: 'checking' });
  assert.equal(specialist.invoke('dosai_report_review', { expectedRevision: 1, note: 'compared' }).result.isError, true);
  assert.equal(project.snapshot().events.length, 2);
});

test('a fresh specialist connection catches up and stop persists across restart', t => {
  const { project, path } = projectFixture(t);
  const broker = createPilotBroker(project);
  const lead = client(broker, 'codex');
  lead.initialize();
  const assigned = lead.call('dosai_assign_review', { expectedRevision: 0 });
  const initial = broker.bind('claude');
  initial.close();
  const next = client(broker, 'claude');
  next.initialize();
  assert.throws(() => initial.call('dosai_read_project', {}), /revoked/);
  assert.deepEqual(next.call('dosai_read_project'), assigned);

  assert.equal(broker.stop().phase, 'stopped');
  assert.equal(next.invoke('dosai_report_review', { expectedRevision: assigned.revision, note: 'checking' }).result.isError, true);
  assert.throws(() => broker.bind('claude'), /closed/);
  const reopened = openProject(path);
  try {
    assert.equal(reopened.snapshot().phase, 'stopped');
    assert.equal(reopened.snapshot().events.length, 1);
    assert.throws(() => createPilotBroker(reopened), /admitted/);
  } finally {
    reopened.close();
  }
});

test('the lease is rechecked inside the write transaction and cannot revive', t => {
  const { project } = projectFixture(t);
  let now = 10;
  let advanceOnWrite = false;
  const withClock = {
    ...project,
    forActor(actor, verify) {
      return project.forActor(actor, saved => {
        if (advanceOnWrite) now = 20;
        verify(saved);
      });
    },
  };
  const broker = createPilotBroker(withClock, { clock: () => now, lifetimeMs: 10 });
  const lead = broker.bind('codex');
  advanceOnWrite = true;
  assert.throws(() => lead.call('dosai_assign_review', { expectedRevision: 0 }), /closed/);
  assert.equal(project.snapshot().events.length, 0);
  now = 10;
  assert.throws(() => lead.call('dosai_read_project', {}), /closed/);
});

test('scope drift inside the write transaction does not allow an additional write', t => {
  const { project } = projectFixture(t);
  const injected = {
    ...project,
    forActor(actor, verify) {
      const writer = project.forActor(actor, verify);
      return {
        update(change) {
          project.forActor('codex').update({
            task: 'test', type: 'assignment', expectedRevision: 0, note: 'Unrelated fixture task',
          });
          return writer.update(change);
        },
      };
    },
  };
  const lead = createPilotBroker(injected).bind('codex');
  assert.throws(() => lead.call('dosai_assign_review', { expectedRevision: 0 }), /scope/);
  assert.equal(project.snapshot().tasks.review.status, 'pending');
  assert.throws(() => lead.call('dosai_read_project', {}), /closed/);
  assert.throws(() => createPilotBroker(project), /scope/);
});
