(function mountDashboard() {
  'use strict';

  const { createSession, sampleAgents } = globalThis.dosaiCoordinationPrototype;
  const byId = id => document.getElementById(id);
  const graph = byId('graph');
  const link = byId('link');
  const label = byId('link-label');
  const activity = byId('activity');
  const run = byId('run');
  const stop = byId('stop');
  const lead = byId('lead-state');
  const specialist = byId('specialist-state');

  const views = {
    ready: ['Preparing assignment', 'Waiting', 'Preparing assignment'],
    assigned: ['Waiting for review', 'Assigned', 'Assignment to specialist'],
    reviewing: ['Progress received', 'Reviewing', 'Progress to lead'],
    delivered: ['Reading result', 'Result sent', 'Result to lead'],
    complete: ['Review complete', 'Done', 'Result received'],
    blocked: ['Session blocked', 'Stopped', 'A message or agent response was rejected'],
    stopped: ['Session stopped', 'Stopped', 'Session stopped'],
  };
  const eventLabels = {
    assignment: 'Lead → Specialist',
    progress: 'Specialist → Lead',
    result: 'Specialist → Lead',
  };
  const pause = () => new Promise(resolve => setTimeout(resolve, 750));
  let session;

  function render({ phase, events }) {
    const [leadState, specialistState, labelText] = views[phase];
    const lastEvent = events.at(-1);
    graph.dataset.phase = phase;
    lead.textContent = leadState;
    specialist.textContent = specialistState;
    label.textContent = labelText;
    link.dataset.direction = ['assigned', 'reviewing', 'delivered', 'complete'].includes(phase)
      ? lastEvent.from : 'none';
    const finished = ['blocked', 'stopped', 'complete'].includes(phase);
    run.disabled = !finished;
    stop.disabled = finished;

    activity.replaceChildren(...events.map(event => {
      const item = document.createElement('li');
      const direction = document.createElement('strong');
      direction.textContent = eventLabels[event.type];
      item.append(direction, event.text);
      return item;
    }));
  }

  run.addEventListener('click', () => {
    session = createSession({ ...sampleAgents(pause), onUpdate: render });
    void session.start();
  });
  stop.addEventListener('click', () => session?.stop());
})();
