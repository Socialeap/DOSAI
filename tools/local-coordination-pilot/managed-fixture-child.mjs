// Disposable stand-in. Emits the documented CLI response envelopes for synthetic data.
if (process.argv.length !== 2) process.exit(2);

const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 2048) process.exit(2);
  chunks.push(chunk);
}
const turn = JSON.parse(Buffer.concat(chunks).toString('utf8'));

if (turn.actor === 'codex' && ['assign', 'acknowledge'].includes(turn.step)) {
  const [field] = turn.schema.required;
  const text = JSON.stringify({ [field]: turn.schema.properties[field].enum[0] });
  for (const event of [
    { type: 'thread.started', thread_id: 'synthetic-fixture' },
    { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'fixture-result', type: 'agent_message', text } },
    { type: 'turn.completed' },
  ]) process.stdout.write(JSON.stringify(event) + '\n');
} else if (turn.actor === 'claude' && turn.step === 'review') {
  process.stdout.write(JSON.stringify({
    type: 'result', subtype: 'success', is_error: false,
    structured_output: { finding: 'missing_validation' },
  }) + '\n');
} else {
  process.exitCode = 2;
}
