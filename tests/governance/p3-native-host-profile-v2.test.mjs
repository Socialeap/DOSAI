import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { nativeProfileContextDigest, nativeProfileSigningBytes, verifyNativeProfileFixture as verifyV2 } from '../fixtures/p3/native-host-profile-model-v2.mjs';
import { nativeProfileSigningBytes as signingBytesV1, verifyNativeProfileFixture as verifyV1 } from '../fixtures/p3/native-host-profile-model.mjs';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(resolve(root, path));
const hash = value => createHash('sha256').update(value).digest('hex');
const d = label => hash(Buffer.from('SYNTHETIC_ONLY:' + label));
const bytes = value => Buffer.from(JSON.stringify(value));
const profileBytes = await read('docs/architecture/p3-native-host-profile-v1.json');
const profile = JSON.parse(profileBytes);
const correction = JSON.parse(await read('docs/architecture/p3-native-host-profile-namespace-correction-v2.json'));

function fixture() {
  // Software key objects are ephemeral in memory. No private key is exported, printed or persisted.
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const der = pair.publicKey.export({ format: 'der', type: 'spki' });
  const inputSet = d('shared-input-set'), ownerDecision = d('owner-decision');
  const hosts = ['A', 'B'].map(slot => {
    const registry = { filesystem: 'binfmt_misc', root: '/', target_mounts: 1, submounts: 0,
      device: '0:42', inode: '100', mount_id: '42', mount_namespace: 'mnt:[100]', user_namespace: 'user:[101]',
      effective_registry_sha256: d(slot + ':registry') };
    return { slot, host_id: d(slot + ':host'), boot_epoch: d(slot + ':boot'),
      resources: Object.fromEntries(profile.independent_resource_classes.map(name => [name, d(slot + ':' + name)])),
      platform: { os: 'Linux', machine: 'x86_64', docker_arch: 'amd64', emulation: false, fresh: true },
      image_sha256: d(slot + ':image'), provider_profile_sha256: d(slot + ':provider-profile'),
      evidence_manifest_sha256: d(slot + ':evidence-manifest'),
      kernel: { release: '6.0.0-fixture-' + slot, installed_package: 'linux-image-synthetic', package_version: '1.0-fixture',
        reviewed_vendor_source_sha256: d(slot + ':vendor-source'), vendor_patch_manifest_sha256: d(slot + ':vendor-patches'),
        running_identity_evidence_sha256: d(slot + ':running-kernel-evidence') }, input_set_sha256: inputSet,
      sample_started_at_ms: 950, sample_completed_at_ms: 1000,
      registry_before: structuredClone(registry), registry_after: structuredClone(registry), registrations: 0,
      writer: { generation: '1', epoch: d(slot + ':boundary-epoch'), state: 'ENFORCEMENT_CLAIM_FIXTURE',
        inventory_sha256: d(slot + ':inventory'), enforcement_sha256: d(slot + ':enforcement'),
        owner_decision_sha256: ownerDecision, registry_sha256: registry.effective_registry_sha256,
        starts_at_ms: 900, ends_at_ms: 6000, dosai_writers: 0, fence_state: 'ACTIVE_FIXTURE' },
      privilege: { dosai_registry_write: 'NONE', helper_instances: 0, control_scope: 'CONTROL_PLANE_ENFORCEMENT_FIXTURE' },
      predicates: Object.fromEntries([...profile.original_predicates, ...profile.additional_predicates].map(code => [code, true])) };
  });
  const payload = { profile_sha256: hash(profileBytes), purpose: 'HOST_QUALIFICATION_FIXTURE_ONLY',
    request_nonce: d('request'), source_sha: 'a'.repeat(40), owner_decision_sha256: ownerDecision,
    input_set_sha256: inputSet, issued_at_ms: 1000, expires_at_ms: 6000, issuer_epoch: d('issuer-epoch'), sequence: 1, hosts,
    maximum_charge_usd: 0, cost_basis_sha256: d('zero-cost-basis') };
  const trust = { schema: 'DOSAI_NATIVE_BOUNDARY_TRUST_FIXTURE_V1', fixture_only: true,
    profile_sha256: hash(profileBytes), public_key_spki_base64: der.toString('base64'), key_id: hash(der), key_status: 'ACTIVE_FIXTURE',
    issuer_epoch: payload.issuer_epoch, last_sequence: 0, request_nonce: payload.request_nonce, nonce_state: 'FRESH_FIXTURE',
    source_sha: payload.source_sha, owner_decision_sha256: ownerDecision, input_set_sha256: inputSet,
    subjects: [], now_ms: 2000, required_until_ms: 4000, clock_state: 'TRUSTED_FIXTURE', clock_uncertainty_ms: 0,
    revocation_state: 'FRESH_FIXTURE', policy_state: 'OWNER_ACCEPTED_FIXTURE', maximum_charge_usd: 0,
    cost_basis_sha256: payload.cost_basis_sha256, cost_state: 'ZERO_COST_VERIFIED_FIXTURE' };
  const envelope = { schema: 'DOSAI_NATIVE_BOUNDARY_ENVELOPE_FIXTURE_V1', fixture_only: true,
    key_id: trust.key_id, payload, signature_base64: '' };
  const f = { pair, payload, trust, envelope };
  seal(f, true);
  return f;
}
function seal(f, repinContext = false) {
  if (repinContext) f.trust.subjects = f.payload.hosts.map(host => ({ slot: host.slot, host_id: host.host_id,
    boot_epoch: host.boot_epoch, context_sha256: nativeProfileContextDigest(host),
    boundary_generation: host.writer.generation, boundary_epoch: host.writer.epoch }));
  f.envelope.signature_base64 = sign('sha256', nativeProfileSigningBytes(f.payload),
    { key: f.pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
}

const check = (verify, f) => verify(profileBytes, bytes(f.envelope), bytes(f.trust));
const deny = f => assert.throws(() => check(verifyV2, f), { message: 'NATIVE_PROFILE_FIXTURE_REJECTED' });
function namespaces(f, field, value, snapshots = ['registry_before', 'registry_after']) {
  for (const snapshot of snapshots) f.payload.hosts[0][snapshot][field] = structuredClone(value);
  seal(f, true);
}
function noAuthority(result) {
  assert.equal(result.simulation_only, true);
  assert.equal(result.signature_verified_for_fixture, true);
  assert.equal(result.runtime_trust_authentication, 'NOT_PERFORMED_TEST_TRUST_ANCHOR');
  assert.equal(result.replay_persistence, 'NOT_IMPLEMENTED');
  for (const field of ['source_match_verified', 'single_writer_exclusion_proven', 'continuous_emptiness_proven',
    'runtime_admission', 'execution_authorized']) assert.equal(result[field], false);
  assert.equal(result.builder_receipts, 0);
  assert.ok(Object.isFrozen(result));
}

test('v2 is exactly two explicit string guards while all hash-bound v1 history stays unchanged', async () => {
  const before = (await read('tests/fixtures/p3/native-host-profile-model.mjs')).toString();
  const after = (await read('tests/fixtures/p3/native-host-profile-model-v2.mjs')).toString();
  let expected = before;
  for (const [field, prefix] of [['mount_namespace', 'mnt'], ['user_namespace', 'user']]) {
    const old = `require(/^${prefix}:\\[[1-9][0-9]{0,19}\\]$/.test(value.${field}));`;
    const fixed = `require(typeof value.${field} === 'string' && /^${prefix}:\\[[1-9][0-9]{0,19}\\]$/.test(value.${field}));`;
    assert.equal(expected.split(old).length - 1, 1);
    expected = expected.replace(old, fixed);
  }
  assert.equal(after, expected);
  assert.equal(correction.status, 'PREPARED_SOURCE_ONLY_V2_PENDING_OWNER_REVIEW');
  assert.equal(correction.runtime_status, 'NO_GO');
  assert.equal(correction.protocol_changed, false);
  assert.equal(correction.v1_history_preserved, true);
  assert.equal(correction.supersedes_fixture_implementation.sha256, hash(before));
  assert.deepEqual(Object.keys(correction.authorities).sort(), ['merge', 'provisioning', 'workflow_activation', 'workflow_dispatch',
    'executor', 'host_mutation', 'build', 'guest_execution', 'paid_activity', 'capability_acceptance'].sort());
  assert.ok(Object.values(correction.authorities).every(value => value === false));
  for (const [path, digest] of Object.entries(correction.inputs)) assert.equal(hash(await read(path)), digest, path);
  const original = JSON.parse(await read('docs/architecture/p3-native-host-profile-source-record.json'));
  for (const [path, digest] of Object.entries(original.inputs)) assert.equal(hash(await read(path)), digest, path);
});

test('the two confirmed array regressions remain reproducible in v1 and are denied by v2', () => {
  for (const [field, value] of [['mount_namespace', 'mnt:[100]'], ['user_namespace', 'user:[101]']]) {
    const f = fixture(); namespaces(f, field, [value]);
    noAuthority(check(verifyV1, f));
    deny(f);
  }
});

test('non-string JSON namespace identities reject before-only after-only and matching snapshots', () => {
  for (const [field, valid] of [['mount_namespace', 'mnt:[100]'], ['user_namespace', 'user:[101]']]) {
    const values = [[valid], [[valid]], [], {}, { value: valid }, { toString: valid }, null, true, false, 100];
    for (const value of values) for (const snapshots of [['registry_before'], ['registry_after'], ['registry_before', 'registry_after']]) {
      const f = fixture(); namespaces(f, field, value, snapshots); deny(f);
    }
  }
});

test('valid scalar identities preserve exact protocol and results while malformed scalars still deny', () => {
  for (const id of ['1', '100', '12345678901234567890']) {
    const f = fixture();
    namespaces(f, 'mount_namespace', 'mnt:[' + id + ']');
    namespaces(f, 'user_namespace', 'user:[' + id + ']');
    assert.deepEqual(nativeProfileSigningBytes(f.payload), signingBytesV1(f.payload));
    assert.deepEqual(check(verifyV2, f), check(verifyV1, f));
    noAuthority(check(verifyV2, f));
  }
  for (const [field, prefix] of [['mount_namespace', 'mnt'], ['user_namespace', 'user']]) {
    for (const value of ['', prefix + ':[0]', prefix + ':[01]', 'wrong:[100]', prefix + ':[100]\n',
      prefix + ':[100]\r', prefix + ':[100]suffix', prefix + ':[123456789012345678901]', ' ' + prefix + ':[100]']) {
      const f = fixture(); namespaces(f, field, value); deny(f);
      assert.throws(() => check(verifyV1, f), { message: 'NATIVE_PROFILE_FIXTURE_REJECTED' });
    }
  }
});

test('native registry privilege expiry cost and signature denial gates remain closed in the successor', () => {
  for (const change of [f => { f.payload.hosts[0].platform.machine = 'aarch64'; },
    f => { f.payload.hosts[0].platform.emulation = true; }, f => { f.payload.hosts[0].registrations = 1; },
    f => { f.payload.hosts[0].privilege.helper_instances = 1; }, f => { f.trust.now_ms = 6000; },
    f => { f.trust.cost_state = 'UNKNOWN'; }, f => { f.trust.policy_state = 'NOT_ACCEPTED'; }]) {
    const f = fixture(); change(f); seal(f, true); deny(f);
  }
  const f = fixture(); f.payload.source_sha = 'b'.repeat(40); deny(f);
});

test('the versioned fixture remains unreachable from the app and has no host operations', async () => {
  const source = (await read('tests/fixtures/p3/native-host-profile-model-v2.mjs')).toString();
  assert.doesNotMatch(source, /node:fs|child_process|fetch\(|node:https?|process\.|generateKeyPair|createPrivateKey/);
  const { collectFiles, importedModules } = await import('../architecture/source-graph.mjs');
  for (const path of await collectFiles(resolve(root, 'src'))) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    for (const name of importedModules((await readFile(path)).toString(), path)) assert.doesNotMatch(name, /native-host-profile-model-v2/);
  }
});
