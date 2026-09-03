import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.SAFE_BETA_E2E_PORT || 55174)
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('SAFE_BETA_E2E_PORT must be an unprivileged TCP port')
}

const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'safe-beta-agent.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  timeout: 45_000,
  outputDir: process.env.SAFE_BETA_E2E_OUTPUT || '/tmp/trinity-safe-beta-e2e',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
