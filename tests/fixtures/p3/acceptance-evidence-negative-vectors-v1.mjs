// Synthetic test data only. Not a receipt schema, validator, handler or evidence issuer.
const clone = value => structuredClone(value);
function fragment(row) {
  return { occurrence: clone(row.occurrence), outcome: 'SYNTHETIC_SUCCESS',
    artifacts: row.artifact_classes.map((artifact_class, index) => ({
      artifact_class, reference: `SYNTHETIC_ONLY:${index}`
    })) };
}
function vector(row, fault, fragments) {
  return { fixture_only: true, data_class: 'D5', fault,
    expected_occurrence: clone(row.occurrence), required_artifact_classes: clone(row.artifact_classes),
    fragments, expected_disposition: 'REJECT_FIXTURE_ONLY', acceptance_authorized: false };
}

export function p3EvidenceNegativeVectors(rows) {
  const vectors = [];
  for (const row of rows) {
    const sample = fragment(row);
    vectors.push(vector(row, 'MISSING_ASSERTION', []));
    vectors.push(vector(row, 'DUPLICATE_OCCURRENCE', [clone(sample), clone(sample)]));
    vectors.push(vector(row, 'CONTRADICTORY_OUTCOMES', [clone(sample), { ...clone(sample), outcome: 'SYNTHETIC_FAILURE' }]));
    const wrong = clone(sample); wrong.occurrence[1] = 'P3-AT-999-S01';
    vectors.push(vector(row, 'WRONG_SCENARIO', [wrong]));
    const missing = clone(sample); missing.artifacts.pop();
    vectors.push(vector(row, 'MISSING_ARTIFACT_CLASS', [missing]));
    const malformed = clone(sample); malformed.artifacts[0].reference = 123;
    vectors.push(vector(row, 'MALFORMED_ARTIFACT_REFERENCE', [malformed]));
  }
  const cleanup = rows.filter(row => row.occurrence[3] === 'P3_WORKTREE_REMAINS_CLEAN');
  for (let index = 0; index < cleanup.length; index++) {
    vectors.push(vector(cleanup[index], 'CROSS_SCENARIO_CLEANUP_REUSE',
      [fragment(cleanup[(index + 1) % cleanup.length])]));
  }
  return vectors;
}
