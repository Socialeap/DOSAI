import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

let sequence = 0;
let pending;
process.on('message', reply => {
  assert.equal(reply.id, sequence);
  const resolve = pending;
  pending = undefined;
  resolve(reply);
});

function request(method, params) {
  const frame = JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method, params });
  return new Promise(resolve => {
    pending = resolve;
    process.send(frame);
  });
}

async function invoke(name, args = {}) {
  const { result } = await request('tools/call', { name, arguments: args });
  assert.equal(result.isError, undefined);
  return JSON.parse(result.content[0].text);
}

async function waitFor(status) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const record = await invoke('dosai_read_project');
    if (record.status === status) return record;
    await delay(25);
  }
  throw new Error('Did not observe the expected shared task state.');
}

try {
  const initialized = await request('initialize', {
    protocolVersion: '2025-06-18', clientInfo: { name: 'offline-fixture', version: '1' }, capabilities: {},
  });
  assert.equal(initialized.result.protocolVersion, '2025-06-18');
  process.send('{"jsonrpc":"2.0","method":"notifications/initialized"}');
  if (process.argv[2] === 'lead') {
    const before = await invoke('dosai_read_project');
    await invoke('dosai_assign_review', { expectedRevision: before.revision });
    assert.equal((await waitFor('complete')).note, 'The fixture needs an empty-input check.');
  } else {
    assert.equal(process.argv[2], 'specialist');
    const assigned = await waitFor('assigned');
    const progress = await invoke('dosai_report_review', { expectedRevision: assigned.revision, note: 'checking' });
    await invoke('dosai_complete_review', { expectedRevision: progress.revision, note: 'missing_validation' });
  }
} finally {
  process.disconnect();
}
