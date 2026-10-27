// Offline relations only. No live trust registry, host enforcement, replay store or admission authority.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { canonicalAuditJson } from '../../../native-helpers/audit/contracts.ts';
import { parseStrictJson } from '../../../tools/dosai-acceptance/src/strict-json.mjs';

const profileDigest = 'c02a6e17a923a2539a4b5300a4ad315f594fa6a9093b884a90d08b6c7e5059c7';
const domain = Buffer.concat([Buffer.from('DOSAI/NATIVE-HOST-BOUNDARY/FIXTURE/V1', 'ascii'), Buffer.from([0])]);
const reject = () => { throw new Error('NATIVE_PROFILE_FIXTURE_REJECTED'); };
const require = condition => { if (!condition) reject(); };
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
function keys(value, expected) {
  require(value !== null && typeof value === 'object' && !Array.isArray(value));
  const actual = Object.keys(value);
  require(actual.length === expected.length && actual.every(key => expected.includes(key)));
}
function parse(value) {
  require(Buffer.isBuffer(value) && value.length > 0 && value.length <= 65536);
  return parseStrictJson(Buffer.from(value));
}
function base64(value, limit) {
  require(typeof value === 'string' && value.length > 0 && value.length <= limit);
  const decoded = Buffer.from(value, 'base64');
  require(decoded.toString('base64') === value);
  return decoded;
}
function registry(value) {
  keys(value, ['filesystem', 'root', 'target_mounts', 'submounts', 'device', 'inode', 'mount_id',
    'mount_namespace', 'user_namespace', 'effective_registry_sha256']);
  require(value.filesystem === 'binfmt_misc' && value.root === '/' && value.target_mounts === 1 && value.submounts === 0);
  require(typeof value.device === 'string' && /^[0-9]{1,10}:[0-9]{1,10}$/.test(value.device));
  for (const key of ['inode', 'mount_id']) require(typeof value[key] === 'string' && /^[1-9][0-9]{0,19}$/.test(value[key]));
  require(typeof value.mount_namespace === 'string' && /^mnt:\[[1-9][0-9]{0,19}\]$/.test(value.mount_namespace));
  require(typeof value.user_namespace === 'string' && /^user:\[[1-9][0-9]{0,19}\]$/.test(value.user_namespace));
  require(digest(value.effective_registry_sha256));
}
export function nativeProfileSigningBytes(payload) {
  return Buffer.concat([domain, Buffer.from(canonicalAuditJson(payload), 'utf8')]);
}
export const nativeProfileContextDigest = host => hash(Buffer.from(canonicalAuditJson(host), 'utf8'));

export function verifyNativeProfileFixture(profileBytes, envelopeBytes, trustBytes) {
  try {
    require(Buffer.isBuffer(profileBytes) && profileBytes.length <= 16384);
    const profileCopy = Buffer.from(profileBytes);
    require(hash(profileCopy) === profileDigest);
    const profile = parse(profileCopy), envelope = parse(envelopeBytes), trust = parse(trustBytes);
    keys(envelope, ['schema', 'fixture_only', 'key_id', 'payload', 'signature_base64']);
    require(envelope.schema === 'DOSAI_NATIVE_BOUNDARY_ENVELOPE_FIXTURE_V1' && envelope.fixture_only === true);
    keys(trust, ['schema', 'fixture_only', 'profile_sha256', 'public_key_spki_base64', 'key_id', 'key_status',
      'issuer_epoch', 'last_sequence', 'request_nonce', 'nonce_state', 'source_sha', 'owner_decision_sha256',
      'input_set_sha256', 'subjects', 'now_ms', 'required_until_ms', 'clock_state', 'clock_uncertainty_ms', 'revocation_state', 'policy_state',
      'maximum_charge_usd', 'cost_basis_sha256', 'cost_state']);
    require(trust.schema === 'DOSAI_NATIVE_BOUNDARY_TRUST_FIXTURE_V1' && trust.fixture_only === true);
    require(trust.profile_sha256 === profileDigest && trust.key_status === 'ACTIVE_FIXTURE');
    const publicDer = base64(trust.public_key_spki_base64, 1024);
    require(digest(trust.key_id) && envelope.key_id === trust.key_id && hash(publicDer) === trust.key_id);
    const publicKey = createPublicKey({ key: publicDer, format: 'der', type: 'spki' });
    require(publicKey.type === 'public' && publicKey.asymmetricKeyType === 'ec'
      && publicKey.asymmetricKeyDetails?.namedCurve === 'prime256v1');
    require(publicKey.export({ format: 'der', type: 'spki' }).equals(publicDer));
    const signature = base64(envelope.signature_base64, 128);
    require(signature.length === 64);
    require(verify('sha256', nativeProfileSigningBytes(envelope.payload), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature));
    const payload = envelope.payload;
    keys(payload, ['profile_sha256', 'purpose', 'request_nonce', 'source_sha', 'owner_decision_sha256',
      'input_set_sha256', 'issued_at_ms', 'expires_at_ms', 'issuer_epoch', 'sequence', 'hosts', 'maximum_charge_usd', 'cost_basis_sha256']);
    require(payload.profile_sha256 === profileDigest && payload.purpose === 'HOST_QUALIFICATION_FIXTURE_ONLY');
    require(payload.maximum_charge_usd === 0 && trust.maximum_charge_usd === 0 && trust.cost_state === 'ZERO_COST_VERIFIED_FIXTURE'
      && digest(payload.cost_basis_sha256) && payload.cost_basis_sha256 === trust.cost_basis_sha256);
    for (const key of ['request_nonce', 'owner_decision_sha256', 'input_set_sha256', 'issuer_epoch']) {
      require(digest(payload[key]) && payload[key] === trust[key]);
    }
    require(typeof payload.source_sha === 'string' && /^[0-9a-f]{40}$/.test(payload.source_sha) && payload.source_sha === trust.source_sha);
    require(integer(trust.last_sequence) && integer(payload.sequence) && payload.sequence === trust.last_sequence + 1);
    require(trust.nonce_state === 'FRESH_FIXTURE' && trust.clock_state === 'TRUSTED_FIXTURE'
      && trust.revocation_state === 'FRESH_FIXTURE' && trust.policy_state === 'OWNER_ACCEPTED_FIXTURE');
    for (const value of [payload.issued_at_ms, payload.expires_at_ms, trust.now_ms, trust.required_until_ms]) require(integer(value));
    const uncertainty = trust.clock_uncertainty_ms;
    require(integer(uncertainty) && uncertainty <= profile.observation_window.maximum_clock_uncertainty_ms);
    require(payload.issued_at_ms <= trust.now_ms - uncertainty && trust.now_ms + uncertainty < payload.expires_at_ms);
    require(payload.expires_at_ms - payload.issued_at_ms <= profile.observation_window.maximum_validity_ms);
    require(trust.now_ms + uncertainty < trust.required_until_ms && trust.required_until_ms + uncertainty <= payload.expires_at_ms);
    require(Array.isArray(payload.hosts) && payload.hosts.length === 2 && Array.isArray(trust.subjects) && trust.subjects.length === 2);
    const expectedPredicates = [...profile.original_predicates, ...profile.additional_predicates];
    const resourceSets = [];
    for (let index = 0; index < 2; index++) {
      const host = payload.hosts[index], subject = trust.subjects[index];
      keys(host, ['slot', 'host_id', 'boot_epoch', 'resources', 'platform', 'image_sha256', 'provider_profile_sha256',
        'evidence_manifest_sha256', 'kernel', 'input_set_sha256', 'sample_started_at_ms', 'sample_completed_at_ms',
        'registry_before', 'registry_after', 'registrations', 'writer', 'privilege', 'predicates']);
      keys(subject, ['slot', 'host_id', 'boot_epoch', 'context_sha256', 'boundary_generation', 'boundary_epoch']);
      require(host.slot === profile.host_slots[index] && subject.slot === host.slot);
      for (const key of ['host_id', 'boot_epoch']) require(digest(host[key]) && host[key] === subject[key]);
      for (const key of ['image_sha256', 'provider_profile_sha256', 'evidence_manifest_sha256']) require(digest(host[key]));
      keys(host.kernel, ['release', 'installed_package', 'package_version', 'reviewed_vendor_source_sha256',
        'vendor_patch_manifest_sha256', 'running_identity_evidence_sha256']);
      require(typeof host.kernel.release === 'string' && /^[0-9][A-Za-z0-9.+_-]{0,127}$/.test(host.kernel.release));
      require(typeof host.kernel.installed_package === 'string' && /^[a-z0-9][a-z0-9+.-]{0,127}$/.test(host.kernel.installed_package));
      require(typeof host.kernel.package_version === 'string' && /^[A-Za-z0-9.+:~_-]{1,160}$/.test(host.kernel.package_version));
      for (const key of ['reviewed_vendor_source_sha256', 'vendor_patch_manifest_sha256', 'running_identity_evidence_sha256']) require(digest(host.kernel[key]));
      require(host.input_set_sha256 === payload.input_set_sha256);
      require(digest(subject.context_sha256) && nativeProfileContextDigest(host) === subject.context_sha256);
      require(integer(host.sample_started_at_ms) && integer(host.sample_completed_at_ms)
        && host.sample_started_at_ms <= host.sample_completed_at_ms && host.sample_completed_at_ms <= payload.issued_at_ms
        && trust.now_ms + uncertainty - host.sample_started_at_ms <= profile.observation_window.maximum_validity_ms);
      keys(host.platform, ['os', 'machine', 'docker_arch', 'emulation', 'fresh']);
      require(host.platform.os === 'Linux' && host.platform.machine === 'x86_64' && host.platform.docker_arch === 'amd64'
        && host.platform.emulation === false && host.platform.fresh === true);
      keys(host.resources, profile.independent_resource_classes);
      require(Object.values(host.resources).every(digest));
      resourceSets.push(new Set(Object.values(host.resources)));
      registry(host.registry_before); registry(host.registry_after);
      require(canonicalAuditJson(host.registry_before) === canonicalAuditJson(host.registry_after));
      require(host.registrations === 0);
      const writer = host.writer;
      keys(writer, ['generation', 'epoch', 'state', 'inventory_sha256', 'enforcement_sha256', 'owner_decision_sha256',
        'registry_sha256', 'starts_at_ms', 'ends_at_ms', 'dosai_writers', 'fence_state']);
      require(typeof writer.generation === 'string' && /^[1-9][0-9]{0,19}$/.test(writer.generation)
        && writer.generation === subject.boundary_generation);
      require(writer.state === 'ENFORCEMENT_CLAIM_FIXTURE' && writer.fence_state === 'ACTIVE_FIXTURE' && writer.dosai_writers === 0);
      for (const key of ['epoch', 'inventory_sha256', 'enforcement_sha256']) require(digest(writer[key]));
      require(writer.epoch === subject.boundary_epoch);
      require(writer.owner_decision_sha256 === trust.owner_decision_sha256
        && writer.registry_sha256 === host.registry_after.effective_registry_sha256);
      require(integer(writer.starts_at_ms) && integer(writer.ends_at_ms)
        && writer.starts_at_ms <= host.sample_started_at_ms - uncertainty && writer.ends_at_ms >= trust.required_until_ms + uncertainty);
      keys(host.privilege, ['dosai_registry_write', 'helper_instances', 'control_scope']);
      require(host.privilege.dosai_registry_write === 'NONE' && host.privilege.helper_instances === 0
        && host.privilege.control_scope === 'CONTROL_PLANE_ENFORCEMENT_FIXTURE');
      keys(host.predicates, expectedPredicates);
      require(Object.values(host.predicates).every(value => value === true));
    }
    require(payload.hosts[0].host_id !== payload.hosts[1].host_id && payload.hosts[0].boot_epoch !== payload.hosts[1].boot_epoch);
    require([...resourceSets[0]].every(resource => !resourceSets[1].has(resource)));
    return Object.freeze({ schema: 'DOSAI_NATIVE_PROFILE_RELATIONS_FIXTURE_V1', simulation_only: true,
      state: 'FIXTURE_RELATIONS_VERIFIED_NO_RUNTIME_ADMISSION', signature_verified_for_fixture: true,
      runtime_trust_authentication: 'NOT_PERFORMED_TEST_TRUST_ANCHOR', replay_persistence: 'NOT_IMPLEMENTED',
      source_match_verified: false, single_writer_exclusion_proven: false, continuous_emptiness_proven: false,
      runtime_admission: false, execution_authorized: false, builder_receipts: 0 });
  } catch {
    reject();
  }
}
