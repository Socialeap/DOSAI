import { app, BrowserWindow, ipcMain, session } from 'electron';
import { closeSync, lstatSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProject } from './project-store.mjs';
import { projectDemo } from './project-demo.mjs';

const channels = {
  view: 'coordination:view', run: 'coordination:run', stop: 'coordination:stop', update: 'coordination:update',
};
const directory = fileURLToPath(new URL('.', import.meta.url));
const page = new URL('index.html', import.meta.url);
const allowedResources = new Set(['index.html', 'dashboard.css', 'session.js', 'dashboard.js']
  .map(file => new URL(file, page).href));
let profile;
let project;

function privatePath(path, directory) {
  const info = lstatSync(path);
  if ((directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) ||
      (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) {
    throw new Error('Use a private folder owned by your macOS user.');
  }
}

async function start() {
  const [root, ...extra] = process.argv.slice(2);
  if (!root || !isAbsolute(root) || extra.length) throw new Error('One absolute project directory is required.');
  privatePath(root, true);
  const database = join(root, 'coordination-project.sqlite');
  try {
    closeSync(openSync(database, 'wx', 0o600));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  privatePath(database, false);
  project = openProject(database);

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
    const version = record ? JSON.stringify([record.phase, record.active, record.revision]) : 'unavailable';
    if (version !== lastPublished && !contents.isDestroyed() && contents.getURL() === page.href) {
      contents.send(channels.update, record);
      lastPublished = version;
    }
  }
  const demo = projectDemo(project, publish);

  function handle(channel, count, action) {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== contents || event.senderFrame !== contents.mainFrame ||
          event.senderFrame?.url !== page.href || args.length !== count) {
        throw new Error('Rejected coordination request.');
      }
      return action(...args);
    });
  }
  handle(channels.view, 0, demo.view);
  handle(channels.run, 1, demo.run);
  handle(channels.stop, 0, demo.stop);
  await window.loadFile(fileURLToPath(page));
  const refresh = setInterval(() => {
    try {
      publish(demo.view());
    } catch {
      publish(null);
    }
  }, 500);
  window.once('closed', () => clearInterval(refresh));
}

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => project?.close());
process.once('exit', () => {
  if (profile) rmSync(profile, { recursive: true, force: true });
});
start().catch(() => {
  console.error('DOSAI Coordination could not open the private project.');
  app.quit();
  process.exitCode = 1;
});
