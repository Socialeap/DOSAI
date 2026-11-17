"""Source placement and digest checks. Never invoke the diagnostic collector."""
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
ACTIVE = '.github/workflows/p3-read-only-mount-topology.yml'
PROPOSAL = 'docs/proposals/p3-mount-topology-diagnostics-v1.yml'
SOURCE_RECORD = 'docs/architecture/p3-topology-diagnostic-source-record-v1.json'
ACTIVATION_RECORD = 'docs/architecture/p3-mount-topology-workflow-activation-record-v1.json'


def read(path):
    return (ROOT / path).read_bytes()


class ActivationTests(unittest.TestCase):
    def test_active_workflow_matches_the_reviewed_proposal_except_for_comment(self):
        expected = (b'# Manual diagnostic only. Dispatch requires separate owner authorization.\n'
                    + read(PROPOSAL).partition(b'\n')[2])
        self.assertEqual(read(ACTIVE), expected)

    def test_bound_inputs_and_existing_workflows_preserve_reviewed_bytes(self):
        record = json.loads(read(ACTIVATION_RECORD))
        source = json.loads(read(SOURCE_RECORD))
        existing_workflows = {
            '.github/workflows/p3-kernel-writer-attribution-diagnostics.yml',
            '.github/workflows/p3-kernel-writer-diagnostics.yml',
            '.github/workflows/p3-native-builder-host-feasibility.yml',
        }
        self.assertEqual(set(record['inputs']),
                         set(source['inputs']) | existing_workflows | {SOURCE_RECORD, ACTIVE})
        for path, digest in record['inputs'].items():
            with self.subTest(path=path):
                self.assertEqual(hashlib.sha256(read(path)).hexdigest(), digest)
        for path, digest in source['inputs'].items():
            self.assertEqual(record['inputs'][path], digest)
        self.assertEqual(record['workflow_path'], ACTIVE)
        self.assertEqual(record['workflow_sha256'], record['inputs'][ACTIVE])

    def test_activation_record_grants_no_dispatch_or_runtime_authority(self):
        record = json.loads(read(ACTIVATION_RECORD))
        source = json.loads(read(SOURCE_RECORD))
        self.assertEqual(record['authorities'], dict(source['authorities'], merge=False))
        self.assertTrue(all(value is False for value in record['authorities'].values()))
        self.assertEqual(record['runtime_status'], 'NO_GO')
        self.assertEqual(record['status'], 'PREPARED_FOR_REVIEW_NOT_DISPATCHED')
        self.assertEqual(record['dispatch_prerequisites'], {
            'trigger': 'workflow_dispatch',
            'jobs': ['host_a', 'host_b'],
            'runner': 'ubuntu-24.04',
            'timeout_minutes_per_job': 5,
            'attempt_limit': 1,
            'retry_allowed': False,
            'maximum_charge_usd': 0,
            'verify_public_repository_and_zero_cost_before_dispatch': True,
        })


if __name__ == '__main__':
    unittest.main()
