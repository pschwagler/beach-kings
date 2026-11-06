'use strict';

const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

// Apply only when the target is present, including in pruned install graphs.
// Keep both the modern default and SDK 57's named query-string API.
const root = resolve(__dirname, '..');
if (!existsSync(resolve(root, 'node_modules/query-string'))) process.exit(0);

const result = spawnSync(process.execPath, [require.resolve('patch-package'), '--error-on-fail'], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
