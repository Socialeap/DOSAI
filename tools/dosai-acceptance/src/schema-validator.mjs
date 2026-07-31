import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { join } from 'node:path';

import { readStrictJson } from './strict-json.mjs';

export async function createSchemaValidator(root, schemaPaths) {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: false,
    strict: true,
    validateFormats: true,
  });
  addFormats(ajv, { mode: 'full' });

  for (const path of schemaPaths) {
    const { value } = await readStrictJson(join(root, path));
    ajv.addSchema(value);
  }
  return ajv;
}

export function requireValid(ajv, schemaId, value) {
  const validate = ajv.getSchema(schemaId);
  if (validate === undefined || !validate(value)) {
    throw new Error('SCHEMA_VALIDATION_FAILED');
  }
}
