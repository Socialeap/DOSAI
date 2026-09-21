import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';

const root = resolve(import.meta.dirname, '../..');
const appBundle = join(root, 'out/DOSAI-darwin-arm64/DOSAI.app');
const executable = join(appBundle, 'Contents/MacOS/DOSAI');
const asarPath = join(appBundle, 'Contents/Resources/app.asar');
const startupTimeoutMs = 20_000;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function reserveLoopbackPort() {
  const server = createServer();
  server.unref();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('PORT_RESERVATION_FAILED');
  }
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
  });
  return address.port;
}

function sanitizedEnvironment() {
  const environment = {};
  for (const name of ['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR']) {
    if (process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  return environment;
}

function launchPackagedApplication(port, profile) {
  return spawn(
    executable,
    [
      `--remote-debugging-address=127.0.0.1`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
    ],
    {
      detached: true,
      env: sanitizedEnvironment(),
      shell: false,
      stdio: 'ignore',
    },
  );
}

async function waitForExit(child, timeoutMs = 8_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return Promise.race([
    once(child, 'exit').then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
}

async function stopOwnedProcessGroup(child, signal) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error;
    }
  }

  return waitForExit(child);
}

async function findPageTarget(port, child, timeoutMs = startupTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('APPLICATION_EXITED_EARLY');
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(
          (target) =>
            target.type === 'page' &&
            target.url === 'dosai://app/' &&
            typeof target.webSocketDebuggerUrl === 'string',
        );
        if (page !== undefined) {
          return page;
        }
      }
    } catch {
      // The local endpoint is expected to refuse connections during startup.
    }
    await delay(100);
  }

  throw new Error('PAGE_TARGET_TIMEOUT');
}

class CdpSession {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
  }

  async connect() {
    if (this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    await Promise.race([
      once(this.socket, 'open'),
      delay(5_000).then(() => {
        throw new Error('CDP_CONNECT_TIMEOUT');
      }),
    ]);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) {
        return;
      }
      const pending = this.pending.get(message.id);
      if (pending === undefined) {
        return;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error === undefined) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error('CDP_COMMAND_REJECTED'));
      }
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('CDP_TARGET_CLOSED'));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolveCommand, rejectCommand) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectCommand(new Error('CDP_COMMAND_TIMEOUT'));
      }, timeoutMs);
      this.pending.set(id, { reject: rejectCommand, resolve: resolveCommand, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (response.exceptionDetails !== undefined) {
      throw new Error('RUNTIME_EVALUATION_FAILED');
    }
    return response.result.value;
  }

  close() {
    if (this.socket.readyState < WebSocket.CLOSING) {
      this.socket.close();
    }
  }
}

async function connectToPage(port, child) {
  const target = await findPageTarget(port, child);
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();
  await session.send('Runtime.enable');
  return { session, targetId: target.id };
}

async function waitForHealthyPage(port, child, timeoutMs = startupTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let session;
    try {
      ({ session } = await connectToPage(port, child));
      const state = await session.evaluate(`(() => ({
        bridge: typeof window.dosai?.runtime?.getSnapshot === 'function',
        markerAbsent: globalThis.__dosai_crash_marker === undefined,
        shell: document.querySelector('.app-shell') !== null
      }))()`);
      if (state.bridge && state.markerAbsent && state.shell) {
        return session;
      }
    } catch {
      session?.close();
    }
    session?.close();
    await delay(100);
  }
  throw new Error('RECOVERY_TIMEOUT');
}

function createRecorder(report) {
  return (id, condition, measurement) => {
    const assertion = { id, result: condition ? 'PASS' : 'FAIL' };
    if (measurement !== undefined) {
      assertion.measurement = measurement;
    }
    report.assertions.push(assertion);
    return condition;
  };
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function runP1PackagedRuntimeAudit() {
  const startedAt = new Date().toISOString();
  const report = {
    schema: 'DOSAI_P1_ENGINEERING_AUDIT_V1',
    formal_acceptance_report: false,
    engineering_result: 'ERROR',
    started_at: startedAt,
    assertions: [],
    limitations: [
      'FORMAL_ACCEPTANCE_REPORT_NOT_EMITTED',
      'MINIMUM_MACOS_PROFILE_NOT_EXECUTED',
      'FUTURE_WORKER_FIXTURES_NOT_IMPLEMENTED',
      'TRUSTED_STOP_UI_NOT_APPLICABLE_WITH_EXECUTION_UNAVAILABLE',
    ],
  };
  const record = createRecorder(report);
  let child;
  let session;
  let profile;
  let stage = 'PREREQUISITES';

  try {
    const [executableStats, asarStats] = await Promise.all([stat(executable), stat(asarPath)]);
    record('P1-PACKAGE-EXECUTABLE', executableStats.isFile());
    record('P1-PACKAGE-ASAR', asarStats.isFile());
    report.package = {
      app_asar_sha256: await sha256(asarPath),
    };

    profile = await mkdtemp(join(tmpdir(), 'dosai-p1-audit-'));
    const firstPort = await reserveLoopbackPort();
    child = launchPackagedApplication(firstPort, profile);

    stage = 'BOUNDARY_PROBES';
    session = await waitForHealthyPage(firstPort, child);
    const boundary = await session.evaluate(`(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      globalThis.__dosai_inline_probe = false;
      const inlineScript = document.createElement('script');
      inlineScript.textContent = 'globalThis.__dosai_inline_probe = true';
      document.head.append(inlineScript);
      await wait(50);

      const rejectedFetch = async (url) => {
        try {
          await fetch(url);
          return false;
        } catch {
          return true;
        }
      };
      const rejectedImport = async () => {
        try {
          await import('node:fs');
          return false;
        } catch {
          return true;
        }
      };
      const rejectedCall = async (value) => {
        try {
          await window.dosai.runtime.getSnapshot(value);
          return false;
        } catch {
          return true;
        }
      };

      const frame = document.createElement('iframe');
      frame.srcdoc = '<p>isolated</p>';
      document.body.append(frame);
      await wait(50);
      let frameBridgeUnavailable = true;
      try {
        frameBridgeUnavailable = typeof frame.contentWindow?.dosai === 'undefined';
      } catch {
        frameBridgeUnavailable = true;
      }
      frame.remove();

      const snapshot = await window.dosai.runtime.getSnapshot();
      const repeated = await Promise.all(
        Array.from({ length: 100 }, () => window.dosai.runtime.getSnapshot()),
      );
      const serialized = JSON.stringify(snapshot);

      let notificationDenied = true;
      if (typeof Notification !== 'undefined') {
        notificationDenied = (await Notification.requestPermission()) === 'denied';
      }

      return {
        bridgeKeysExact: JSON.stringify(Object.keys(window.dosai)) === '["runtime"]',
        frameBridgeUnavailable,
        frozenBridge: Object.isFrozen(window.dosai) && Object.isFrozen(window.dosai.runtime),
        inlineScriptBlocked: globalThis.__dosai_inline_probe === false,
        nodeGlobalsAbsent: typeof globalThis.require === 'undefined' && typeof globalThis.process === 'undefined',
        nodeImportRejected: await rejectedImport(),
        notificationDenied,
        oversizedArgumentRejected: await rejectedCall('x'.repeat(1024 * 1024)),
        popupDenied: window.open('https://example.invalid/') === null,
        repeatedSnapshotsStable: repeated.every((item) => JSON.stringify(item) === serialized),
        runtimeKeysExact: JSON.stringify(Object.keys(window.dosai.runtime)) === '["getSnapshot"]',
        shellVisible: document.querySelector('.app-shell') !== null,
        unknownMethodAbsent: typeof window.dosai.runtime.unknown === 'undefined',
        externalFetchRejected: await rejectedFetch('https://example.invalid/'),
        fileFetchRejected: await rejectedFetch('file:///etc/passwd'),
        extraArgumentRejected: await rejectedCall('extra'),
        platformProfile: snapshot.platformProfile,
        runtimeVersions: snapshot.versions
      };
    })()`);

    record('P1-BOUNDARY-NODE-GLOBALS-ABSENT', boundary.nodeGlobalsAbsent);
    record('P1-BOUNDARY-BRIDGE-EXACT', boundary.bridgeKeysExact && boundary.runtimeKeysExact);
    record('P1-BOUNDARY-BRIDGE-FROZEN', boundary.frozenBridge);
    record('P1-BOUNDARY-UNKNOWN-METHOD-ABSENT', boundary.unknownMethodAbsent);
    record('P1-BOUNDARY-EXTRA-ARGUMENT-REJECTED', boundary.extraArgumentRejected);
    record('P1-BOUNDARY-OVERSIZED-ARGUMENT-REJECTED', boundary.oversizedArgumentRejected);
    record('P1-BOUNDARY-DUPLICATE-READ-STABLE', boundary.repeatedSnapshotsStable);
    record('P1-BOUNDARY-SUBFRAME-UNAVAILABLE', boundary.frameBridgeUnavailable);
    record('P1-CSP-INLINE-SCRIPT-BLOCKED', boundary.inlineScriptBlocked);
    record('P1-CSP-NODE-IMPORT-REJECTED', boundary.nodeImportRejected);
    record('P1-SESSION-EXTERNAL-FETCH-REJECTED', boundary.externalFetchRejected);
    record('P1-SESSION-FILE-FETCH-REJECTED', boundary.fileFetchRejected);
    record('P1-SESSION-POPUP-DENIED', boundary.popupDenied);
    record('P1-SESSION-PERMISSION-DENIED', boundary.notificationDenied);
    record('P1-UI-SHELL-VISIBLE', boundary.shellVisible);
    record('P1-PLATFORM-PROFILE-PINNED', boundary.platformProfile === 'MACOS_ARM64_V1');
    report.runtime = boundary.runtimeVersions;

    stage = 'NAVIGATION_PROBES';
    const navigation = await session.evaluate(`(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      location.href = 'https://example.invalid/hostile';
      await wait(100);
      const hostileDenied = location.href === 'dosai://app/';
      location.href = 'mailto:audit@example.invalid';
      await wait(100);
      return { externalProtocolDenied: location.href === 'dosai://app/', hostileDenied };
    })()`);
    record('P1-NAVIGATION-HOSTILE-DENIED', navigation.hostileDenied);
    record('P1-NAVIGATION-EXTERNAL-PROTOCOL-DENIED', navigation.externalProtocolDenied);

    stage = 'LOAD_PROBE';
    const load = await session.evaluate(`(async () => {
      const requestCount = 2000;
      const started = performance.now();
      const timer = new Promise((resolve) => {
        setTimeout(() => resolve(performance.now() - started), 0);
      });
      const snapshots = Promise.all(
        Array.from({ length: requestCount }, () => window.dosai.runtime.getSnapshot()),
      );
      const [timerDelayMs, results] = await Promise.all([timer, snapshots]);
      return {
        elapsedMs: performance.now() - started,
        requestCount,
        stable: results.every((item) => item.platformProfile === 'MACOS_ARM64_V1'),
        timerDelayMs,
        uiReachable: document.querySelector('.app-shell') !== null
      };
    })()`);
    record('P1-LOAD-READS-STABLE', load.stable && load.requestCount === 2000, load.requestCount);
    record('P1-LOAD-UI-REACHABLE', load.uiReachable);
    record('P1-LOAD-TIMER-RESPONSIVE', load.timerDelayMs < 2_000, Math.round(load.timerDelayMs));
    record('P1-LOAD-BOUNDED', load.elapsedMs < 10_000, Math.round(load.elapsedMs));

    stage = 'RENDERER_CRASH_RECOVERY';
    await session.evaluate(`(() => { globalThis.__dosai_crash_marker = true; return true; })()`);
    try {
      await session.send('Page.crash');
    } catch {
      // Crashing the target normally rejects the in-flight CDP command.
    }
    session.close();
    session = await waitForHealthyPage(firstPort, child);
    const recoveredSnapshot = await session.evaluate(`window.dosai.runtime.getSnapshot()`);
    record('P1-RECOVERY-RENDERER-RELOADED', recoveredSnapshot.platformProfile === 'MACOS_ARM64_V1');

    stage = 'UNCLEAN_RESTART';
    session.close();
    session = undefined;
    const killed = await stopOwnedProcessGroup(child, 'SIGKILL');
    record('P1-RECOVERY-UNCLEAN-TERMINATION-OBSERVED', killed);
    child = undefined;

    const secondPort = await reserveLoopbackPort();
    child = launchPackagedApplication(secondPort, profile);
    session = await waitForHealthyPage(secondPort, child);
    const restartedSnapshot = await session.evaluate(`window.dosai.runtime.getSnapshot()`);
    record('P1-RECOVERY-UNCLEAN-RESTART', restartedSnapshot.platformProfile === 'MACOS_ARM64_V1');

    report.engineering_result = report.assertions.every(({ result }) => result === 'PASS')
      ? 'PASS'
      : 'FAIL';
  } catch (error) {
    report.engineering_result = 'ERROR';
    report.failure_stage = stage;
    report.failure_code = /^[A-Z][A-Z0-9_]{2,63}$/.test(error?.message)
      ? error.message
      : 'UNEXPECTED_AUDIT_ERROR';
  } finally {
    session?.close();
    let processCleanup = true;
    if (child !== undefined) {
      try {
        processCleanup = await stopOwnedProcessGroup(child, 'SIGTERM');
        if (!processCleanup) {
          processCleanup = await stopOwnedProcessGroup(child, 'SIGKILL');
        }
      } catch {
        processCleanup = false;
      }
    }
    record('P1-CLEANUP-PROCESS-GROUP', processCleanup);

    let profileCleanup = profile === undefined;
    if (profile !== undefined) {
      try {
        await rm(profile, { force: true, recursive: true });
        profileCleanup = true;
      } catch {
        profileCleanup = false;
      }
    }
    record('P1-CLEANUP-ISOLATED-PROFILE', profileCleanup);
    if (!processCleanup || !profileCleanup) {
      report.engineering_result = 'ERROR';
      report.failure_stage = 'CLEANUP';
    }

    report.finished_at = new Date().toISOString();
    const serialized = JSON.stringify(report);
    const secretPatterns = [
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
      /\bAKIA[0-9A-Z]{16}\b/,
    ];
    report.secret_scan = secretPatterns.every((pattern) => !pattern.test(serialized))
      ? 'PASS'
      : 'FAIL';
    if (report.secret_scan !== 'PASS') {
      report.engineering_result = 'ERROR';
      report.failure_stage = 'SECRET_SCAN';
    }
  }

  return report;
}

if (import.meta.main) {
  const report = await runP1PackagedRuntimeAudit();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.engineering_result === 'PASS' ? 0 : 1;
}
