#!/usr/bin/env node

import { runCli } from '../src/runner.mjs';

const outcome = await runCli(process.argv.slice(2));
process.stdout.write(`${outcome.code}\n`);
process.exitCode = outcome.exitCode;
