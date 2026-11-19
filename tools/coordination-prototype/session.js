(function defineCoordinationPrototype(root) {
  'use strict';

  const sample = Object.freeze({
    id: 'sample-review-v1',
    checks: Object.freeze([
      { name: 'Valid input', covered: true },
      { name: 'Empty input', covered: false },
    ].map(Object.freeze)),
  });

  const routes = Object.freeze({
    assignment: { from: 'lead', to: 'specialist', before: 'ready', after: 'assigned' },
    progress: { from: 'specialist', to: 'lead', before: 'assigned', after: 'reviewing' },
    result: { from: 'specialist', to: 'lead', before: 'reviewing', after: 'delivered' },
  });
  const active = new Set(['ready', 'assigned', 'reviewing', 'delivered']);

  function createSession({ lead, specialist, onUpdate }) {
    let phase = 'idle';
    const events = [];
    const agents = { lead, specialist };

    function snapshot() {
      return Object.freeze({ phase, events: Object.freeze([...events]) });
    }

    function transition(next) {
      phase = next;
      onUpdate(snapshot());
    }

    async function deliver(from, type, taskId, text) {
      if (!active.has(phase)) return false;
      const route = typeof type === 'string' && Object.hasOwn(routes, type) ? routes[type] : null;
      if (!route || route.from !== from || route.before !== phase || taskId !== sample.id ||
          typeof text !== 'string' || text.length > 160 || !text.trim()) {
        transition('blocked');
        return false;
      }

      const event = Object.freeze({
        sequence: events.length + 1, type, from, to: route.to, taskId, text,
      });
      events.push(event);
      transition(route.after);
      if (!active.has(phase)) return false;

      await agents[route.to].receive(event, sender(route.to));
      if (type === 'result' && phase === 'delivered') transition('complete');
      return !['stopped', 'blocked'].includes(phase);
    }

    function sender(role) {
      return (type, taskId, text) => deliver(role, type, taskId, text);
    }

    async function start() {
      if (phase !== 'idle') return snapshot();
      transition('ready');
      try {
        if (active.has(phase)) await lead.start(sender('lead'));
      } catch {
        if (active.has(phase)) transition('blocked');
      }
      if (active.has(phase)) transition('blocked');
      return snapshot();
    }

    function stop() {
      if (active.has(phase)) transition('stopped');
      return snapshot();
    }

    return Object.freeze({ start, stop, snapshot });
  }

  function sampleAgents(pause) {
    return {
      lead: {
        async start(send) {
          await pause();
          await send('assignment', sample.id, 'Check coverage for the sample input handler.');
        },
        async receive(event) {
          if (event.type === 'result') await pause();
        },
      },
      specialist: {
        async receive(event, send) {
          await pause();
          if (!await send('progress', event.taskId, 'Comparing the expected cases with the test list.')) return;
          await pause();
          const missing = sample.checks.find(check => !check.covered);
          await send('result', event.taskId, `Missing test: ${missing.name.toLowerCase()}.`);
        },
      },
    };
  }

  root.dosaiCoordinationPrototype = Object.freeze({ createSession, sample, sampleAgents });
})(globalThis);
