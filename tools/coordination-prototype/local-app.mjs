import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { closeSync, lstatSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProject } from './project-store.mjs';
import { projectDemo } from './project-demo.mjs';
import { createManagedReview } from '../local-coordination-pilot/managed-review.mjs';

const channels = {
  view: 'coordination:view', run: 'coordination:run', stop: 'coordination:stop', update: 'coordination:update',
};
const directory = fileURLToPath(new URL('.', import.meta.url));
const page = new URL('index.html', import.meta.url);
const allowedResources = new Set(['index.html', 'dashboard.css', 'session.js', 'dashboard.js']
  .map(file => new URL(file, page).href));
let profile;
let project;
let stopManagedReview;
let reviewShutdown;

function privatePath(path, directory) {
  const info = lstatSync(path);
  if ((directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) ||
      (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) {
    throw new Error('Use a private folder owned by your macOS user.');
  }
}

async function start() {
  const args = process.argv.slice(2);
  const managed = args[0] === '--managed-review';
  const [root, ...extra] = managed ? args.slice(1) : args;
  if (!root || !isAbsolute(root) || extra.length) throw new Error('One absolute project directory is required.');
  privatePath(root, true);
  const database = join(root, managed ? 'managed-review.sqlite' : 'coordination-project.sqlite');
  try {
    closeSync(openSync(database, 'wx', 0o600));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  privatePath(database, false);
  project = openProject(database, { mode: managed ? 'managed-review' : 'demo' });

  profile = mkdtempSync(join(tmpdir(), 'dosai-coordination-profile-'));
  app.setName('DOSAI Coordination');
  app.setPath('userData', profile);
  app.commandLine.appendSwitch('disable-background-networking');
  await app.whenReady();

  const partition = 'dosai-coordination-prototype';
  const localSession = session.fromPartition(partition);
  localSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !allowedResources.has(details.url) });
  });
  localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  localSession.setPermissionCheckHandler(() => false);

  const window = new BrowserWindow({
    title: 'DOSAI Coordination',
    width: 1100,
    height: 880,
    webPreferences: {
      partition,
      preload: join(directory, 'project-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());

  let lastPublished;
  function publish(record) {
    const version = record ? JSON.stringify([record.phase, record.active, record.revision, record.notice]) : 'unavailable';
    if (version !== lastPublished && !contents.isDestroyed() && contents.getURL() === page.href) {
      contents.send(channels.update, record);
      lastPublished = version;
    }
  }
  const controller = managed ? createManagedReview(project, publish, {
    async confirm(_plan, digest, signal) {
      const decision = await dialog.showMessageBox(window, {
        type: 'question', title: 'Approve DOSAI review',
        message: 'Allow one offline review?',
        detail: 'GPT Codex and Claude Code stand-ins will exchange a synthetic review in this project. ' +
          'This runs locally and costs $0.\n\nPlan ' + digest.slice(0, 12),
        buttons: ['Cancel', 'Run review'], defaultId: 0, cancelId: 0, signal,
      });
      return decision.response === 1;
    },
  }) : projectDemo(project, publish);
  if (managed) stopManagedReview = controller.shutdown;

  function handle(channel, count, action) {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== contents || event.senderFrame !== contents.mainFrame ||
          event.senderFrame?.url !== page.href || args.length !== count) {
        throw new Error('Rejected coordination request.');
      }
      return action(...args);
    });
  }
  handle(channels.view, 0, controller.view);
  handle(channels.run, managed ? 0 : 1, controller.run);
  handle(channels.stop, 0, controller.stop);
  await window.loadFile(fileURLToPath(page));
  if (!managed) {
    const refresh = setInterval(() => {
      try {
        publish(controller.view());
      } catch {
        publish(null);
      }
    }, 500);
    window.once('closed', () => clearInterval(refresh));
  }
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (!stopManagedReview) return;
  event.preventDefault();
  reviewShutdown ??= stopManagedReview().catch(() => {
    console.error('DOSAI Coordination could not save the final managed review state.');
    process.exitCode = 1;
  }).finally(() => {
    stopManagedReview = undefined;
    app.quit();
  });
});
app.on('will-quit', () => project?.close());
process.once('exit', () => {
  if (profile) rmSync(profile, { recursive: true, force: true });
});
start().catch(() => {
  console.error('DOSAI Coordination could not open the private project.');
  app.quit();
  process.exitCode = 1;
});
