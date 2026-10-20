import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.LIVE_PORT ?? 3001);
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'live.spec.ts',
  timeout: 180000,
  expect: { timeout: 125000 },
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
          : undefined,
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { AGENT_MODE: 'live' },
  },
});
