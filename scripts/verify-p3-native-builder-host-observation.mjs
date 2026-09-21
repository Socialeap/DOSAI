import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStrictJson } from '../tools/dosai-acceptance/src/strict-json.mjs';

const prefix = 'DOSAI_HOST_OBSERVATION_V1:';
const maximumInputBytes = 16_384;
const jobs = Object.freeze(['builder_host_a', 'builder_host_b']);
const recordKeys = Object.freeze([
  'schema',
  'run_id',
  'run_attempt',
  'job',
  'sha',
  'runner_environment',
  'runner_os',
  'runner_arch',
  'uname_machine',
  'image_os',
  'image_version',
  'kernel_release',
  'dmi_product_uuid',
  'docker_server_arch',
  'no_active_binfmt_misc_interpreters',
]);

const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');

function reject() {
  throw new Error('P3_HOST_OBSERVATION_REJECTED');
}

function readOwnDataRecord(value) {
  try {
    const prototype = Object.getPrototypeOf(value);
    if (value === null || typeof value !== 'object' || (prototype !== Object.prototype && prototype !== null)) {
      reject();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== recordKeys.length ||
      keys.some(key => typeof key !== 'string' || !recordKeys.includes(key))
    ) {
      reject();
    }
    const record = {};
    for (const key of recordKeys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        reject();
      }
      record[key] = descriptor.value;
    }
    return record;
  } catch (error) {
    if (error instanceof Error && error.message === 'P3_HOST_OBSERVATION_REJECTED') throw error;
    reject();
  }
}

function boundedText(value, pattern, maximumLength = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength && pattern.test(value);
}

export function verifyP3NativeBuilderHostObservations(values, expectedSha) {
  if (
    !Array.isArray(values) ||
    values.length !== 2 ||
    !boundedText(expectedSha, /^[0-9a-f]{40}$/u, 40)
  ) {
    reject();
  }

  const records = values.map(readOwnDataRecord);
  const byJob = new Map(records.map(record => [record.job, record]));
  if (byJob.size !== 2 || jobs.some(job => !byJob.has(job))) reject();

  for (const record of records) {
    if (
      record.schema !== 'DOSAI_P3_HOST_OBSERVATION_V1' ||
      !boundedText(record.run_id, /^[1-9][0-9]*$/u, 32) ||
      !boundedText(record.run_attempt, /^[1-9][0-9]*$/u, 16) ||
      record.sha !== expectedSha ||
      record.runner_environment !== 'github-hosted' ||
      record.runner_os !== 'Linux' ||
      record.runner_arch !== 'X64' ||
      record.uname_machine !== 'x86_64' ||
      !boundedText(record.image_os, /^[A-Za-z0-9._-]+$/u, 64) ||
      !boundedText(record.image_version, /^[A-Za-z0-9._-]+$/u, 64) ||
      !boundedText(record.kernel_release, /^[A-Za-z0-9.+_-]+$/u, 128) ||
      !boundedText(
        record.dmi_product_uuid,
        /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/u,
        36,
      ) ||
      record.docker_server_arch !== 'amd64' ||
      record.no_active_binfmt_misc_interpreters !== true
    ) {
      reject();
    }
  }

  const [first, second] = jobs.map(job => byJob.get(job));
  if (
    first.run_id !== second.run_id ||
    first.run_attempt !== second.run_attempt ||
    first.sha !== second.sha ||
    first.image_os !== second.image_os ||
    first.image_version !== second.image_version ||
    first.dmi_product_uuid === second.dmi_product_uuid
  ) {
    reject();
  }

  return Object.freeze({
    schema: 'DOSAI_P3_HOST_OBSERVATION_VERIFICATION_V1',
    status: 'PASS_CANDIDATE_HOSTS_ONLY',
    run_id: first.run_id,
    run_attempt: first.run_attempt,
    sha: expectedSha,
    image_os: first.image_os,
    image_version: first.image_version,
    candidate_host_count: 2,
    distinct_dmi_identities: true,
    hosts: Object.freeze(jobs.map(job => {
      const record = byJob.get(job);
      return Object.freeze({
        job,
        dmi_identity_sha256: sha256(record.dmi_product_uuid),
        kernel_release: record.kernel_release,
      });
    })),
    physical_linux_builder_verified: false,
    builder_receipts_produced: 0,
    provider_charge_usd: 0,
  });
}

export function parseP3NativeBuilderHostObservationLines(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > maximumInputBytes) {
    reject();
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    reject();
  }
  const lines = source.endsWith('\n') ? source.slice(0, -1).split('\n') : source.split('\n');
  if (lines.length !== 2 || lines.some(line => !line.startsWith(prefix))) reject();
  return Object.freeze(lines.map(line => parseStrictJson(
    new TextEncoder().encode(line.slice(prefix.length)),
  )));
}

async function readStandardInput() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > maximumInputBytes) reject();
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.length !== 4 || process.argv[2] !== '--expected-sha') {
    console.error('Usage: node scripts/verify-p3-native-builder-host-observation.mjs --expected-sha <40-hex-sha>');
    process.exitCode = 2;
  } else {
    try {
      const observations = parseP3NativeBuilderHostObservationLines(await readStandardInput());
      const receipt = verifyP3NativeBuilderHostObservations(observations, process.argv[3]);
      console.log(`DOSAI_HOST_VERIFICATION_V1:${JSON.stringify(receipt)}`);
    } catch {
      console.error('P3_HOST_OBSERVATION_REJECTED');
      process.exitCode = 2;
    }
  }
}
