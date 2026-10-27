import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { nativeProfileContextDigest, nativeProfileSigningBytes, verifyNativeProfileFixture } from '../fixtures/p3/native-host-profile-model.mjs';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(resolve(root, path));
const hash = value => createHash('sha256').update(value).digest('hex');
const d = label => hash(Buffer.from('SYNTHETIC_ONLY:' + label));
const bytes = value => Buffer.from(JSON.stringify(value));
const profileBytes = await read('docs/architecture/p3-native-host-profile-v1.json');
const profile = JSON.parse(profileBytes);
const design = JSON.parse(await read('docs/architecture/p3-native-writer-boundary-design-v1.json'));
const sourceRecord = JSON.parse(await read('docs/architecture/p3-native-host-profile-source-record.json'));

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
const verifyFixture = f => verifyNativeProfileFixture(profileBytes, bytes(f.envelope), bytes(f.trust));
const denied = f => assert.throws(() => verifyFixture(f), { message: 'NATIVE_PROFILE_FIXTURE_REJECTED' });
const noRuntimeProof = result => {
  assert.equal(result.simulation_only, true);
  assert.equal(result.signature_verified_for_fixture, true);
  assert.equal(result.runtime_trust_authentication, 'NOT_PERFORMED_TEST_TRUST_ANCHOR');
  assert.equal(result.replay_persistence, 'NOT_IMPLEMENTED');
  for (const field of ['source_match_verified', 'single_writer_exclusion_proven', 'continuous_emptiness_proven',
    'runtime_admission', 'execution_authorized']) assert.equal(result[field], false);
  assert.equal(result.builder_receipts, 0);
  assert.ok(Object.isFrozen(result));
};

test('source profile and boundary proposal preserve unresolved live state and all historical inputs', async () => {
  assert.equal(profile.status, 'PROPOSED_SOURCE_ONLY_NOT_ACTIVATED');
  assert.equal(profile.runtime_status, 'NO_GO');
  assert.deepEqual(profile.host_slots, ['A', 'B']);
  assert.deepEqual(profile.required_platform, { os: 'Linux', machine: 'x86_64', docker_arch: 'amd64', emulation_permitted: false });
  assert.equal(profile.registry.dosai_write_authority, 'NONE');
  assert.deepEqual(profile.current_host_selection, { provider: null, host_A: null, host_B: null,
    availability: 'NOT_ESTABLISHED', zero_cost_eligibility: 'NOT_ESTABLISHED' });
  assert.equal(profile.live_gate_state.owner_trust_decision, 'NOT_ACCEPTED');
  assert.equal(design.profile.sha256, hash(profileBytes));
  assert.equal(design.signature_proposal.reuses_checkpoint_signing_endpoint, false);
  assert.equal(design.signature_proposal.signature_proves_observation_truth, false);
  assert.equal(design.signature_proposal.runtime_wire_suite, 'NOT_REGISTERED');
  for (const record of [profile, design, sourceRecord]) {
    assert.deepEqual(Object.keys(record.authorities).sort(), ['merge', 'provisioning', 'workflow_activation', 'workflow_dispatch',
      'executor', 'host_mutation', 'build', 'guest_execution', 'paid_activity', 'capability_acceptance'].sort());
    assert.ok(Object.values(record.authorities).every(v => v === false));
  }
  for (const [path, digest] of Object.entries(sourceRecord.inputs)) assert.equal(hash(await read(path)), digest, path);
  const packet = JSON.parse(await read(profile.feasibility_packet.path));
  assert.deepEqual(profile.original_predicates, packet.original_predicates);
  assert.deepEqual(profile.additional_predicates, packet.additional_active_predicates);
  for (const [path, digest] of Object.entries(packet.inputs)) assert.equal(hash(await read(path)), digest, path);
});

test('valid ephemeral signatures verify fixture relations without certifying host truth or runtime admission', () => {
  const f = fixture(), original = bytes(f.envelope);
  noRuntimeProof(verifyFixture(f));
  noRuntimeProof(verifyFixture(f)); // Stateless fixture replay demonstrates absence of a durable consumption store.
  assert.deepEqual(bytes(f.envelope), original);
  f.envelope.payload = Object.fromEntries(Object.entries(f.payload).reverse());
  noRuntimeProof(verifyFixture(f)); // Existing canonical encoding removes object-key-order differences.
});

test('payload tampering, wrong signature domain and damaged signatures fail closed', () => {
  let f = fixture(); f.payload.source_sha = 'b'.repeat(40); denied(f);
  f = fixture(); f.envelope.signature_base64 = sign('sha256', bytes(f.payload),
    { key: f.pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64'); denied(f);
  f = fixture(); const sig = Buffer.from(f.envelope.signature_base64, 'base64'); sig[0] ^= 1;
  f.envelope.signature_base64 = sig.toString('base64'); denied(f);
});

test('self-issued keys and unknown revoked or changed issuer scope cannot replace the independent pin', () => {
  let f = fixture(); f.pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  f.envelope.key_id = hash(f.pair.publicKey.export({ format: 'der', type: 'spki' })); seal(f); denied(f);
  for (const [key, value] of [['key_status', 'REVOKED'], ['key_status', 'UNKNOWN'],
    ['issuer_epoch', d('other-issuer-epoch')], ['owner_decision_sha256', d('unaccepted-owner')]]) {
    f = fixture(); f.trust[key] = value; denied(f);
  }
  f = fixture(); delete f.trust.public_key_spki_base64; denied(f);
});

test('nonce consumption expiry clock uncertainty and stale revocation views deny', () => {
  for (const [key, value] of [['nonce_state', 'USED_FIXTURE'], ['nonce_state', 'UNKNOWN'], ['last_sequence', 1],
    ['now_ms', 6000], ['now_ms', 999], ['clock_state', 'UNKNOWN'], ['revocation_state', 'STALE'],
    ['required_until_ms', 6001], ['required_until_ms', 2000], ['policy_state', 'NOT_ACCEPTED'],
    ['clock_uncertainty_ms', 101], ['clock_uncertainty_ms', null], ['cost_state', 'UNKNOWN'], ['maximum_charge_usd', 1]]) {
    const f = fixture(); f.trust[key] = value; denied(f);
  }
});

test('a fresh signature cannot refresh old samples and clock uncertainty cannot extend the boundary', () => {
  let f = fixture(); f.payload.issued_at_ms = 10000; f.payload.expires_at_ms = 15000;
  f.trust.now_ms = 11000; f.trust.required_until_ms = 13000;
  for (const host of f.payload.hosts) host.writer.ends_at_ms = 16000;
  seal(f, true); denied(f); // Samples remain at 950–1000 despite fresh issuance.
  f = fixture(); f.payload.hosts[0].sample_completed_at_ms = 1001; seal(f, true); denied(f);
  f = fixture(); f.trust.now_ms = 5990; f.trust.required_until_ms = 6000;
  f.trust.clock_uncertainty_ms = 20; denied(f);
  f = fixture(); f.trust.clock_uncertainty_ms = 60; denied(f); // Writer starts at 900, sample's conservative start is 890.
});

test('re-signed subject source kernel namespace and generation substitutions still miss pinned context', () => {
  for (const change of [f => { f.payload.hosts[0].host_id = d('replacement-host'); },
    f => { f.payload.hosts[0].boot_epoch = d('replacement-boot'); },
    f => { f.payload.hosts[0].kernel.reviewed_vendor_source_sha256 = d('unreviewed-source'); },
    f => { f.payload.hosts[0].kernel.release = '6.0.1-other'; },
    f => { f.payload.hosts[0].provider_profile_sha256 = d('other-provider'); },
    f => { f.payload.hosts[0].registry_after.mount_namespace = 'mnt:[999]'; },
    f => { f.payload.hosts[0].writer.generation = '2'; },
    f => { f.payload.request_nonce = d('other-request'); }, f => { f.payload.source_sha = 'b'.repeat(40); },
    f => { f.payload.purpose = 'EXECUTE'; }]) {
    const f = fixture(); change(f); seal(f); denied(f);
  }
});

test('even a fixture signer and repinned context cannot admit emulation registrations or invalid registry identity', () => {
  for (const change of [h => { h.platform.machine = 'aarch64'; }, h => { h.platform.docker_arch = 'arm64'; },
    h => { h.platform.emulation = true; }, h => { h.platform.fresh = false; }, h => { h.registrations = 1; },
    h => { h.registry_before.root = h.registry_after.root = '/subdir'; },
    h => { h.registry_before.filesystem = h.registry_after.filesystem = 'autofs'; },
    h => { h.registry_before.target_mounts = h.registry_after.target_mounts = 2; },
    h => { h.registry_before.submounts = h.registry_after.submounts = 1; },
    h => { h.registry_after.inode = '999'; }]) {
    const f = fixture(); change(f.payload.hosts[0]); seal(f, true); denied(f);
  }
});

test('shared writable state reused hosts and mismatched immutable inputs deny despite consistent fixture signatures', () => {
  for (const change of [f => { f.payload.hosts[1].host_id = f.payload.hosts[0].host_id; },
    f => { f.payload.hosts[1].boot_epoch = f.payload.hosts[0].boot_epoch; },
    f => { f.payload.hosts[1].input_set_sha256 = d('different-inputs'); },
    ...profile.independent_resource_classes.map(name => f => { f.payload.hosts[1].resources[name] = f.payload.hosts[0].resources[name]; }),
    f => { f.payload.hosts[1].resources.output = f.payload.hosts[0].resources.cache; }]) {
    const f = fixture(); change(f); seal(f, true); denied(f);
  }
});

test('snapshot-only writer claims residual sudo write helpers and inadequate enforcement intervals deny', () => {
  for (const change of [h => { h.writer.state = 'FOUR_UNITS_INACTIVE'; }, h => { h.writer.fence_state = 'LOCAL_LOCK'; },
    h => { h.writer.dosai_writers = 1; }, h => { h.writer.ends_at_ms = 3999; }, h => { h.writer.starts_at_ms = 1001; },
    h => { h.privilege.dosai_registry_write = 'REMOVE_FOUR_ENTRIES'; }, h => { h.privilege.helper_instances = 1; },
    h => { h.privilege.control_scope = 'HELPER_DROPPED_BUT_JOB_SUDO_REMAINS'; },
    h => { h.writer.registry_sha256 = d('other-effective-registry'); }]) {
    const f = fixture(); change(f.payload.hosts[0]); seal(f, true); denied(f);
  }
  const f = fixture(); f.payload.expires_at_ms = 6001; seal(f); denied(f);
  const paid = fixture(); paid.payload.maximum_charge_usd = 1; seal(paid); denied(paid);
});

test('every original and added predicate is mandatory for each host', () => {
  for (const index of [0, 1]) for (const code of [...profile.original_predicates, ...profile.additional_predicates]) {
    for (const missing of [false, true]) {
      const f = fixture();
      if (missing) delete f.payload.hosts[index].predicates[code];
      else f.payload.hosts[index].predicates[code] = false;
      seal(f, true); denied(f);
    }
  }
});

test('bounded strict JSON canonical key encoding and exact shapes reject malformed or authority-bearing inputs', () => {
  const f = fixture();
  for (const value of [Buffer.alloc(65537), Buffer.from('{'), Buffer.from('{"x":1,"x":2}'), bytes({ ...f.envelope, public_key: 'caller' }),
    bytes({ ...f.envelope, fixture_only: false })]) {
    assert.throws(() => verifyNativeProfileFixture(profileBytes, value, bytes(f.trust)), { message: 'NATIVE_PROFILE_FIXTURE_REJECTED' });
  }
  f.trust.public_key_spki_base64 += '\n'; denied(f);
  const malformed = fixture(); malformed.trust.public_key_spki_base64 = Buffer.from('DO_NOT_EMIT_INPUT_MARKER').toString('base64');
  malformed.trust.key_id = malformed.envelope.key_id = hash(Buffer.from('DO_NOT_EMIT_INPUT_MARKER')); denied(malformed);
  const wrongCurve = fixture(); wrongCurve.pair = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  const der = wrongCurve.pair.publicKey.export({ format: 'der', type: 'spki' });
  wrongCurve.trust.public_key_spki_base64 = der.toString('base64');
  wrongCurve.trust.key_id = wrongCurve.envelope.key_id = hash(der); seal(wrongCurve); denied(wrongCurve);
});

test('offline fixture verifier has no host operations and is unreachable from application imports', async () => {
  const source = (await read('tests/fixtures/p3/native-host-profile-model.mjs')).toString();
  assert.doesNotMatch(source, /node:fs|child_process|fetch\(|node:https?|process\.|generateKeyPair|createPrivateKey/);
  const { collectFiles, importedModules } = await import('../architecture/source-graph.mjs');
  for (const path of await collectFiles(resolve(root, 'src'))) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    for (const name of importedModules((await readFile(path)).toString(), path)) assert.doesNotMatch(name, /native-host-profile-model/);
  }
});
