import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure'
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : {
        command: 'pnpm dev:e2e',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 120_000
      },
  projects: [
    {
      // Fast smoke tier — 5 specs against live staging URL.
      // Lives at tests/smoke/ (top-level) so the chromium project
      // cannot accidentally include it via recursive testDir glob.
      name: 'smoke',
      testDir: './tests/smoke',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      // Full operator workflow e2e suite — 26 specs.
      // Explicit testDir prevents ambiguity if global default changes.
      name: 'chromium',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
