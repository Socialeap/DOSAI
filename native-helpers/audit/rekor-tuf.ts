import { createHash, createPublicKey } from 'node:crypto';

import type { Digest } from './contracts.ts';
import type { RekorV2PinnedTrustMaterial } from './rekor-v2.ts';

export type RekorTufFailureCode =
  | 'DOSAI_REKOR_TUF_DOCUMENT_0001'
  | 'DOSAI_REKOR_TUF_SERVICE_0001'
  | 'DOSAI_REKOR_TUF_TRUST_0001';

export class RekorTufFailure extends Error {
  readonly code: RekorTufFailureCode;
  readonly assurance = 'BROKEN';

  constructor(code: RekorTufFailureCode) {
    super(code);
    this.name = 'RekorTufFailure';
    this.code = code;
  }
}

export type RekorV2ResolvedTrust = Readonly<{
  endpointUrl: string;
  operator: string;
  trust: RekorV2PinnedTrustMaterial;
}>;

type JsonRecord = Record<string, unknown>;

const SIGNING_CONFIG_MEDIA_TYPE = 'application/vnd.dev.sigstore.signingconfig.v0.2+json';
const TRUSTED_ROOT_MEDIA_TYPE = 'application/vnd.dev.sigstore.trustedroot+json;version=0.1';

function fail(code: RekorTufFailureCode): never {
  throw new RekorTufFailure(code);
}

function parseDocument(text: string): JsonRecord {
  if (text.length < 1 || text.length > 1_048_576) {
    return fail('DOSAI_REKOR_TUF_DOCUMENT_0001');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail('DOSAI_REKOR_TUF_DOCUMENT_0001');
  }
  return record(value, 'DOSAI_REKOR_TUF_DOCUMENT_0001');
}

function record(value: unknown, code: RekorTufFailureCode): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : fail(code);
}

function stringField(value: JsonRecord, key: string, code: RekorTufFailureCode): string {
  const field = value[key];
  return typeof field === 'string' && field.length > 0 && field.length <= 4_096
    ? field
    : fail(code);
}

function integerField(value: JsonRecord, key: string, code: RekorTufFailureCode): number {
  const field = value[key];
  return Number.isSafeInteger(field) && (field as number) >= 0
    ? field as number
    : fail(code);
}

function arrayField(value: JsonRecord, key: string, code: RekorTufFailureCode): unknown[] {
  const field = value[key];
  return Array.isArray(field) && field.length <= 64 ? field : fail(code);
}

function sha256Digest(text: string): Digest {
  return Object.freeze({
    algorithm: 'SHA-256',
    value: createHash('sha256').update(text, 'utf8').digest('hex'),
  });
}

function canonicalBase64(value: string, expectedLength?: number): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return fail('DOSAI_REKOR_TUF_TRUST_0001');
  }
  const bytes = Buffer.from(value, 'base64');
  if (
    bytes.length === 0 ||
    bytes.toString('base64') !== value ||
    (expectedLength !== undefined && bytes.length !== expectedLength)
  ) {
    return fail('DOSAI_REKOR_TUF_TRUST_0001');
  }
  return bytes;
}

function timestamp(value: unknown, code: RekorTufFailureCode): number {
  if (typeof value !== 'string' || value.length > 64) {
    return fail(code);
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fail(code);
}

function validAt(value: unknown, now: number, code: RekorTufFailureCode): boolean {
  const window = record(value, code);
  const start = timestamp(window.start, code);
  const end = window.end === undefined ? undefined : timestamp(window.end, code);
  if (end !== undefined && end <= start) {
    return fail(code);
  }
  return start <= now && (end === undefined || now < end);
}

function normalizedServiceUrl(value: string, code: RekorTufFailureCode): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(code);
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.pathname !== '' && url.pathname !== '/')
  ) {
    return fail(code);
  }
  return url;
}

function selectService(config: JsonRecord, now: number): Readonly<{
  baseUrl: string;
  operator: string;
}> {
  if (config.mediaType !== SIGNING_CONFIG_MEDIA_TYPE) {
    return fail('DOSAI_REKOR_TUF_DOCUMENT_0001');
  }
  const candidates = arrayField(config, 'rekorTlogUrls', 'DOSAI_REKOR_TUF_DOCUMENT_0001')
    .map((entry) => record(entry, 'DOSAI_REKOR_TUF_DOCUMENT_0001'))
    .filter((entry) => integerField(entry, 'majorApiVersion', 'DOSAI_REKOR_TUF_DOCUMENT_0001') === 2)
    .filter((entry) => validAt(entry.validFor, now, 'DOSAI_REKOR_TUF_DOCUMENT_0001'))
    .map((entry) => {
      const url = normalizedServiceUrl(
        stringField(entry, 'url', 'DOSAI_REKOR_TUF_DOCUMENT_0001'),
        'DOSAI_REKOR_TUF_DOCUMENT_0001',
      );
      return Object.freeze({
        baseUrl: url.origin,
        operator: stringField(entry, 'operator', 'DOSAI_REKOR_TUF_DOCUMENT_0001'),
      });
    });

  const byOperator = new Map<string, Readonly<{ baseUrl: string; operator: string }>>();
  for (const candidate of candidates) {
    if (!byOperator.has(candidate.operator)) {
      byOperator.set(candidate.operator, candidate);
    }
  }
  const selected = [...byOperator.values()];
  const selection = record(config.rekorTlogConfig, 'DOSAI_REKOR_TUF_DOCUMENT_0001');
  const selector = stringField(selection, 'selector', 'DOSAI_REKOR_TUF_DOCUMENT_0001');
  if (
    selected.length === 0 ||
    (selector === 'ANY' && selected.length < 1) ||
    (selector === 'EXACT' && (integerField(selection, 'count', 'DOSAI_REKOR_TUF_DOCUMENT_0001') !== 1)) ||
    (selector === 'ALL' && selected.length !== 1) ||
    !['ANY', 'EXACT', 'ALL'].includes(selector)
  ) {
    return fail('DOSAI_REKOR_TUF_SERVICE_0001');
  }
  return selected[0] ?? fail('DOSAI_REKOR_TUF_SERVICE_0001');
}

function resolveLog(
  trustedRoot: JsonRecord,
  service: Readonly<{ baseUrl: string; operator: string }>,
  now: number,
  signingConfigDigest: Digest,
  trustedRootDigest: Digest,
): RekorV2ResolvedTrust {
  if (trustedRoot.mediaType !== TRUSTED_ROOT_MEDIA_TYPE) {
    return fail('DOSAI_REKOR_TUF_DOCUMENT_0001');
  }
  const matches = arrayField(trustedRoot, 'tlogs', 'DOSAI_REKOR_TUF_DOCUMENT_0001')
    .map((entry) => record(entry, 'DOSAI_REKOR_TUF_DOCUMENT_0001'))
    .filter((entry) => entry.baseUrl === service.baseUrl);
  if (matches.length !== 1) {
    return fail('DOSAI_REKOR_TUF_TRUST_0001');
  }
  const log = matches[0]!;
  if (log.hashAlgorithm !== 'SHA2_256') {
    return fail('DOSAI_REKOR_TUF_TRUST_0001');
  }
  const publicKey = record(log.publicKey, 'DOSAI_REKOR_TUF_TRUST_0001');
  if (!validAt(publicKey.validFor, now, 'DOSAI_REKOR_TUF_TRUST_0001')) {
    return fail('DOSAI_REKOR_TUF_TRUST_0001');
  }
  const keyDetails = stringField(publicKey, 'keyDetails', 'DOSAI_REKOR_TUF_TRUST_0001');
  if (keyDetails !== 'PKIX_ECDSA_P256_SHA_256' && keyDetails !== 'PKIX_ED25519') {
    return fail('DOSAI_REKOR_TUF_TRUST_0001');
  }
  const derBase64 = stringField(publicKey, 'rawBytes', 'DOSAI_REKOR_TUF_TRUST_0001');
  const der = canonicalBase64(derBase64);
  let keyObject;
  try {
    keyObject = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    return fail('DOSAI_REKOR_TUF_TRUST_0001');
  }
  const keyName = normalizedServiceUrl(service.baseUrl, 'DOSAI_REKOR_TUF_TRUST_0001').host;
  let derivedKeyId: Buffer;
  if (keyDetails === 'PKIX_ECDSA_P256_SHA_256') {
    if (
      keyObject.asymmetricKeyType !== 'ec' ||
      keyObject.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      return fail('DOSAI_REKOR_TUF_TRUST_0001');
    }
    derivedKeyId = createHash('sha256').update(der).digest();
  } else {
    if (keyObject.asymmetricKeyType !== 'ed25519') {
      return fail('DOSAI_REKOR_TUF_TRUST_0001');
    }
    const jwk = keyObject.export({ format: 'jwk' });
    if (typeof jwk.x !== 'string') {
      return fail('DOSAI_REKOR_TUF_TRUST_0001');
    }
    const rawKey = Buffer.from(jwk.x, 'base64url');
    if (rawKey.length !== 32) {
      return fail('DOSAI_REKOR_TUF_TRUST_0001');
    }
    derivedKeyId = createHash('sha256')
      .update(keyName, 'utf8')
      .update(Buffer.from([0x0a, 0x01]))
      .update(rawKey)
      .digest();
  }
  const logId = record(log.logId, 'DOSAI_REKOR_TUF_TRUST_0001');
  const keyIdBase64 = stringField(logId, 'keyId', 'DOSAI_REKOR_TUF_TRUST_0001');
  canonicalBase64(keyIdBase64, 32);
  if (derivedKeyId.toString('base64') !== keyIdBase64) {
    return fail('DOSAI_REKOR_TUF_TRUST_0001');
  }

  return Object.freeze({
    endpointUrl: `${service.baseUrl}/api/v2/log/entries`,
    operator: service.operator,
    trust: Object.freeze({
      logOrigin: keyName,
      checkpointKeyName: keyName,
      checkpointKeyDetails: keyDetails,
      checkpointKeyIdBase64: keyIdBase64,
      checkpointPublicKeySpkiDerBase64: derBase64,
      trustedRootDigest,
      signingConfigDigest,
    }),
  });
}

export function resolveRekorV2Trust(input: Readonly<{
  signingConfigJson: string;
  trustedRootJson: string;
  now: Date;
}>): RekorV2ResolvedTrust {
  const now = input.now.getTime();
  if (!Number.isFinite(now)) {
    return fail('DOSAI_REKOR_TUF_DOCUMENT_0001');
  }
  const signingConfig = parseDocument(input.signingConfigJson);
  const trustedRoot = parseDocument(input.trustedRootJson);
  return resolveLog(
    trustedRoot,
    selectService(signingConfig, now),
    now,
    sha256Digest(input.signingConfigJson),
    sha256Digest(input.trustedRootJson),
  );
}
