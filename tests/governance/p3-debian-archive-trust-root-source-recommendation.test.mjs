import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const recordPath = resolve(
  root,
  'docs/architecture/p3-debian-archive-trust-root-source-recommendation.json',
);
const prerequisitePath = resolve(
  root,
  'docs/architecture/p3-debian-archive-trust-root-observation-gate.json',
);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const record = parseStrictJson(await readFile(recordPath));

test('trust-root recommendation binds the existing no-authority gate', async () => {
  assert.equal(record.status, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.equal(record.scope, 'PUBLIC_KEY_SOURCE_SELECTION_RECOMMENDATION_ONLY');
  assert.deepEqual(record.preconditions, [{
    path: 'docs/architecture/p3-debian-archive-trust-root-observation-gate.json',
    sha256: 'a1f2b3ce8175bfd832db949278d91a484bc7a160e814ca13dda236eb5cc48c08',
  }]);
  assert.equal(sha256(await readFile(prerequisitePath)), record.preconditions[0].sha256);
  assert.ok(Object.values(record.authorities).every(value => value === false));
});

test('recommendation fixes the three Debian 13 key sources and separate reference', () => {
  assert.deepEqual(record.key_material_sources, [
    {
      purpose: 'DEBIAN_13_ARCHIVE_AUTOMATIC',
      url: 'https://ftp-master.debian.org/keys/archive-key-13.asc',
      expected_primary_fingerprint: '04B54C3CDCA79751B16BC6B5225629DF75B188BD',
    },
    {
      purpose: 'DEBIAN_13_SECURITY_ARCHIVE_AUTOMATIC',
      url: 'https://ftp-master.debian.org/keys/archive-key-13-security.asc',
      expected_primary_fingerprint: '5E04A1E3223A19A20706E20F9904613D4CCE68C6',
    },
    {
      purpose: 'DEBIAN_13_STABLE_RELEASE',
      url: 'https://ftp-master.debian.org/keys/release-13.asc',
      expected_primary_fingerprint: '41587F7DB8C774BCCF131416762F67A0B2C39DE4',
    },
  ]);
  assert.equal(record.official_fingerprint_page, 'https://ftp-master.debian.org/keys.html');
  assert.deepEqual(record.independent_fingerprint_reference, {
    url: 'https://lists.debian.org/debian-devel-announce/2025/04/msg00001.html',
    relationship: 'SEPARATE_OFFICIAL_DEBIAN_LIST_ARCHIVE',
    must_be_observed_separately: true,
  });
  for (const source of record.key_material_sources) {
    assert.match(source.url, /^https:\/\/ftp-master\.debian\.org\/keys\/[a-z0-9.-]+\.asc$/);
    assert.match(source.expected_primary_fingerprint, /^[0-9A-F]{40}$/);
  }
});

test('observation remains bounded, temporary, mismatch-stopping, and non-authorizing', () => {
  assert.deepEqual(record.observation_contract, {
    temporary_storage: 'IGNORED_MKTEMP_DIRECTORY_ONLY',
    https_only: true,
    maximum_bytes_per_key: 65536,
    maximum_total_key_bytes: 196608,
    record_sha256: true,
    record_size_bytes: true,
    record_primary_fingerprints: true,
    compare_all_expected_fingerprints: true,
    delete_temporary_bytes_on_success_or_failure: true,
    stop_on_redirect_to_non_https: true,
    stop_on_any_mismatch: true,
  });
  assert.equal(
    record.next_gate,
    'OWNER_ACCEPTANCE_AND_SEPARATE_READ_ONLY_OBSERVATION_AUTHORIZATION_REQUIRED',
  );
});
