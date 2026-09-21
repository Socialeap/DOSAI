import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';
import { loadLifecycleFirstRegistrationSuccessor } from './p3-lifecycle-first-registration-successor.mjs';

const recordPath = 'docs/architecture/process-ownership-v49.json';
const modifiedPreimages = new Map([
  [
    'src/main/execution/service-management-lifecycle-proof-entry.ts',
    'e949182e44e03fa4800f1ca27f1f8e0ab0cc4eedc8e93fbb0728405560e9383f',
  ],
  [
    'tests/security/p3-service-management-lifecycle-proof-entry.test.mjs',
    '7f5243bcce24df8e1b49c981c9072c88353ba2f549844bfd55354cb484bd6ee0',
  ],
  [
    'scripts/build.mjs',
    '682b925be2e9c03c77c2f270fdf4ef8ce7145b9734e02b03102414d465226628',
  ],
  [
    'scripts/package.mjs',
    '9af144804737d0704b8613d2343eb4c1418ab99cb973cde141193d7fe44bdf38',
  ],
  [
    'vite.main.config.ts',
    '90e923d007be8eb989d757fbcc4bfa01767abe7817af8e6bcaf4ce16cc3f7199',
  ],
  [
    'tests/architecture/process-ownership-v48.test.mjs',
    '5186e2dc5f7e3e0dcc1c7ec5e630c73900c933cd37d89f1f27dad53394239ff0',
  ],
  [
    'tests/architecture/p3-proof-observability-successor.mjs',
    '6b2b6ee032eb912e0f2908242a472e25b937c01a0ca9b7f7d7252d09f18e35cb',
  ],
  [
    'tests/architecture/p3-status-proof-successor.mjs',
    '61bd904998b9f33811c6d776d1b1d472a1dfe7fcd3f21c5c1522f9f734161631',
  ],
  [
    'tests/architecture/p3-guard-successor.mjs',
    '363c9fa0f727fc7831955b4ec8956e1bb46a3d37b2169b322e165f1dbc646a5b',
  ],
  [
    'tests/architecture/process-ownership-v16.test.mjs',
    '3271feaf1c0e62838b6f8acd864d4e98a2e84081d4afd8cc88019311ca644b7e',
  ],
  [
    'tests/architecture/process-ownership-v17.test.mjs',
    '104ed096d34401e8c0bfa77c82668ee19aa8302363da778fc44d84aeb467c2d0',
  ],
  [
    'tests/architecture/process-ownership-v19.test.mjs',
    'e4b7f6a97f526e3a3c48cf83904de0dab31ae490baf541a5619d23268add2eb0',
  ],
  [
    'tests/architecture/process-ownership-v20.test.mjs',
    '91f4e30d01f03bd19d203341107cded4c5cccb4f0512453e58de826f6f8721f7',
  ],
  [
    'tests/architecture/process-ownership-v21.test.mjs',
    'bd46b60ad61c1bcf5958845b73efd00eb2cb0d268062fe6f1712944741634dfc',
  ],
  [
    'tests/architecture/process-ownership-v23.test.mjs',
    '50039e74d4c782f02d677481d0c88e55cc380995338947e33061d08b62e93016',
  ],
  [
    'tests/architecture/process-ownership-v25.test.mjs',
    'ac493eb902d7202464525978c1b71f4d4f8c6fb6d0db30c444af1c1c734deb76',
  ],
  [
    'tests/architecture/process-ownership-v26.test.mjs',
    '5b88216db24193672e948df364e777b398fde77a3bf467c7926e6105c7d83b17',
  ],
  [
    'tests/architecture/process-ownership-v27.test.mjs',
    '01eaffaf1c8ae9df19e2cf1275cd51623e85c888d9d3f3b8b72586b4e2be6089',
  ],
  [
    'tests/architecture/process-ownership-v31.test.mjs',
    'ab32cf8f37145339c4e1d6ad549b669b03c2bf2853355020be415e3b1cab3a1e',
  ],
  [
    'tests/architecture/process-ownership-v32.test.mjs',
    'f5c120731c6e90826fad95b2c1932488ba6fdc9c9255ae28c06dd0beb297d27a',
  ],
  [
    'tests/architecture/process-ownership-v34.test.mjs',
    '519328d418f238f203783cc0c8e86e81e866df3d8d289d5293bc23debd037bde',
  ],
  [
    'tests/architecture/process-ownership-v35.test.mjs',
    'ea78db69834086ee68841b0cc37ef53748c842c450b70b7a4771980656db198e',
  ],
  [
    'tests/architecture/process-ownership-v36.test.mjs',
    '23780cd1ba5f0ae805b8e3d46f2c9b4c4ed4d7948e3574479404d5004e1c87bb',
  ],
  [
    'tests/architecture/process-ownership-v41.test.mjs',
    '470ce6217c3fc988b550ceeb7e61b898c8cbd1a072a4b58030a74efc91f40b12',
  ],
  [
    'tests/architecture/process-ownership-v43.test.mjs',
    '529b9331fb5301452dd0b062fb7f3e8f845c5a8ec073d015ee429eba3bf693ee',
  ],
  [
    'tests/architecture/process-ownership-v45.test.mjs',
    'cc01dcdb5e19e22980d1d7968cfd6f865bf3a95a584498ca69551bfe5cc22941',
  ],
  [
    'tests/architecture/process-ownership.test.mjs',
    'f2df98e7ce2eed25eac46ba3bd95b0c1bcd2918b3fcb1eb0f9240fb54aa30f38',
  ],
  [
    'tests/security/p3-watchdog-launch-agent-plist-candidate.test.mjs',
    '5c1ae08c3f3651024a089965af8e4c8505c6df5ff3f19c6619c33c7b7431bf64',
  ],
]);
const newPaths = Object.freeze([
  'scripts/service-management-lifecycle-addon.mjs',
  'scripts/service-management-lifecycle-proof.mjs',
  'tests/security/p3-service-management-lifecycle-composition.test.mjs',
  'tests/architecture/p3-lifecycle-composition-successor.mjs',
  'tests/architecture/process-ownership-v49.test.mjs',
  'docs/development/p3-service-management-lifecycle-composition-evidence.md',
]);
const recordKeys = Object.freeze([
  'schema_version',
  'status',
  'scope',
  'implementation_authorization',
  'accepted_source_baseline',
  'composition',
  'failure_containment',
  'modified_files',
  'new_files',
  'source_validation',
  'authority',
  'runtime_status',
].sort());
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadLifecycleCompositionSuccessor(
  root,
  readBytes = path => readFile(resolve(root, path)),
) {
  const firstRegistrationSuccessor = await loadLifecycleFirstRegistrationSuccessor(
    root,
    readBytes,
  );
  const recordBytes = await readBytes(recordPath);
  assert.ok(recordBytes.byteLength <= 131_072, 'oversized governance record');
  const record = parseStrictJson(recordBytes);
  assert.deepEqual(Object.keys(record).sort(), recordKeys);
  assert.equal(record.schema_version, 49);
  assert.equal(record.status, 'IMPLEMENTED_STANDING_AUTHORIZATION_SOURCE_ONLY');
  assert.equal(
    record.scope,
    'P3_SERVICE_MANAGEMENT_LIFECYCLE_SIGNED_COMPOSITION_SOURCE_ONLY',
  );
  assert.equal(
    record.implementation_authorization,
    'OWNER_STANDING_AUTHORIZATION_MINOR_SOURCE_BUILD_TEST_COMMIT_2026_09_20',
  );
  assert.equal(record.runtime_status, 'NO_GO');
  assert.deepEqual(record.accepted_source_baseline, {
    path: 'docs/architecture/process-ownership-v48.json',
    sha256: '43d31b5edf47dde71bfde3ff791ecac8080f6b7263c50c592698c61f4d911b1a',
  });
  assert.equal(
    sha256(await readBytes(record.accepted_source_baseline.path)),
    record.accepted_source_baseline.sha256,
  );
  assert.deepEqual(record.modified_files.map(file => file.path), [...modifiedPreimages.keys()]);
  assert.deepEqual(record.new_files.map(file => file.path), newPaths);
  assert.deepEqual(record.composition, {
    build_mode: 'service-management-lifecycle-proof',
    package_argument: '--signed-app-service-management-lifecycle-proof-fixture',
    addon_name: 'dosai-service-management-lifecycle.node',
    addon_identifier: 'com.socialeap.dosai.service-management-lifecycle-addon',
    result_prefix: 'DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:',
    proof_executable: 'out/DOSAI-darwin-arm64/DOSAI.app/Contents/MacOS/DOSAI',
    child_argument_count: 0,
    timeout_ms: 15000,
    retry_allowed: false,
  });
  assert.deepEqual(record.failure_containment, {
    initial_status_required: 'NOT_REGISTERED',
    in_process_cleanup_attempt_limit: 1,
    clean_terminal_status: 'NOT_REGISTERED',
    missing_receipt_action: 'STOP_NO_RETRY_OWNER_RECOVERY_REQUIRED',
    uncertain_receipt_action: 'STOP_NO_RETRY_OWNER_RECOVERY_REQUIRED',
    automatic_recovery_launch: false,
  });
  assert.deepEqual(record.source_validation, {
    dedicated_commonjs_build: true,
    strict_receipt_admission: true,
    duplicate_json_keys_rejected: true,
    expanded_counts_rejected: true,
    normal_main_unchanged: true,
    native_linked_output: false,
    package_built: false,
    signing_invoked: false,
    app_launched: false,
    native_module_loaded: false,
    service_management_invoked: false,
  });
  assert.ok(Object.values(record.authority).every(value => value === false));

  for (const file of record.modified_files) {
    assert.deepEqual(Object.keys(file).sort(), ['path', 'post_sha256', 'pre_sha256']);
    assert.equal(file.pre_sha256, modifiedPreimages.get(file.path), file.path);
    assert.match(file.post_sha256, /^[0-9a-f]{64}$/);
    assert.notEqual(file.post_sha256, file.pre_sha256, file.path);
    assert.equal(
      sha256(await readBytes(file.path)),
      firstRegistrationSuccessor.expected(file.path, file.post_sha256),
      file.path,
    );
  }
  for (const file of record.new_files) {
    assert.deepEqual(Object.keys(file).sort(), ['path', 'sha256']);
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
    assert.equal(
      sha256(await readBytes(file.path)),
      firstRegistrationSuccessor.expected(file.path, file.sha256),
      file.path,
    );
  }

  const postimages = new Map(record.modified_files.map(file => [file.path, file.post_sha256]));
  return Object.freeze({
    expected(path, historicalHash) {
      return firstRegistrationSuccessor.expected(
        path,
        postimages.get(path) ?? historicalHash,
      );
    },
  });
}
