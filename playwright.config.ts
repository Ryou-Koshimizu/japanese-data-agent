import { defineConfig, devices } from '@playwright/test';
// Fixture tests use their own dev server. E2E_PORT lets several checkouts run
// side by side without fighting over one port.
const port = Number(process.env.E2E_PORT ?? 3002);
export default defineConfig({
  testDir: 'e2e',
  testMatch: /(?:demo|conversation|viewports)\.spec\.ts/,
  timeout: 60000,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
          ? {
              executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
              args: ['--no-sandbox', '--disable-gpu'],
            }
          : undefined,
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { AGENT_MODE: 'demo' },
  },
});
