import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_MOCK_BASE_URL || 'http://localhost:3000';
const port = new URL(baseURL).port || '3000';

/**
 * Browser-only moderation checks.
 *
 * This config deliberately has no global setup or backend dependency. The spec
 * intercepts every API call, so running it never creates or cleans database data.
 */
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'moderation-workspace.spec.js',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'mocked-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `PORT=${port} npm run dev`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
