#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function collectPlaywrightInventory(extraArgs = []) {
  const output = execFileSync(
    'npx',
    ['playwright', 'test', '--list', '--project=chromium', ...extraArgs],
    { cwd: new URL('../../../', import.meta.url), encoding: 'utf8' },
  );
  const total = output.match(/Total:\s+(\d+) tests? in (\d+) files?/);
  if (!total) throw new Error('Could not parse Playwright discovery output');

  const tags = Object.fromEntries(
    ['smoke', 'p0', 'p1', 'p2', 'admin', 'policy'].map((tag) => [
      `@${tag}`,
      output.split('\n').filter((line) => line.includes(`@${tag}`)).length,
    ]),
  );
  return { tests: Number(total[1]), files: Number(total[2]), tags };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(collectPlaywrightInventory(), null, 2));
}
