import { config as loadDotenv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

loadDotenv({ path: '.env', quiet: true });

const isCi = Boolean(process.env['CI']);
const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const e2eOrigins = 'http://127.0.0.1:5173,http://localhost:5173';

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for E2E tests. Copy .env.example to .env and create the test database.',
  );
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
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
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: testDatabaseUrl,
        TEST_DATABASE_URL: testDatabaseUrl,
        AUTH_HASH_PEPPER:
          process.env['AUTH_HASH_PEPPER'] ?? 'e2e-test-auth-hash-pepper-2026-10-25-0123456789',
        CORS_ORIGINS: e2eOrigins,
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'pnpm --filter @mernpress/admin dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @mernpress/web dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
