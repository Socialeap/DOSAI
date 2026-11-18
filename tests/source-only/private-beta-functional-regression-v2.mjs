// Load v1 first so its Node version and argument checks run before any tests.
await import('./private-beta-functional-regression-v1.mjs');
await import('../governance/p3-native-builder-intake.test.mjs');
await import('../governance/p3-native-builder-host-observation-verifier.test.mjs');
