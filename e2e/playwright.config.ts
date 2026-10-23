import { defineConfig, devices } from '@playwright/test'

// Runs against the compose stack (docker compose up --build -d --wait), which
// serves the built frontend and proxies the API on http://localhost:3000.
// Every spec runs in every project unless a project ignores it; the API spec
// needs no viewport, so only Desktop Chrome runs it.
const phoneOnly = { testIgnore: /api\.spec\.ts/ }

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // A CI runner has four cores; locally Playwright picks half the machine's.
  workers: process.env.CI ? 4 : undefined,
  // The whole run has to fit in two minutes, so a hang fails fast.
  globalTimeout: 2 * 60 * 1000,
  timeout: 15_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    {
      // The original iPhone SE: 320×568 with touch, a mobile user agent and a
      // 2× screen, run in Chromium so one browser install covers every project.
      name: 'iPhone SE',
      use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium' },
      ...phoneOnly,
    },
    {
      name: '320×568',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 568 },
      },
      ...phoneOnly,
    },
    {
      name: '667×375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 667, height: 375 },
      },
      ...phoneOnly,
    },
  ],
})
