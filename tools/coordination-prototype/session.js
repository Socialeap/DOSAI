(function defineCoordinationPrototype(root) {
  'use strict';

  const names = Object.freeze({
    codex: 'GPT Codex',
    claude: 'Claude Code',
    carbon: 'Antigravity Carbon',
  });
  const defaultRoles = Object.freeze({ lead: 'codex', review: 'claude', test: 'carbon' });
  const tasks = Object.freeze({
    review: {
      assignment: 'Review the sample input handler.',
      progress: 'Checking how the handler treats empty input.',
      result: 'Review: empty input bypasses the expected validation.',
    },
    test: {
      assignment: 'Check coverage for the sample input handler.',
      progress: 'Comparing the sample cases with the test list.',
      result: 'Missing test: empty input.',
    },
  });
  const routes = {
    assignment: { before: 'pending', after: 'assigned' },
    progress: { before: 'assigned', after: 'reviewing' },
    result: { before: 'reviewing', after: 'delivered' },
  };

  function assignRole(roles, agent, role) {
    if (!Object.hasOwn(defaultRoles, role) || !Object.hasOwn(names, agent)) return roles;
    const oldRole = Object.keys(roles).find(key => roles[key] === agent);
    return Object.freeze({ ...roles, [oldRole]: roles[role], [role]: agent });
  }

  function createSession({ roles, agents, onUpdate }) {
    const selected = { ...roles };
    const validRoles = Object.keys(selected).length === 3 &&
      Object.keys(defaultRoles).every(role => typeof selected[role] === 'string' &&
        Object.hasOwn(names, selected[role])) &&
      new Set(Object.values(selected)).size === 3;
    const states = { review: 'pending', test: 'pending' };
    const events = [];
    let phase = 'idle';

    function snapshot() {
      return Object.freeze({
        phase,
        roles: Object.freeze({ ...selected }),
        states: Object.freeze({ ...states }),
        events: Object.freeze([...events]),
      });
    }

    function publish() {
      onUpdate(snapshot());
    }

    function transition(next) {
      phase = next;
      publish();
    }

    async function deliver(from, type, task, text) {
      if (phase !== 'running') return false;
      const knownTask = typeof task === 'string' && Object.hasOwn(tasks, task);
      const route = typeof type === 'string' && Object.hasOwn(routes, type) ? routes[type] : null;
      const assignment = type === 'assignment';
      if (!knownTask || !route || states[task] !== route.before ||
          from !== (assignment ? selected.lead : selected[task]) ||
          typeof text !== 'string' || text.length > 160 || !text.trim()) {
        transition('blocked');
        return false;
      }

      const to = assignment ? selected[task] : selected.lead;
      const event = Object.freeze({ sequence: events.length + 1, type, from, to, task, text });
      events.push(event);
      states[task] = route.after;
      publish();
      if (phase !== 'running') return false;

      await agents[to].receive(event, sender(to));
      if (phase !== 'running') return false;
      if (type === 'result') {
        states[task] = 'complete';
        if (Object.values(states).every(state => state === 'complete')) transition('complete');
        else publish();
      }
      return true;
    }

    function sender(agent) {
      return (type, task, text) => deliver(agent, type, task, text);
    }

    async function start() {
      if (phase !== 'idle') return snapshot();
      if (!validRoles) {
        transition('blocked');
        return snapshot();
      }
      transition('running');
      try {
        if (phase === 'running') await agents[selected.lead].start(sender(selected.lead));
      } catch {
        if (phase === 'running') transition('blocked');
      }
      if (phase === 'running') transition('blocked');
      return snapshot();
    }

    function stop() {
      if (phase === 'running') transition('stopped');
      return snapshot();
    }

    return Object.freeze({ start, stop, snapshot });
  }

  function sampleAgents(roles, pause) {
    async function reviewAssignment(event, send) {
      const task = tasks[event.task];
      await pause();
      if (!await send('progress', event.task, task.progress)) return;
      await pause();
      await send('result', event.task, task.result);
    }

    return {
      [roles.lead]: {
        async start(send) {
          await pause();
          await Promise.all(Object.entries(tasks).map(([id, task]) =>
            send('assignment', id, task.assignment)));
        },
        async receive(event) {
          if (event.type === 'result') await pause();
        },
      },
      [roles.review]: { receive: reviewAssignment },
      [roles.test]: { receive: reviewAssignment },
    };
  }

  root.dosaiCoordinationPrototype = Object.freeze({ assignRole, createSession, defaultRoles, names, sampleAgents });
})(globalThis);
