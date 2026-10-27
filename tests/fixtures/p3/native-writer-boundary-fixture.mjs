// Test-only synthetic trace builder. Never an evidence issuer or runtime authority.
import { createHash } from 'node:crypto';
const bytes = value => Buffer.from(JSON.stringify(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const allTrue = names => Object.fromEntries(names.map(name => [name, true]));
const registry = { filesystem: 'binfmt_misc', device: '0:42', inode: '100', mount_id: '42',
  mount_namespace: 'mnt:[100]', user_namespace: 'user:[101]', effective_scope: 'SAME_EFFECTIVE_REGISTRY_FIXTURE' };

export function nativeBoundaryFixture(contractBytes) {
  const contract = JSON.parse(contractBytes);
  const codes = contract.all_original_predicates_must_be_rechecked;
  const objectIds = Object.fromEntries(contract.entries.map((entry, i) => [entry.name, `entry:${i}`]));
  const inventory = entries => ({ registry: structuredClone(registry), global_enabled: true,
    entries: entries.map(entry => ({ ...structuredClone(entry), object_id: objectIds[entry.name] })) });
  const host = { run_id: '123456789', run_attempt: '1', job: 'builder_host_a', sha: 'b'.repeat(40),
    runner_environment: 'github-hosted', runner_os: 'Linux', runner_arch: 'X64',
    uname_machine: 'x86_64', docker_arch: 'amd64', image_os: 'ubuntu24', image_version: '20261023.334.3',
    fresh_disposable_vm: true, kernel_release: 'SIMULATED-KERNEL', kernel_package: 'SIMULATED-PACKAGE', kernel_source_sha256: 'c'.repeat(64) };
  const boundary = { schema: 'DOSAI_BINFMT_BOUNDARY_FIXTURE_V2', fixture_only: true,
    contract_sha256: sha(contractBytes), host: structuredClone(host), registry: structuredClone(registry),
    fence: { lease_id: 'd'.repeat(64), generation: '1', state: 'ACTIVE', writer_slots: 1,
      helper_instances: 1, privilege_lifetime: 'PREPARATION_ONLY' },
    issued_at_ms: 900, expires_at_ms: 5000, writer_state: 'DOCUMENTED_ASSUMPTION_FIXTURE',
    writer_inventory_sha256: 'e'.repeat(64), kernel_match: 'REVIEWED_IDENTITY_FIXTURE',
    trust_assumption: 'PRIVILEGED_HOST_AND_PROVIDER_TRUSTED_FIXTURE', assumption_decision_sha256: 'f'.repeat(64),
    review_sha256: contract.review_input.sha256, entry_object_ids: structuredClone(objectIds), scope: contract.entries.map(e => e.name) };
  const trace = { host, boundary,
    initial: inventory(contract.entries),
    preflight: allTrue(codes.filter(c => !['BINFMT_MISC_INTERPRETER_ACTIVE', 'RECEIPT_EMISSION_FAILED'].includes(c))),
    events: contract.entries.map((entry, index) => ({ entry: entry.name,
      before: inventory(contract.entries.slice(index)), after: inventory(contract.entries.slice(index + 1)),
      descriptor_object_id: objectIds[entry.name], descriptor_preimage_sha256: entry.sha256,
      fence_generation: '1', fence_state: 'ACTIVE', attempts: 1, payload_hex: '2d310a',
      request_result: 'ACCEPTED', written_bytes: 3, elapsed_ms: index * 2 + 1,
      completed_elapsed_ms: index * 2 + 2, interference: 'NOT_DETECTED' })),
    recheck: { host: structuredClone(host), inventory: inventory([]), predicate_results: allTrue(codes),
      fence_generation: '1', fence_state: 'ACTIVE', elapsed_ms: 10, mutation_authority: 'DROPPED' } };
  const trust = { schema: 'DOSAI_BINFMT_TRUST_FIXTURE_V2', fixture_only: true, contract_sha256: sha(contractBytes),
    boundary_sha256: sha(bytes(boundary)), evaluation_time_ms: 1000, expected_host: structuredClone(host),
    expected_registry: structuredClone(registry), expected_fence_generation: '1', expected_review_sha256: contract.review_input.sha256 };
  return { trace, trust };
}
