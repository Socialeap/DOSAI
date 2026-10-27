// Fixed source-only regression entrypoint v1. Not a P3 acceptance runner or runtime executor.
// Fail before importing any corpus module on an unsupported runtime or supplied arguments.
if (process.versions.node !== '24.18.0') throw new Error('P3_SOURCE_REGRESSION_NODE_VERSION_REJECTED');
if (process.argv.length !== 2) throw new Error('P3_SOURCE_REGRESSION_ARGUMENTS_REJECTED');

// Literal reviewed test modules only: no discovery, caller paths, shell or child-process launcher.
await import('../governance/p3-native-host-profile.test.mjs');
await import('../governance/p3-native-host-profile-v2.test.mjs');
await import('../governance/p3-native-host-profile-v2-functional.test.mjs');
await import('../governance/p3-native-profile-source-integrity.test.mjs');
await import('../governance/private-beta-critical-path-status.test.mjs');
await import('../governance/p3-acceptance-evidence-checklist.test.mjs');
await import('../governance/p3-acceptance-handler-implementation-proposal.test.mjs');
await import('../governance/p3-acceptance-fixture-generation-proposal.test.mjs');
await import('../governance/p3-acceptance-negative-vectors.test.mjs');
