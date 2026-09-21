import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runP1PackagedRuntimeAudit } from '../../../tests/runtime/p1-packaged-runtime-audit.mjs';
import { digestObject } from './canonical-json.mjs';
import { runFixed } from './fixed-process.mjs';

const appBundle = 'out/DOSAI-darwin-arm64/DOSAI.app';
const asarPath = 'out/DOSAI-darwin-arm64/DOSAI.app/Contents/Resources/app.asar';

function childEnvironment() {
  const environment = {};
  for (const name of ['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR']) {
    if (process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  return environment;
}

function normalizeAssertionId(id) {
  return id.replaceAll('-', '_');
}

function addResult(results, id, pass, measurement) {
  results.set(id, Object.freeze({
    ...(measurement === undefined ? {} : { measurement }),
    pass,
  }));
}

export async function executeP1Suite(root, suiteId) {
  const results = new Map();
  let audit;
  let errorCode;
  let packageDigest;

  try {
    await runFixed(process.execPath, ['scripts/package.mjs'], {
      cwd: root,
      env: childEnvironment(),
      timeout: 120_000,
    });
    addResult(results, 'P1_PACKAGE_BUILD_VERIFIED', true);

    await runFixed('/usr/bin/codesign', [
      '--verify',
      '--deep',
      '--strict',
      '--verbose=2',
      join(root, appBundle),
    ], {
      cwd: root,
      env: childEnvironment(),
      timeout: 30_000,
    });
    addResult(results, 'P1_PACKAGE_SIGNATURE_VALID', true);
    packageDigest = digestObject(await readFile(join(root, asarPath)));

    if (suiteId === 'P1-AT-002') {
      await runFixed(process.execPath, [
        '--test',
        'tests/architecture/renderer-authority.test.mjs',
      ], {
        cwd: root,
        env: childEnvironment(),
        timeout: 30_000,
      });
      addResult(results, 'P1_AUTHORITY_CORPUS_REJECTED', true);
    }

    audit = await runP1PackagedRuntimeAudit();
    for (const assertion of audit.assertions) {
      addResult(
        results,
        normalizeAssertionId(assertion.id),
        assertion.result === 'PASS',
        assertion.measurement,
      );
    }
    if (audit.engineering_result !== 'PASS' || audit.secret_scan !== 'PASS') {
      errorCode = 'DOSAI_P1_RUNTIME_AUDIT_FAILED_0001';
    }
  } catch {
    errorCode = 'DOSAI_P1_EXECUTION_FAILED_0001';
  }

  return Object.freeze({
    audit,
    errorCode,
    packageDigest,
    results,
  });
}
