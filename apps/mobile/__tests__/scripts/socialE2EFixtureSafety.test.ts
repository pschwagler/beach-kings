import fs from 'node:fs';
import path from 'node:path';

const runnerPath = path.resolve(
  __dirname,
  '../../scripts/run-social-e2e.sh',
);
const runner = fs.readFileSync(runnerPath, 'utf8');
const fixtureSource = runner.match(/<<'PY'\n([\s\S]*?)\nPY\n/)?.[1];

describe('social E2E fixture safety', () => {
  it('uses isolated run-scoped accounts instead of shared dev identities', () => {
    expect(runner).toContain('SOCIAL_E2E_RUN_ID');
    expect(runner).toContain('social-e2e-${E2E_RUN_ID}-runner');
    expect(runner).not.toContain('EXPO_PUBLIC_DEV_USER_EMAIL');
    expect(runner).not.toContain('EXPO_PUBLIC_DEV_USER_PASSWORD');
  });

  it('keeps database setup additive and local-only', () => {
    expect(fixtureSource).toBeDefined();
    expect(fixtureSource).toContain('local_database_hosts');
    expect(fixtureSource).toContain('session.add(user)');
    expect(fixtureSource).toContain('session.add(player)');
    expect(fixtureSource).not.toMatch(/\bdelete\s*\(/i);
    expect(fixtureSource).not.toMatch(/\bupdate\s*\(/i);
    expect(fixtureSource).not.toMatch(/\btruncate\b/i);
    expect(fixtureSource).not.toMatch(/\bdrop\b/i);
  });
});
