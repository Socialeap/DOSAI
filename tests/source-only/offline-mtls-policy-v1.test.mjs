import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, realpath, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  inspectDeviceActivation, runLocalFixtureReview,
} from '../../tools/mtls-device-test/local-policy-v1.mjs';

const native = process.env.DOSAI_OFFLINE_MTLS_NATIVE;
assert.match(native, /^\/private\/tmp\/dosai-mtls-policy-v1\.[A-Za-z0-9]+\/offline-mtls-activation-v1$/);
assert.equal(process.version, 'v24.18.0');

async function database(t) {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'dosai-mtls-policy-')));
  t.after(() => rm(path, { recursive: true, force: true }));
  return join(path, 'audit.sqlite3');
}

function nativeChannel(t, mode) {
  const signal = AbortSignal.timeout(10_000);
  // The test fixture has no live path. Its only commands select synthetic inputs.
  const child = spawn(native, [mode], {
    env: {},
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
    signal,
  });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, exitSignal) => resolve({ exitCode, exitSignal }));
  });
  completed.catch(() => {});
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await completed.catch(() => {});
  });

  const incoming = child.stdio[4][Symbol.asyncIterator]();
  const outgoing = child.stdio[3];
  outgoing.on('error', () => {});
  return {
    signal,
    channel: {
      async takeProposal() {
        const { value, done } = await incoming.next();
        return done ? null : value;
      },
      async reviewPlan(binding) {
        outgoing.end(binding);
        const parts = [];
        let count = 0;
        for await (const bytes of incoming) {
          count += bytes.length;
          assert.ok(count <= 33);
          parts.push(bytes);
        }
        assert.deepEqual(await completed, { exitCode: 0, exitSignal: null });
        return Buffer.concat(parts);
      },
    },
  };
}

test('the merger still has no live activation authority and all three readiness blockers', async () => {
  assert.deepEqual(await inspectDeviceActivation(), {
    status: 'NO_GO',
    reason: 'LIVE_ACTIVATION_UNAVAILABLE',
    blockers: ['BETA-CP-004', 'BETA-CP-005', 'BETA-CP-006'],
  });
});

test('the local policy engine verifies native approval, denial, and a late policy stop', async (t) => {
  for (const mode of ['approve', 'deny', 'late-stop']) {
    await t.test(mode, async (t) => {
      const path = await database(t);
      const { channel, signal } = nativeChannel(t, mode);
      const outcome = await runLocalFixtureReview(channel, path, signal);
      const expected = {
        approve: ['SUCCEEDED', 'FIXTURE_EVALUATED', { suites: 3, passed: 18, failed: 1 }],
        deny: ['DENIED', 'OWNER_DENIED', null],
        'late-stop': ['STOPPED', 'STOP_ENGAGED', null],
      }[mode];
      assert.deepEqual(outcome, {
        status: expected[0], reason: expected[1], result: expected[2], audit: 'LOCAL_DURABLE', effects: 'NONE',
      });
      assert.deepEqual(await runLocalFixtureReview(channel, path, signal), {
        status: 'REJECTED', reason: 'CHANNEL_CONSUMED',
      });
    });
  }
});

test('malformed or absent proposals never create an audit journal or request approval', async (t) => {
  const path = await database(t);
  for (const proposal of [null, 'P', Buffer.from('PP'), Buffer.from('C')]) {
    const channel = {
      takeProposal: async () => proposal,
      reviewPlan: () => assert.fail('Unexpected local review'),
    };
    assert.deepEqual(await runLocalFixtureReview(channel, path), {
      status: 'REJECTED', reason: 'PROPOSAL_REJECTED',
    });
  }
  await assert.rejects(access(path), { code: 'ENOENT' });
});

test('a stale or malformed decision or concurrent stop cannot evaluate anything', async (t) => {
  for (const variation of ['stale-digest', 'extra-byte', 'bad-disposition', 'aborted']) {
    const path = await database(t);
    const controller = new AbortController();
    const channel = {
      takeProposal: async () => Buffer.from('P'),
      async reviewPlan(binding) {
        const decision = Buffer.concat([Buffer.from('C'), binding]);
        if (variation === 'stale-digest') decision[1] ^= 1;
        if (variation === 'extra-byte') return Buffer.concat([decision, Buffer.alloc(1)]);
        if (variation === 'bad-disposition') decision[0] = 0x50;
        if (variation === 'aborted') controller.abort();
        return decision;
      },
    };
    assert.deepEqual(await runLocalFixtureReview(channel, path, controller.signal), {
      status: 'STOPPED', reason: 'STOP_ENGAGED', audit: 'LOCAL_DURABLE', effects: 'NONE', result: null,
    });
  }
});

test('lost audit continuity withholds the approved result', async (t) => {
  const path = await database(t);
  let reviewed = false;
  const channel = {
    takeProposal: async () => Buffer.from('P'),
    async reviewPlan(binding) {
      await unlink(path);
      reviewed = true;
      return Buffer.concat([Buffer.from('C'), binding]);
    },
  };
  assert.deepEqual(await runLocalFixtureReview(channel, path), {
    status: 'UNKNOWN', reason: 'OUTCOME_UNVERIFIED',
  });
  assert.equal(reviewed, true);
});
