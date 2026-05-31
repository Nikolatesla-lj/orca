import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4187',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'pnpm exec vite docs/scryer-dogfood/pipe-runner --host 127.0.0.1 --port 4187',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROME_PATH ?? '/usr/bin/google-chrome'
        }
      }
    }
  ]
})
