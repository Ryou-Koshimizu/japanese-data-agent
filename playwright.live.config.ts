import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'live.spec.ts',
  timeout: 180000,
  expect: { timeout: 125000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: {
    command: 'npm run dev -- --port 3001',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: false,
    env: { AGENT_MODE: 'live' },
  },
});
