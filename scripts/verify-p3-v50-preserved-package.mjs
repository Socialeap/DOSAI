import { resolve } from 'node:path';

import { verifyPreservedV50Package } from './p3-v50-package-verification.mjs';

const resultPrefix = 'DOSAI_V50_PRESERVED_PACKAGE_VERIFICATION_V1:';

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.argv.length !== 2) {
    console.error('DOSAI_V50_PRESERVED_PACKAGE_ARGUMENTS_REJECTED');
    process.exitCode = 2;
  } else {
    try {
      const result = await verifyPreservedV50Package();
      process.stdout.write(`${resultPrefix}${JSON.stringify(result)}\n`);
    } catch {
      console.error('DOSAI_V50_PRESERVED_PACKAGE_VERIFICATION_FAILED');
      process.exitCode = 1;
    }
  }
}
