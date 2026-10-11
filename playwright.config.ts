import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
          args: ['--no-sandbox', '--disable-gpu'],
        }
      : undefined,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    env: { AGENT_MODE: 'demo' },
  },
});
