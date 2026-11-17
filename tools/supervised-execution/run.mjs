import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { verifyAuditJournal } from '../../native-helpers/audit/journal.ts';
import { createLocalFixtureSession } from './runtime.mjs';
import { createEvidenceDirectory } from './evidence-directory.ts';
import { admitRequest } from './contracts.ts';
import { readFixtureHandoff } from './handoff.mjs';

function readOperatorRequest(args) {
  if (args.length === 2 && args[0] === '--handoff') {
    return readFixtureHandoff(args[1]);
  }
  if (args.length > 1) throw new Error('ARGUMENT_COUNT');
  return admitRequest({
    version: 1, action: args[0] ?? 'SUMMARIZE_FIXTURE', fixture: 'beta-core-v1', generation: '1',
  });
}

let request;
if (process.version !== 'v24.18.0') {
  console.error('PINNED_RUNTIME_REQUIRED: use Node v24.18.0.');
  process.exitCode = 2;
} else {
  try {
    request = readOperatorRequest(process.argv.slice(2));
  } catch {
    console.error('Usage: node tools/supervised-execution/run.mjs [SUMMARIZE_FIXTURE|LIST_FIXTURE_FAILURES|--handoff TOKEN]');
    process.exitCode = 2;
  }
}

if (request && (!process.stdin.isTTY || !process.stdout.isTTY)) {
  console.error('INTERACTIVE_OPERATOR_REQUIRED: piped approval is unavailable. Use the automated test suite for fixtures.');
  process.exitCode = 2;
} else if (request) {
  const directory = await createEvidenceDirectory(resolve(import.meta.dirname, '../..'), 'supervised-fixture-');
  const databasePath = join(directory, 'audit.sqlite3');
  const engine = await createLocalFixtureSession(databasePath);
  const prepared = engine.prepare(request);
  let result = prepared;
  if (prepared.status === 'AWAITING_APPROVAL') {
    console.log('DOSAI local fixture proof — no shell, provider or external action. Synthetic test approval only.');
    console.log(JSON.stringify(prepared, null, 2));
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await prompt.question('Type the exact approvalInstruction above to evaluate the fixture (60 seconds; anything else denies):\n', {
        signal: AbortSignal.timeout(60_000),
      });
      result = engine.run(prepared, answer);
    } catch {
      result = engine.stop();
    } finally {
      prompt.close();
    }
  }
  // Receipt exports are ignored local evidence, never canonical journal authority.
  try {
    await writeFile(join(directory, 'receipts.json'), JSON.stringify(engine.receipts(), null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    const last = engine.receipts().filter(receipt => receipt.acknowledgement !== null).at(-1)?.acknowledgement;
    if (!last) throw new Error('NO_DURABLE_RECEIPT');
    verifyAuditJournal(databasePath, { journalId: last.journal_id, journalEpochId: last.journal_epoch_id }, {
      sequence: last.sequence, eventHash: last.event_hash,
    });
    console.log(JSON.stringify(result, null, 2));
    console.log(`Local evidence: ${directory}`);
    console.log('Assurance: local durable only; unsigned/unanchored receipt tail; no external execution or performance claim.');
    process.exitCode = result.body?.status === 'SUCCEEDED' && result.audit === 'LOCAL_DURABLE' ? 0 : 1;
  } catch {
    engine.stop();
    console.error('EVIDENCE_UNAVAILABLE: do not treat this run as validated. Preserve the local evidence directory for diagnosis.');
    process.exitCode = 1;
  }
}
