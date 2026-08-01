import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalJson, digestObject, sha256Bytes } from './canonical-json.mjs';
import { createEvidenceStore, prepareArtifact } from './evidence-store.mjs';
import { runFixed } from './fixed-process.mjs';
import { executeP1Suite } from './p1-suite.mjs';
import { executeP2Suite } from './p2-suite.mjs';
import { createSchemaValidator, requireValid } from './schema-validator.mjs';
import { readStrictJson } from './strict-json.mjs';

const root = resolve(import.meta.dirname, '../../..');
const runnerVersion = '0.2.0';
const repositoryId = 'd68ec563-9da5-43a2-8ff5-2dbe435d0342';
const commonSchemaPath = 'docs/architecture/schemas/v1/common.schema.json';

const catalogPolicies = new Map([
  ['docs/testing/acceptance-test-catalog-v2.json', Object.freeze({
    catalogDigest: '5fe489ee6695aa5c42c477173753bf3ef6e233f293e8925be4aebd633bc4a914',
    catalogSchemaId: 'urn:dosai:schema:acceptance-test-catalog:2',
    catalogSchemaPath: 'docs/architecture/schemas/v2/acceptance-test-catalog.schema.json',
    evidenceSchemaId: 'urn:dosai:schema:evidence-report:2',
    evidenceSchemaPath: 'docs/architecture/schemas/v2/evidence-report.schema.json',
    runnerVersion: null,
    registryId: 'urn:dosai:schema-registry:3',
  })],
  ['docs/testing/acceptance-test-catalog-v3.json', Object.freeze({
    catalogDigest: 'cc5ab86d34be384d1a3150195dda247b8a1570f7bfd2e2dd5f3c961ed6fcedb1',
    catalogSchemaId: 'urn:dosai:schema:acceptance-test-catalog:3',
    catalogSchemaPath: 'docs/architecture/schemas/v3/acceptance-test-catalog.schema.json',
    evidenceSchemaId: 'urn:dosai:schema:evidence-report:3',
    evidenceSchemaPath: 'docs/architecture/schemas/v3/evidence-report.schema.json',
    fixtureSchemaId: 'urn:dosai:schema:acceptance-fixture-manifest:1',
    fixtureSchemaPath: 'docs/architecture/schemas/v1/acceptance-fixture-manifest.schema.json',
    runnerVersion: '0.1.0',
    registryId: 'urn:dosai:schema-registry:4',
  })],
  ['docs/testing/acceptance-test-catalog-v4.json', Object.freeze({
    catalogDigest: '5339a14ddad7b79a127378b047e884b3ff3602659482b6029146bb1ab86b20ad',
    catalogSchemaId: 'urn:dosai:schema:acceptance-test-catalog:4',
    catalogSchemaPath: 'docs/architecture/schemas/v4/acceptance-test-catalog.schema.json',
    evidenceSchemaId: 'urn:dosai:schema:evidence-report:4',
    evidenceSchemaPath: 'docs/architecture/schemas/v4/evidence-report.schema.json',
    fixtureSchemaId: 'urn:dosai:schema:acceptance-fixture-manifest:2',
    fixtureSchemaPath: 'docs/architecture/schemas/v2/acceptance-fixture-manifest.schema.json',
    runnerVersion: '0.1.1',
    registryId: 'urn:dosai:schema-registry:5',
  })],
  ['docs/testing/acceptance-test-catalog-v5.json', Object.freeze({
    catalogDigest: '482887c6e3d7a24d09471428a6486c9926d11a5b3e31673e3c91bf2ebf55843a',
    catalogSchemaId: 'urn:dosai:schema:acceptance-test-catalog:5',
    catalogSchemaPath: 'docs/architecture/schemas/v5/acceptance-test-catalog.schema.json',
    evidenceSchemaId: 'urn:dosai:schema:evidence-report:5',
    evidenceSchemaPath: 'docs/architecture/schemas/v5/evidence-report.schema.json',
    fixtureSchemaId: 'urn:dosai:schema:acceptance-fixture-manifest:3',
    fixtureSchemaPath: 'docs/architecture/schemas/v3/acceptance-fixture-manifest.schema.json',
    runnerVersion: '0.2.0',
    registryId: 'urn:dosai:schema-registry:10',
  })],
]);

const fixturePolicies = new Map([
  ['3:P1-AT-001', Object.freeze({
    catalogVersion: 3,
    digest: '1b5b76b43fd3c0050240e6307a99d6cf54135a7c618ec6985777db2ebe8c85f1',
    path: 'tests/acceptance/manifests/p1-at-001.json',
    runnerVersion: '0.1.0',
  })],
  ['3:P1-AT-002', Object.freeze({
    catalogVersion: 3,
    digest: '847bec91d2806b7a8c98bedfdea677892a6de888bd46d275c135bc488d506b9c',
    path: 'tests/acceptance/manifests/p1-at-002.json',
    runnerVersion: '0.1.0',
  })],
  ['3:P1-AT-003', Object.freeze({
    catalogVersion: 3,
    digest: '05d2930235ede9feb8178fee7171fd972af29bd4729f2f86ba3d99a91928112e',
    path: 'tests/acceptance/manifests/p1-at-003.json',
    runnerVersion: '0.1.0',
  })],
  ['4:P1-AT-001', Object.freeze({
    catalogVersion: 4,
    digest: 'd84b55ffab2898852e5294ac2c68a8d4aeeb12908c402b4c88d16d50cb7a6102',
    path: 'tests/acceptance/manifests/p1-at-001-v2.json',
    runnerVersion: '0.1.1',
  })],
  ['4:P1-AT-002', Object.freeze({
    catalogVersion: 4,
    digest: '3eb872481850da329d980fa03c8ba596511793c530d98721bdb46aace7a642f7',
    path: 'tests/acceptance/manifests/p1-at-002-v2.json',
    runnerVersion: '0.1.1',
  })],
  ['4:P1-AT-003', Object.freeze({
    catalogVersion: 4,
    digest: 'ce55653c3238e40379798e011a92661eaa3d893e167afbd723cac990658aaac9',
    path: 'tests/acceptance/manifests/p1-at-003-v2.json',
    runnerVersion: '0.1.1',
  })],
  ['5:P1-AT-001', Object.freeze({
    catalogVersion: 5,
    digest: 'c929bd41e0ce58916d74a38b2fca9c23a9e00ce6d9539f77a5f856fbb38e852a',
    path: 'tests/acceptance/manifests/p1-at-001-v3.json',
    runnerVersion: '0.2.0',
  })],
  ['5:P1-AT-002', Object.freeze({
    catalogVersion: 5,
    digest: 'd6ed92cecf39c26eda947adeba05bd9615dabfbcac262f84d0d3d95f371d9e98',
    path: 'tests/acceptance/manifests/p1-at-002-v3.json',
    runnerVersion: '0.2.0',
  })],
  ['5:P1-AT-003', Object.freeze({
    catalogVersion: 5,
    digest: 'aee426d0357795169cfa2b136608c7d786a4d175ba310d6020b9d51c209e82c0',
    path: 'tests/acceptance/manifests/p1-at-003-v3.json',
    runnerVersion: '0.2.0',
  })],
  ['5:P2-AT-001', Object.freeze({
    catalogVersion: 5,
    digest: 'c4d3a8f4ebdb00fa31689f3ae8d7628f04f5c3cbd21f190ca251fd7703646e36',
    path: 'tests/acceptance/manifests/p2-at-001-v3.json',
    runnerVersion: '0.2.0',
  })],
  ['5:P2-AT-002', Object.freeze({
    catalogVersion: 5,
    digest: 'ec6b76591c10d6e5188c9fe82170fee105bf46f2c20c3afc90d4fad58887630e',
    path: 'tests/acceptance/manifests/p2-at-002-v3.json',
    runnerVersion: '0.2.0',
  })],
  ['5:P2-AT-003', Object.freeze({
    catalogVersion: 5,
    digest: 'e84e14fb6a1e81b4330646fc8c0e2b816a93afbcacbd00a8afd4f17ccc9a37ac',
    path: 'tests/acceptance/manifests/p2-at-003-v3.json',
    runnerVersion: '0.2.0',
  })],
]);

const expectedHandlers = new Map([
  ['P1-AT-001-S01', 'P1_PACKAGE_LIFECYCLE'],
  ['P1-AT-001-S02', 'P1_RECOVERY'],
  ['P1-AT-002-S01', 'P1_RUNTIME_BOUNDARY'],
  ['P1-AT-002-S02', 'P1_AUTHORITY_CORPUS'],
  ['P1-AT-003-S01', 'P1_REQUEST_REJECTION'],
  ['P1-AT-003-S02', 'P1_TYPED_BRIDGE_LOAD'],
  ['P2-AT-001-S01', 'P2_POLICY_TYPED_MATRIX'],
  ['P2-AT-001-S02', 'P2_POLICY_ATTACK_CORPUS'],
  ['P2-AT-002-S01', 'P2_AUTHORIZATION_BINDING'],
  ['P2-AT-002-S02', 'P2_AUTHORIZATION_ATTACK_CORPUS'],
  ['P2-AT-003-S01', 'P2_AUDIT_FAULT_CORPUS'],
  ['P2-AT-003-S02', 'P2_DEGRADED_ASSURANCE_RECOVERY'],
]);

const runnerSourcePaths = [
  'tools/dosai-acceptance/bin/dosai-acceptance.mjs',
  'tools/dosai-acceptance/package.json',
  'tools/dosai-acceptance/src/canonical-json.mjs',
  'tools/dosai-acceptance/src/evidence-store.mjs',
  'tools/dosai-acceptance/src/fixed-process.mjs',
  'tools/dosai-acceptance/src/p1-suite.mjs',
  'tools/dosai-acceptance/src/p2-suite.mjs',
  'tools/dosai-acceptance/src/runner.mjs',
  'tools/dosai-acceptance/src/schema-validator.mjs',
  'tools/dosai-acceptance/src/strict-json.mjs',
];

function safeResult(code, exitCode) {
  return Object.freeze({ code, exitCode });
}

export function parseCliArguments(arguments_) {
  if (
    arguments_.length !== 7 ||
    arguments_[0] !== 'run' ||
    arguments_[1] !== '--catalog' ||
    arguments_[3] !== '--suite' ||
    !/^P(?:[0-9]|1[01])-AT-[0-9]{3}$/.test(arguments_[4]) ||
    arguments_[5] !== '--report-dir-env' ||
    arguments_[6] !== 'DOSAI_EVIDENCE_DIR'
  ) {
    throw new Error('CLI_ARGUMENTS_REJECTED');
  }
  return Object.freeze({ catalogPath: arguments_[2], suiteId: arguments_[4] });
}

function exactArrayEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function verifyFixtureContract(fixture, fixtureBytes, suite, policy) {
  if (
    policy.digest === null ||
    fixture.status !== 'ACCEPTED' ||
    fixture.catalog_version !== policy.catalogVersion ||
    fixture.suite_id !== suite.id ||
    fixture.runner.id !== 'dosai-acceptance' ||
    fixture.runner.version !== policy.runnerVersion ||
    sha256Bytes(fixtureBytes) !== policy.digest ||
    !exactArrayEqual(fixture.required_artifacts, suite.required_artifacts)
  ) {
    throw new Error('FIXTURE_IDENTITY_REJECTED');
  }

  const expectedScenarios = suite.scenarios.map(({ id }) => id);
  const fixtureScenarios = fixture.cases.map(({ scenario_id: id }) => id);
  if (
    new Set(fixtureScenarios).size !== fixtureScenarios.length ||
    !exactArrayEqual(fixtureScenarios, expectedScenarios)
  ) {
    throw new Error('FIXTURE_SCENARIOS_REJECTED');
  }

  const assertionIds = new Set();
  for (const fixtureCase of fixture.cases) {
    if (expectedHandlers.get(fixtureCase.scenario_id) !== fixtureCase.handler_id) {
      throw new Error('FIXTURE_HANDLER_REJECTED');
    }
    const expectedInputDigest = sha256Bytes(`${fixtureCase.input_profile}\n`);
    if (fixtureCase.input_digest.value !== expectedInputDigest) {
      throw new Error('FIXTURE_INPUT_REJECTED');
    }
    for (const assertion of fixtureCase.assertions) {
      if (assertionIds.has(assertion.id)) {
        throw new Error('FIXTURE_ASSERTION_REJECTED');
      }
      assertionIds.add(assertion.id);
      for (const artifactClass of assertion.artifact_classes) {
        if (!suite.required_artifacts.includes(artifactClass)) {
          throw new Error('FIXTURE_ARTIFACT_REJECTED');
        }
      }
    }
  }
}

function fixedEnvironment() {
  const environment = {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    LC_ALL: 'C',
  };
  for (const name of ['HOME', 'PATH', 'TMPDIR']) {
    if (process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  return environment;
}

async function git(arguments_) {
  return runFixed('/usr/bin/git', [
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.untrackedCache=false',
    ...arguments_,
  ], { cwd: root, env: fixedEnvironment(), timeout: 30_000 });
}

async function readCleanStatus() {
  const { stdout } = await git(['status', '--porcelain=v1', '--untracked-files=all']);
  return stdout.length === 0;
}

async function readSafeEnvironment(runtimeVersions) {
  const [macosVersion, macosBuild, hardwareModel, gitVersion, packageFile] = await Promise.all([
    runFixed('/usr/bin/sw_vers', ['-productVersion'], {
      env: fixedEnvironment(),
      timeout: 10_000,
    }),
    runFixed('/usr/bin/sw_vers', ['-buildVersion'], {
      env: fixedEnvironment(),
      timeout: 10_000,
    }),
    runFixed('/usr/sbin/sysctl', ['-n', 'hw.model'], {
      env: fixedEnvironment(),
      timeout: 10_000,
    }),
    runFixed('/usr/bin/git', ['--version'], {
      env: fixedEnvironment(),
      timeout: 10_000,
    }),
    readStrictJson(join(root, 'package.json')),
  ]);

  const gitMatch = /^git version ([0-9]+(?:\.[0-9]+){2})(?: \(Apple Git-[0-9]+\))?\n?$/.exec(
    gitVersion.stdout,
  );
  if (gitMatch === null || process.arch !== 'arm64') {
    throw new Error('PLATFORM_PROFILE_REJECTED');
  }

  return {
    architecture: 'arm64',
    components: {
      app: packageFile.value.version,
      git: gitMatch[1],
      ...(runtimeVersions ?? {}),
    },
    hardware_model: hardwareModel.stdout.trim(),
    macos_build: macosBuild.stdout.trim(),
    macos_version: macosVersion.stdout.trim(),
    platform_profile: 'MACOS_ARM64_V1',
  };
}

async function runnerDigest() {
  const hash = createHash('sha256');
  for (const path of runnerSourcePaths) {
    hash.update(path);
    hash.update('\0');
    hash.update(await readFile(join(root, path)));
    hash.update('\0');
  }
  return { algorithm: 'SHA-256', value: hash.digest('hex') };
}

function containsSecret(values, canaries) {
  const serialized = values.join('\n');
  const patterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
  ];
  return canaries.some((canary) => serialized.includes(canary)) ||
    patterns.some((pattern) => pattern.test(serialized));
}

function artifactPayload(artifactClass, context) {
  const base = {
    artifact_class: artifactClass,
    artifact_schema: 'DOSAI_ACCEPTANCE_ARTIFACT_V1',
    run_id: context.runId,
    suite_id: context.suite.id,
  };
  switch (artifactClass) {
    case 'ASSERTIONS':
      return { ...base, assertions: context.assertions.map(({ artifact_ids, ...item }) => item) };
    case 'ENVIRONMENT':
      return { ...base, environment: context.environment };
    case 'COMMAND':
      return {
        ...base,
        ...(context.operationTimeoutMs === undefined
          ? {}
          : { operation_timeout_ms: context.operationTimeoutMs }),
        operations: context.operations ?? [
          'PACKAGE_BUILD_FIXED',
          'PACKAGE_SIGNATURE_VERIFY_FIXED',
          'PACKAGED_RUNTIME_AUDIT_FIXED',
        ],
        shell: false,
      };
    case 'PACKAGE':
      return {
        ...base,
        package_digest: context.packageDigest ?? null,
        package_state: context.packageDigest === undefined ? 'PACKAGE_UNAVAILABLE' : 'PACKAGE_VERIFIED',
      };
    case 'MANIFEST':
      return {
        ...base,
        catalog_digest: context.catalogDigest,
        corpus: context.corpusManifest ?? [],
        fixture_manifest_digest: context.fixtureDigest,
        inputs: context.fixture.cases.map(({ input_digest, input_profile }) => ({
          input_digest,
          input_profile,
        })),
      };
    case 'PERFORMANCE':
      return {
        ...base,
        measurements: context.measurements,
      };
    case 'JOURNAL':
      return {
        ...base,
        journal: context.journal ?? {
          assurance: 'UNAVAILABLE',
          reason_code: 'EXECUTION_FAILED',
        },
      };
    case 'VERIFIER':
      return {
        ...base,
        verifier: context.verifier ?? {
          result: 'UNAVAILABLE',
          reason_code: 'EXECUTION_FAILED',
        },
      };
    case 'CLEANUP':
      return {
        ...base,
        assertions: context.assertions
          .filter(({ id }) => context.cleanupAssertionIds.has(id))
          .map(({ artifact_ids, ...item }) => item),
      };
    default:
      throw new Error('ARTIFACT_CLASS_REJECTED');
  }
}

export function buildEvidenceBundle({
  catalog,
  catalogBytes,
  catalogPath,
  dependencyLockBytes,
  environment,
  executableDigest,
  execution,
  finished,
  fixture,
  fixtureBytes,
  headCommit,
  policy,
  started,
  suite,
  suiteId,
  worktreeClean,
}) {
  const runId = randomUUID();
  const reportId = randomUUID();
  const catalogDigest = digestObject(catalogBytes);
  const fixtureDigest = digestObject(fixtureBytes);
  const dependencyLockDigest = digestObject(dependencyLockBytes);
  const artifactIds = new Map(
    suite.required_artifacts
      .filter((artifactClass) => artifactClass !== 'REPORT')
      .map((artifactClass) => [artifactClass, randomUUID()]),
  );
  const assertions = fixture.cases.flatMap((fixtureCase) =>
    fixtureCase.assertions.map((expected) => {
      const observed = execution.results.get(expected.id);
      const pass = observed?.pass === true;
      return {
        artifact_ids: expected.artifact_classes.map((artifactClass) => artifactIds.get(artifactClass)),
        expected_code: expected.expected_code,
        id: expected.id,
        observed_code: pass ? 'ASSERTION_PASS' : 'ASSERTION_FAIL',
        result: pass ? 'PASS' : 'FAIL',
      };
    }),
  );
  const assertionMap = new Map(assertions.map((assertion) => [assertion.id, assertion]));
  const scenarios = fixture.cases.map((fixtureCase) => {
    const assertionIds = fixtureCase.assertions.map(({ id }) => id);
    const pass = assertionIds.every((id) => assertionMap.get(id)?.result === 'PASS');
    return {
      assertion_ids: assertionIds,
      ...(pass || execution.errorCode === undefined ? {} : { error_code: execution.errorCode }),
      id: fixtureCase.scenario_id,
      result: pass ? 'PASS' : 'FAIL',
    };
  });
  const allAssertionsPass = assertions.every(({ result }) => result === 'PASS');
  const result = allAssertionsPass && execution.errorCode === undefined && worktreeClean
    ? 'PASS'
    : 'FAIL';
  const exitCode = result === 'PASS' ? 0 : 1;
  const cleanupAssertionIds = new Set(fixture.cases.flatMap((fixtureCase) =>
    fixtureCase.assertions
      .filter(({ artifact_classes: artifactClasses }) => artifactClasses.includes('CLEANUP'))
      .map(({ id }) => id),
  ));
  const cleanupIds = assertions
    .filter(({ id }) => cleanupAssertionIds.has(id))
    .map(({ id }) => id);
  const limitations = [...new Set(fixture.cases.flatMap(({ limitations: items }) => items))];
  const measurements = [...execution.results.entries()]
    .filter(([, value]) => value.measurement !== undefined)
    .map(([assertion_id, value]) => ({ assertion_id, value: value.measurement }));
  const artifactContext = {
    assertions,
    catalogDigest,
    cleanupAssertionIds,
    corpusManifest: execution.corpusManifest,
    environment,
    fixture,
    fixtureDigest,
    journal: execution.journal,
    measurements,
    operationTimeoutMs: execution.operationTimeoutMs,
    operations: execution.operations,
    packageDigest: execution.packageDigest,
    runId,
    suite,
    verifier: execution.verifier,
  };
  const preparedArtifacts = [...artifactIds].map(([artifactClass, artifactId]) =>
    prepareArtifact(artifactClass, artifactId, artifactPayload(artifactClass, artifactContext)),
  );
  const report = {
    artifacts: preparedArtifacts.map(({ descriptor }) => descriptor),
    assertions,
    attempt: 1,
    catalog_digest: catalogDigest,
    catalog_version: catalog.catalog_version,
    cleanup: {
      assertion_ids: cleanupIds,
      result: cleanupIds.every((id) => assertionMap.get(id)?.result === 'PASS') ? 'PASS' : 'FAIL',
    },
    command: {
      args: [
        'exec',
        'dosai-acceptance',
        'run',
        '--catalog',
        catalogPath,
        '--suite',
        suiteId,
        '--report-dir-env',
        'DOSAI_EVIDENCE_DIR',
      ],
      executable: 'pnpm',
      shell: false,
      working_directory_class: 'LEASED_REPOSITORY_ROOT',
    },
    created_at: new Date(finished).toISOString(),
    data_class: 'D2',
    duration_ms: finished - started,
    environment,
    exit_code: exitCode,
    external_effects: { expected: 'NONE', observed: 'NONE', reconciled: true },
    finished_at: new Date(finished).toISOString(),
    fixture_manifest_digest: fixtureDigest,
    gaps: execution.errorCode === undefined ? [] : [execution.errorCode],
    limitations,
    message_id: randomUUID(),
    phase: suite.phase,
    producer: 'dosai.acceptance',
    producer_generation: '1',
    report_id: reportId,
    result,
    run_id: runId,
    runner: {
      executable_digest: executableDigest,
      id: 'dosai-acceptance',
      validator_id: 'ajv',
      validator_version: '8.20.0',
      version: runnerVersion,
    },
    scenarios,
    schema_id: policy.evidenceSchemaId,
    schema_version: catalog.catalog_version,
    secret_scan: { canary_set_version: fixture.secret_canary_set_version, result: 'PASS' },
    started_at: new Date(started).toISOString(),
    subject: {
      dependency_lock_digest: dependencyLockDigest,
      head_commit: headCommit,
      ...(execution.packageDigest === undefined ? {} : { package_digest: execution.packageDigest }),
      policy_version: 1,
      repository_id: repositoryId,
      schema_registry: policy.registryId,
      worktree_dirty: false,
    },
    suite_id: suiteId,
    trace_id: randomUUID(),
  };
  const serializedEvidence = [
    canonicalJson(report),
    ...preparedArtifacts.map(({ bytes }) => bytes),
  ];
  return Object.freeze({
    exitCode,
    preparedArtifacts,
    report,
    result,
    secretScanPassed: !containsSecret(serializedEvidence, execution.secretCanaries ?? []),
  });
}

async function loadAcceptedCatalog(catalogPath) {
  const policy = catalogPolicies.get(catalogPath);
  if (policy === undefined) {
    throw new Error('CATALOG_PATH_REJECTED');
  }
  const { bytes, value: catalog } = await readStrictJson(join(root, catalogPath));
  const validator = await createSchemaValidator(root, [commonSchemaPath, policy.catalogSchemaPath]);
  requireValid(validator, policy.catalogSchemaId, catalog);
  if (
    policy.catalogDigest === null ||
    catalog.status !== 'ACCEPTED' ||
    sha256Bytes(bytes) !== policy.catalogDigest
  ) {
    throw new Error('CATALOG_IDENTITY_REJECTED');
  }
  if (policy.runnerVersion !== null && policy.runnerVersion !== runnerVersion) {
    throw new Error('RUNNER_IDENTITY_REJECTED');
  }
  return { bytes, catalog, policy };
}

function findSuite(catalog, suiteId) {
  const matches = catalog.suites.filter(({ id }) => id === suiteId);
  if (matches.length !== 1) {
    throw new Error('SUITE_ID_REJECTED');
  }
  return matches[0];
}

async function executeAcceptedSuite(catalogPath, suiteId, catalogBytes, catalog, policy) {
  const suite = findSuite(catalog, suiteId);
  if (suite.implementation_state !== 'IMPLEMENTED') {
    return safeResult('DOSAI_ACCEPTANCE_SUITE_NOT_IMPLEMENTED_0001', 2);
  }
  if (!['P1', 'P2'].includes(suite.phase)) {
    return safeResult('DOSAI_ACCEPTANCE_PHASE_NOT_IMPLEMENTED_0001', 2);
  }

  const fixturePolicy = fixturePolicies.get(`${catalog.catalog_version}:${suiteId}`);
  if (fixturePolicy === undefined || fixturePolicy.path !== suite.fixture_manifest) {
    return safeResult('DOSAI_ACCEPTANCE_FIXTURE_REJECTED_0001', 2);
  }

  const validator = await createSchemaValidator(root, [
    commonSchemaPath,
    policy.catalogSchemaPath,
    policy.fixtureSchemaPath,
    policy.evidenceSchemaPath,
  ]);
  const { bytes: fixtureBytes, value: fixture } = await readStrictJson(
    join(root, fixturePolicy.path),
  );
  requireValid(validator, policy.fixtureSchemaId, fixture);
  verifyFixtureContract(fixture, fixtureBytes, suite, fixturePolicy);

  if (!(await readCleanStatus())) {
    return safeResult('DOSAI_ACCEPTANCE_DIRTY_WORKTREE_0001', 2);
  }

  const started = Date.now();
  const [head, lockBytes, executableDigest] = await Promise.all([
    git(['rev-parse', '--verify', 'HEAD']),
    readFile(join(root, 'pnpm-lock.yaml')),
    runnerDigest(),
  ]);
  const execution = suite.phase === 'P1'
    ? await executeP1Suite(root, suiteId)
    : await executeP2Suite(root, suiteId);
  const worktreeClean = await readCleanStatus();
  execution.results.set(
    `${suite.phase}_WORKTREE_REMAINS_CLEAN`,
    Object.freeze({ pass: worktreeClean }),
  );
  const environment = await readSafeEnvironment(execution.audit?.runtime ?? execution.runtime);
  const finished = Date.now();
  const bundle = buildEvidenceBundle({
    catalog,
    catalogBytes,
    catalogPath,
    dependencyLockBytes: lockBytes,
    environment,
    executableDigest,
    execution,
    finished,
    fixture,
    fixtureBytes,
    headCommit: head.stdout.trim(),
    policy,
    started,
    suite,
    suiteId,
    worktreeClean,
  });
  if (!bundle.secretScanPassed) {
    return safeResult('DOSAI_ACCEPTANCE_SECRET_SCAN_FAILED_0001', 1);
  }
  requireValid(validator, policy.evidenceSchemaId, bundle.report);

  let store;
  try {
    const configuredPath = process.env.DOSAI_EVIDENCE_DIR;
    if (configuredPath === undefined) {
      return safeResult('DOSAI_ACCEPTANCE_EVIDENCE_ROOT_MISSING_0001', 2);
    }
    store = await createEvidenceStore(root, configuredPath, suiteId, bundle.report.run_id);
    for (const prepared of bundle.preparedArtifacts) {
      await store.writeArtifact(prepared);
    }
    await store.writeReport(bundle.report);
  } catch {
    await store?.discard().catch(() => undefined);
    return safeResult('DOSAI_ACCEPTANCE_EVIDENCE_WRITE_FAILED_0001', 1);
  }

  return safeResult(
    bundle.result === 'PASS' ? 'DOSAI_ACCEPTANCE_PASS_0000' : 'DOSAI_ACCEPTANCE_FAIL_0001',
    bundle.exitCode,
  );
}

export async function runCli(arguments_) {
  try {
    const { catalogPath, suiteId } = parseCliArguments(arguments_);
    const { bytes, catalog, policy } = await loadAcceptedCatalog(catalogPath);
    return await executeAcceptedSuite(catalogPath, suiteId, bytes, catalog, policy);
  } catch (error) {
    const blocked = new Set([
      'CATALOG_IDENTITY_REJECTED',
      'FIXTURE_IDENTITY_REJECTED',
      'RUNNER_IDENTITY_REJECTED',
    ]);
    return safeResult(
      blocked.has(error?.message)
        ? 'DOSAI_ACCEPTANCE_CONTRACT_NOT_ACCEPTED_0001'
        : 'DOSAI_ACCEPTANCE_CONTRACT_REJECTED_0001',
      2,
    );
  }
}
