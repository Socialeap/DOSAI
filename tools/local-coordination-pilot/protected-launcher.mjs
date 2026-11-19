import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseStrictJsonBytes } from '../../src/contracts/strict-json.ts';
import { createPilotBroker } from './broker.mjs';
import { openMcpSession } from './mcp-session.mjs';
import { frameCodec, frameType, protectedPipe } from './protected-frame.mjs';

const helper = fileURLToPath(new URL('inspect-macos-peer.py', import.meta.url));
const fixture = fileURLToPath(new URL('protected-fixture-child.mjs', import.meta.url));
const env = { PATH: '/usr/bin:/bin' };
const hello = Buffer.from('dosai-protected-fixture-ready-v1');
const actors = ['codex', 'claude'];

function readIdentity(pid, executable) {
  const read = spawnSync('/usr/bin/python3', ['-I', '-B', helper, String(pid)], {
    env, stdio: ['ignore', 'ignore', 'ignore', 'pipe'], timeout: 1500, maxBuffer: 2048,
  });
  if (read.status !== 0 || !read.output?.[3]?.length) throw new Error('Could not verify launched peer.');
  const values = parseStrictJsonBytes(read.output[3]);
  if (!Array.isArray(values) || values.length !== 6) throw new Error('Invalid peer identity.');
  const [observedPid, parent, uid, seconds, micros, path] = values;
  if (observedPid !== pid || parent !== process.pid || uid !== process.getuid() ||
      !Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isSafeInteger(micros) ||
      micros < 0 || micros >= 1_000_000 || typeof path !== 'string' || realpathSync(path) !== executable) {
    throw new Error('Wrong launched peer identity.');
  }
  return JSON.stringify(values);
}

async function exchange(worker, broker, executable) {
  const { child, pipe, actor } = worker;
  if (!(await pipe.bootstrap(1)).equals(Buffer.from('R'))) throw new Error('Peer bootstrap rejected.');
  const identity = readIdentity(child.pid, executable);
  const session = randomBytes(16);
  const seed = randomBytes(32);
  const endpoint = createHash('sha256').update(JSON.stringify([actor, identity])).digest().subarray(0, 16);
  let read;
  let write;
  let rpc;

  try {
    const context = { seed, session, endpoint };
    read = frameCodec(context, 2);
    write = frameCodec(context, 1);
    const bootstrap = Buffer.concat([seed, session, endpoint]);
    try {
      await pipe.write(bootstrap);
    } finally {
      bootstrap.fill(0);
      seed.fill(0);
    }

    const proof = await pipe.readFrame(read);
    if (proof?.type !== frameType.hello || !proof.payload.equals(hello) ||
        readIdentity(child.pid, executable) !== identity) {
      throw new Error('Authenticated peer bootstrap rejected.');
    }

    rpc = openMcpSession(broker.bind(actor));
    let correlation = 0;
    while (true) {
      const request = await pipe.readFrame(read);
      if (!request) break;
      if (request.type !== frameType.request || request.correlation !== ++correlation) {
        throw new Error('Protected request order rejected.');
      }
      const result = rpc.handle(request.payload);
      const body = Buffer.from(result === undefined ? '' : JSON.stringify(result));
      await pipe.write(write.encode(frameType.response, request.correlation, body));
    }

    const [code, signal] = await worker.exited;
    if (code !== 0 || signal !== null) throw new Error('Fixture peer did not exit cleanly.');
  } finally {
    seed.fill(0);
    rpc?.close();
    read?.destroy();
    write?.destroy();
    pipe.close();
  }
}

// Fixed disposable fixture children. No client paths, arbitrary commands, or live provider entry point.
export async function runProtectedFixture(project) {
  if (process.platform !== 'darwin' || typeof process.getuid !== 'function') {
    throw new Error('The protected launcher fixture requires macOS.');
  }
  const executable = realpathSync(process.execPath);
  const broker = createPilotBroker(project, { lifetimeMs: 12_000 });
  const children = [];
  function terminate() {
    for (const { child, pipe } of children) {
      pipe.close();
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }
  const deadline = setTimeout(terminate, 12_000);
  try {
    for (const actor of actors) {
      const child = spawn(executable, [fixture, actor], {
        env, stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
      });
      const exited = once(child, 'close');
      // A failed spawn can settle before the handshake finishes.
      void exited.catch(() => {});
      children.push({ child, actor, exited, pipe: protectedPipe(child.stdio[3]) });
    }
    const exchanges = children.map(worker => exchange(worker, broker, executable));
    try {
      await Promise.all(exchanges);
    } catch (error) {
      terminate();
      await Promise.allSettled(exchanges);
      broker.stop();
      throw error;
    }
    const saved = project.snapshot();
    if (saved.tasks.review.status !== 'complete') {
      broker.stop();
      throw new Error('The protected fixture did not complete its review.');
    }
    return saved;
  } finally {
    clearTimeout(deadline);
    terminate();
    await Promise.allSettled(children.map(worker => worker.exited));
  }
}
