import './session.js';

const { tasks } = globalThis.dosaiCoordinationPrototype;

export function projectDemo(project, publish, { pause = () => new Promise(resolve => setTimeout(resolve, 750)) } = {}) {
  let running = false;

  function view(saved = project.snapshot()) {
    return { ...saved, active: running && saved.phase === 'running' };
  }

  function stop() {
    const stopped = view(project.stop());
    publish(stopped);
    return stopped;
  }

  async function run(roles) {
    if (running) return view();
    let initial = project.snapshot();
    if (initial.phase === 'idle') initial = project.start(roles);
    if (initial.phase !== 'running') return view(initial);

    running = true;
    try {
      publish(view(initial));
      const lead = project.forActor(initial.roles.lead);
      await pause();
      for (const [task, fixture] of Object.entries(tasks)) {
        const saved = project.snapshot();
        if (saved.phase !== 'running') return view(saved);
        if (saved.tasks[task].status === 'pending') {
          publish(view(lead.update({ task, type: 'assignment', expectedRevision: 0, note: fixture.assignment })));
        }
      }

      const outcomes = await Promise.allSettled(Object.entries(tasks).map(async ([task, fixture]) => {
        const specialist = project.forActor(initial.roles[task]);
        for (const type of ['progress', 'result']) {
          await pause();
          const saved = specialist.snapshot();
          const previous = saved.tasks[task];
          if (saved.phase !== 'running' || previous.status === 'complete') return;
          if (type === 'progress' && previous.status === 'reviewing') continue;
          publish(view(specialist.update({ task, type, expectedRevision: previous.revision, note: fixture[type] })));
        }
      }));
      if (outcomes.some(outcome => outcome.status === 'rejected')) {
        throw new Error('The demo could not advance both saved tasks.');
      }
    } finally {
      running = false;
      publish(view());
    }
    return view();
  }

  return Object.freeze({ run, stop, view });
}
