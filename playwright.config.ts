import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  testMatch: /(?:demo|conversation)\.spec\.ts/,
  // Keep fixture tests isolated from a live app already running on port 3000.
  use: {
    baseURL: 'http://127.0.0.1:3002',
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
          args: ['--no-sandbox', '--disable-gpu'],
        }
      : undefined,
  },
  webServer: {
    command: 'npm run dev -- --port 3002',
    url: 'http://127.0.0.1:3002',
    reuseExistingServer: false,
    env: { AGENT_MODE: 'demo' },
  },
});
