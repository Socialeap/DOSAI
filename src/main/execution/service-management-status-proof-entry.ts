import { app } from 'electron';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  createServiceManagementStatusAdapter,
  type ServiceManagementStatusObservation,
} from './service-management-status-adapter';

const resultPrefix = 'DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:';
const statusAddonName = 'dosai-service-management-status.node';
const requireFromProofEntry = createRequire(__filename);
let emitted = false;

function loadFixedStatusAddon(): unknown {
  try {
    return requireFromProofEntry(join(process.resourcesPath, statusAddonName));
  } catch {
    return undefined;
  }
}

function emitResult(observation: ServiceManagementStatusObservation): void {
  if (emitted) {
    app.exit(1);
    return;
  }
  emitted = true;
  process.stdout.write(`${resultPrefix}${observation}\n`);
  app.exit(0);
}

void app.whenReady().then(
  () => emitResult(createServiceManagementStatusAdapter(loadFixedStatusAddon()).observe()),
  () => emitResult('NOT_FOUND'),
);
