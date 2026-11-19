(function mountDashboard() {
  'use strict';

  const { assignRole, createSession, defaultRoles, names, sampleAgents } = globalThis.dosaiCoordinationPrototype;
  const byId = id => document.getElementById(id);
  const graph = byId('graph');
  const activity = byId('activity');
  const run = byId('run');
  const stop = byId('stop');
  const status = byId('session-status');

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
      if (session?.snapshot().phase === 'running') return;
      roles = assignRole(roles, agent, role.value);
      session = undefined;
      renderIdle();
    });
    return { agent, card, role, state: byId('state-' + agent) };
  });

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

  run.addEventListener('click', () => {
    session = createSession({ roles, agents: sampleAgents(roles, pause), onUpdate: render });
    void session.start();
  });
  stop.addEventListener('click', () => session?.stop());
  renderIdle();
})();
