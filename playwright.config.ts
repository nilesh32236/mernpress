import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @mernpress/api dev',
      url: 'http://127.0.0.1:4000/api/health',
      reuseExistingServer: !isCi,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @mernpress/admin dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !isCi,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @mernpress/web dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: !isCi,
      timeout: 120_000,
    },
  ],
});
