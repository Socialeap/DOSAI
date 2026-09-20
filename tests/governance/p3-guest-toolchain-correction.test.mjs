import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const patchPath = resolve(
  root,
  'guest-build/patches/buildroot-2025.02.16/0001-package-go-security-bump-to-go-1.26.5.patch',
);

test('accepted Go pin correction is narrow, source-only, and non-runnable', async () => {
  const [decision, evidence, patch, priorDecision] = await Promise.all([
    readFile(resolve(root, 'docs/decisions/0017-correct-buildroot-guest-agent-go-pin.md'), 'utf8'),
    readFile(resolve(root, 'docs/development/p3-guest-toolchain-correction-evidence.md'), 'utf8'),
    readFile(patchPath, 'utf8'),
    readFile(resolve(root, 'docs/decisions/0016-guest-agent-language-and-toolchain.md'), 'utf8'),
  ]);

  assert.match(decision, /\*\*Status:\*\* Accepted/);
  assert.match(decision, /\*\*Supersedes:\*\* ADR 0016/);
  assert.match(decision, /Go `1\.26\.5`/);
  assert.match(decision, /stage 5 to Go `1\.25\.12`/);
  assert.match(decision, /`BR2_PACKAGE_HOST_GO_SRC=y`/);
  assert.match(decision, /`BR2_PACKAGE_HOST_GO_BIN` unset/);
  assert.match(decision, /adds no Go or Buildroot source archive/);
  assert.match(evidence, /\*\*Status:\*\* `ACCEPTED`/);
  assert.match(priorDecision, /\*\*Status:\*\* Accepted/);
  assert.match(priorDecision, /\*\*Superseded in part by:\*\* ADR 0017/);

  const changedPaths = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map(
    ([, from, to]) => {
      assert.equal(from, to);
      return from;
    },
  );
  assert.deepEqual(changedPaths, [
    'package/go/go-bootstrap-stage5/go-bootstrap-stage5.hash',
    'package/go/go-bootstrap-stage5/go-bootstrap-stage5.mk',
    'package/go/go.hash',
    'package/go/go.mk',
  ]);

  assert.match(patch, /^\+GO_BOOTSTRAP_STAGE5_VERSION = 1\.25\.12$/m);
  assert.match(patch, /^\+GO_VERSION = 1\.26\.5$/m);
  assert.match(patch, /f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932/);
  assert.match(patch, /495be4bc87176ac567392e5b4116abd98466d33d7b49d41e764ccc6976b2dc42/);
  assert.match(patch, /^\+\s*GOWORK=off \\/m);
  assert.match(patch, /^\+\s*GOSUMDB=off \\/m);
  assert.doesNotMatch(patch, /^diff --git .*go-bin/m);

  const executionServiceEntries = await readdir(
    resolve(root, 'native-helpers/execution-service'),
  ).catch((error) => {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  assert.deepEqual(
    executionServiceEntries.sort(),
    [
      'WatchdogControlCore.swift',
      'WatchdogLaunchAgentStatusCandidate.swift',
      'WatchdogNamedListenerCandidate.swift',
      'WatchdogNamedListenerTransportCandidate.swift',
      'WatchdogNamedServiceFixtureMain.swift',
      'WatchdogXPCFixtureMain.swift',
      'WatchdogXPCTransport.swift',
      'com.socialeap.dosai.execution-service-fixture.plist',
      'main.swift',
    ],
  );
});
