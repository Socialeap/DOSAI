(function mountDashboard() {
  'use strict';

  const { assignRole, createSession, defaultRoles, names, sampleAgents } = globalThis.dosaiCoordinationPrototype;
  const byId = id => document.getElementById(id);
  const graph = byId('graph');
  const activity = byId('activity');
  const run = byId('run');
  const stop = byId('stop');
  const status = byId('session-status');
  const project = globalThis.dosaiProject;

  const titles = { lead: 'Lead engineer', review: 'Review specialist', test: 'Test specialist' };
  const states = {
    pending: 'Waiting for assignment', assigned: 'Assigned', reviewing: 'Working',
    delivered: 'Result sent', complete: 'Done',
  };
  const edgeLabels = { assignment: 'Assignment sent', progress: 'Progress to lead', result: 'Result to lead' };
  const outcomes = { idle: 'Ready', running: 'In progress', complete: 'Both results received',
    stopped: 'Session stopped', blocked: 'Session blocked' };
  const pause = () => new Promise(resolve => setTimeout(resolve, 750));
  let roles = defaultRoles;
  let session;
  let savedProject;

  const nodes = Object.keys(names).map(agent => {
    const card = byId('agent-' + agent);
    const role = byId('role-' + agent);
    for (const [value, title] of Object.entries(titles)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = title;
      role.append(option);
    }
    role.addEventListener('change', () => {
      if (nodeRoleLocked()) return;
      roles = assignRole(roles, agent, role.value);
      session = undefined;
      if (savedProject) renderProject(savedProject);
      else renderIdle();
    });
    return { agent, card, role, state: byId('state-' + agent) };
  });

  function nodeRoleLocked() {
    return project ? graph.dataset.phase !== 'idle' : session?.snapshot().phase === 'running';
  }

  function render({ phase, states: tasks, events }) {
    const running = phase === 'running';
    graph.dataset.phase = phase;
    status.textContent = outcomes[phase];
    run.disabled = running;
    stop.disabled = !running;

    for (const node of nodes) {
      const role = Object.keys(roles).find(key => roles[key] === node.agent);
      node.card.dataset.role = role;
      node.role.value = role;
      node.role.disabled = running;
      if (phase === 'idle') node.state.textContent = 'Ready';
      else if (phase === 'blocked' || phase === 'stopped') node.state.textContent = 'Stopped';
      else if (role === 'lead') node.state.textContent = phase === 'complete' ? 'Review complete' : 'Coordinating';
      else node.state.textContent = states[tasks[role]];
    }

    for (const task of ['review', 'test']) {
      const event = events.findLast(message => message.task === task);
      const link = byId('link-' + task);
      link.dataset.direction = !event || phase === 'blocked' || phase === 'stopped'
        ? 'none' : event.type === 'assignment' ? 'lead' : 'specialist';
      byId('label-' + task).textContent = event ? edgeLabels[event.type] : 'Waiting';
    }

    activity.replaceChildren(...events.map(event => {
      const item = document.createElement('li');
      const direction = document.createElement('strong');
      direction.textContent = names[event.from] + ' → ' + names[event.to];
      item.append(direction, event.text);
      return item;
    }));
  }

  function renderIdle() {
    render({ phase: 'idle', states: {}, events: [] });
  }

  function renderProject(saved) {
    if (!saved) {
      projectError();
      return;
    }
    savedProject = saved;
    if (saved.phase !== 'idle') roles = saved.roles;
    render({
      phase: saved.phase,
      states: Object.fromEntries(Object.entries(saved.tasks).map(([task, item]) => [task, item.status])),
      events: saved.events,
    });
    for (const node of nodes) node.role.disabled = saved.phase !== 'idle';
    run.disabled = saved.active || ['complete', 'stopped'].includes(saved.phase);
    run.textContent = saved.phase === 'running' && !saved.active ? 'Resume demo' : 'Run demo';
    if (saved.phase === 'running' && !saved.active) status.textContent = 'Saved session ready to resume';
    if (saved.phase === 'complete') status.textContent = 'Both results saved';
    byId('project-revision').textContent = saved.revision ? 'Update ' + saved.revision : '';
    for (const task of ['review', 'test']) {
      const item = saved.tasks[task];
      byId('done-' + task).checked = item.status === 'complete';
      byId('note-' + task).textContent = item.note || (item.status === 'pending' ? 'Waiting for assignment' : '');
      byId('owner-' + task).textContent = names[roles[task]];
    }
  }

  function projectError() {
    status.textContent = savedProject
      ? 'Saved project unavailable. Showing the last confirmed update.'
      : 'Saved project unavailable.';
    run.disabled = true;
  }

  run.addEventListener('click', () => {
    if (project) {
      run.disabled = true;
      void project.run(roles).then(renderProject).catch(projectError);
      return;
    }
    session = createSession({ roles, agents: sampleAgents(roles, pause), onUpdate: render });
    void session.start();
  });
  stop.addEventListener('click', () => {
    if (project) void project.stop().then(renderProject).catch(projectError);
    else session?.stop();
  });
  if (project) {
    document.body.dataset.mode = 'project';
    byId('mode').textContent = 'Offline project demo';
    byId('project-board').hidden = false;
    run.disabled = true;
    project.subscribe(renderProject);
    void project.view().then(renderProject).catch(projectError);
  } else renderIdle();
})();
