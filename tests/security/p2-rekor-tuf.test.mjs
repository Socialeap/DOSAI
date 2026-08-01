import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  RekorTufFailure,
  resolveRekorV2Trust,
} from '../../native-helpers/audit/rekor-tuf.ts';

const NOW = new Date('2026-07-31T20:30:00.000Z');
const BASE_URL = 'https://log2026-1.rekor.sigstore.dev';

function failure(code) {
  return (error) => {
    assert.ok(error instanceof RekorTufFailure);
    assert.equal(error.code, code);
    return true;
  };
}

function fixture() {
  const { publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const keyName = new URL(BASE_URL).host;
  const keyId = createHash('sha256')
    .update(keyName, 'utf8')
    .update(Buffer.from([0x0a, 0x01]))
    .update(raw)
    .digest('base64');
  const signingConfig = {
    mediaType: 'application/vnd.dev.sigstore.signingconfig.v0.2+json',
    rekorTlogUrls: [{
      url: BASE_URL,
      majorApiVersion: 2,
      validFor: { start: '2026-01-01T00:00:00Z' },
      operator: 'sigstore.dev',
    }],
    rekorTlogConfig: { selector: 'ANY' },
  };
  const trustedRoot = {
    mediaType: 'application/vnd.dev.sigstore.trustedroot+json;version=0.1',
    tlogs: [{
      baseUrl: BASE_URL,
      hashAlgorithm: 'SHA2_256',
      publicKey: {
        rawBytes: der.toString('base64'),
        keyDetails: 'PKIX_ED25519',
        validFor: { start: '2026-01-01T00:00:00Z' },
      },
      logId: { keyId },
    }],
  };
  return { signingConfig, trustedRoot, keyId, der };
}

function resolve(signingConfig, trustedRoot) {
  return resolveRekorV2Trust({
    signingConfigJson: JSON.stringify(signingConfig),
    trustedRootJson: JSON.stringify(trustedRoot),
    now: NOW,
  });
}

test('TUF targets resolve one active Rekor v2 shard and algorithm-explicit key', () => {
  const { signingConfig, trustedRoot, keyId, der } = fixture();
  const resolved = resolve(signingConfig, trustedRoot);
  assert.equal(resolved.endpointUrl, `${BASE_URL}/api/v2/log/entries`);
  assert.equal(resolved.operator, 'sigstore.dev');
  assert.equal(resolved.trust.logOrigin, 'log2026-1.rekor.sigstore.dev');
  assert.equal(resolved.trust.checkpointKeyDetails, 'PKIX_ED25519');
  assert.equal(resolved.trust.checkpointKeyIdBase64, keyId);
  assert.equal(resolved.trust.checkpointPublicKeySpkiDerBase64, der.toString('base64'));
  assert.match(resolved.trust.signingConfigDigest.value, /^[0-9a-f]{64}$/);
  assert.match(resolved.trust.trustedRootDigest.value, /^[0-9a-f]{64}$/);
});

test('missing, expired, unsafe, and unsupported v2 service selections fail closed', () => {
  const cases = [
    (config) => { config.rekorTlogUrls[0].majorApiVersion = 1; },
    (config) => { config.rekorTlogUrls[0].validFor.end = '2026-01-02T00:00:00Z'; },
    (config) => { config.rekorTlogUrls[0].url = 'http://log2026-1.rekor.sigstore.dev'; },
    (config) => { config.rekorTlogConfig = { selector: 'EXACT', count: 2 }; },
    (config) => { config.rekorTlogConfig = { selector: 'UNKNOWN' }; },
  ];
  for (const mutate of cases) {
    const { signingConfig, trustedRoot } = fixture();
    mutate(signingConfig);
    assert.throws(
      () => resolve(signingConfig, trustedRoot),
      (error) => error instanceof RekorTufFailure,
    );
  }
});

test('log substitution, invalid key identity, algorithm mismatch, and expiry fail closed', () => {
  const cases = [
    (root) => { root.tlogs[0].baseUrl = 'https://log-substitute.rekor.sigstore.dev'; },
    (root) => { root.tlogs[0].logId.keyId = Buffer.alloc(32, 7).toString('base64'); },
    (root) => { root.tlogs[0].publicKey.keyDetails = 'PKIX_ECDSA_P256_SHA_256'; },
    (root) => { root.tlogs[0].publicKey.validFor.end = '2026-01-02T00:00:00Z'; },
    (root) => { root.tlogs[0].hashAlgorithm = 'SHA2_512'; },
  ];
  for (const mutate of cases) {
    const { signingConfig, trustedRoot } = fixture();
    mutate(trustedRoot);
    assert.throws(
      () => resolve(signingConfig, trustedRoot),
      failure('DOSAI_REKOR_TUF_TRUST_0001'),
    );
  }
});

test('unknown document versions and malformed JSON fail closed', () => {
  const { signingConfig, trustedRoot } = fixture();
  signingConfig.mediaType = 'application/vnd.dev.sigstore.signingconfig.v0.3+json';
  assert.throws(
    () => resolve(signingConfig, trustedRoot),
    failure('DOSAI_REKOR_TUF_DOCUMENT_0001'),
  );
  assert.throws(
    () => resolveRekorV2Trust({
      signingConfigJson: '{',
      trustedRootJson: JSON.stringify(trustedRoot),
      now: NOW,
    }),
    failure('DOSAI_REKOR_TUF_DOCUMENT_0001'),
  );
});
