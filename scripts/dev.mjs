import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build, createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const electronPath = join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.CMD' : 'electron',
);

await rm(resolve(root, 'dist'), { force: true, recursive: true });
await Promise.all([
  build({ configFile: resolve(root, 'vite.main.config.ts'), mode: 'development' }),
  build({ configFile: resolve(root, 'vite.preload.config.ts'), mode: 'development' }),
]);

const server = await createServer({
  configFile: resolve(root, 'vite.renderer.config.ts'),
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});

await server.listen();

const child = spawn(electronPath, ['.'], {
  cwd: root,
  env: {
    ...process.env,
    DOSAI_RENDERER_URL: 'http://127.0.0.1:5173/',
    ELECTRON_ENABLE_SECURITY_WARNINGS: 'true',
  },
  stdio: 'inherit',
});

const shutdown = async (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
  await server.close();
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

child.once('exit', (code) => {
  void server.close().finally(() => process.exit(code ?? 1));
});
