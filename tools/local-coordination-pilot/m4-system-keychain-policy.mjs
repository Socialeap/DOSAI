// Proposed source policy. No executable credential-service allow rule is present.
export const m4SystemKeychainPolicy = Object.freeze({
  version: 1,
  scope: 'SOURCE_ONLY',
  blockedStage: 'M4_SYSTEM_KEYCHAIN_POLICY',
  reason: 'SYSTEM_KEYCHAIN_DENIAL_UNVERIFIED',
  credentialServiceAccess: 'DENY_ALL',
  systemCredentialDenialVerified: false,
  nativeCollectorsActive: false,
  hostQualified: false,
  signInAuthorized: false,
  liveLaunchPermitted: false,
  qualifyingBuilderReceiptsAdded: 0,
});
