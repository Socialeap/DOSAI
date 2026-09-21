import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { transformWithOxc } from 'vite';

const root = resolve(import.meta.dirname, '../..');

async function importStandaloneTypeScript(path) {
  const source = await readFile(path, 'utf8');
  const { code: output } = await transformWithOxc(source, path);
  const encoded = Buffer.from(output).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const recovery = await importStandaloneTypeScript(
  join(root, 'src/main/window/renderer-recovery.ts'),
);

test('renderer recovery ignores clean exits and admits abnormal termination', () => {
  const budget = recovery.createRendererRecoveryBudget(() => 1_000);

  assert.equal(budget.tryAcquire('clean-exit'), false);
  assert.equal(budget.tryAcquire('crashed'), true);
  assert.equal(budget.tryAcquire('killed'), true);
});

test('renderer recovery is bounded to three attempts per minute', () => {
  const budget = recovery.createRendererRecoveryBudget(() => 10_000);

  assert.equal(budget.tryAcquire('crashed'), true);
  assert.equal(budget.tryAcquire('crashed'), true);
  assert.equal(budget.tryAcquire('crashed'), true);
  assert.equal(budget.tryAcquire('crashed'), false);
});

test('renderer recovery budget renews only after the fixed interval', () => {
  let currentTime = 20_000;
  const budget = recovery.createRendererRecoveryBudget(() => currentTime);

  for (let attempt = 0; attempt < recovery.RENDERER_RECOVERY_LIMIT; attempt += 1) {
    assert.equal(budget.tryAcquire('oom'), true);
  }

  currentTime += recovery.RENDERER_RECOVERY_INTERVAL_MS - 1;
  assert.equal(budget.tryAcquire('oom'), false);

  currentTime += 1;
  assert.equal(budget.tryAcquire('oom'), true);
});

test('renderer recovery fails closed for an invalid clock', () => {
  const budget = recovery.createRendererRecoveryBudget(() => Number.NaN);

  assert.equal(budget.tryAcquire('crashed'), false);
});

test('renderer recovery fails closed when its clock moves backward', () => {
  let currentTime = 2_000;
  const budget = recovery.createRendererRecoveryBudget(() => currentTime);

  assert.equal(budget.tryAcquire('crashed'), true);
  currentTime = 1_999;
  assert.equal(budget.tryAcquire('crashed'), false);
});
