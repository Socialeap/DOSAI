// Fixed offline corpus for manual review, fixture handoff, and native-builder source guards.
if (process.versions.node !== '24.18.0') {
  throw new Error('PRIVATE_BETA_SOURCE_REGRESSION_NODE_VERSION_REJECTED');
}
if (process.argv.length !== 2) {
  throw new Error('PRIVATE_BETA_SOURCE_REGRESSION_ARGUMENTS_REJECTED');
}

await import('../architecture/process-ownership.test.mjs');
await import('../architecture/renderer-authority.test.mjs');
await import('../review/local-session.test.mjs');
await import('../review/local-session-ipc.test.mjs');
await import('../security/p1-security.test.mjs');
await import('../security/supervised-fixture-handoff.test.mjs');
await import('./p3-beta-regression-v1.mjs');
