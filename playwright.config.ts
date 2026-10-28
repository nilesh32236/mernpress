import { config as loadDotenv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

loadDotenv({ path: '.env', quiet: true });

const isCi = Boolean(process.env['CI']);
const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
// Port overrides let the suite run against an isolated API when another process
// owns the default port (for example a production service on :4000).
const apiPort = Number(process.env['E2E_API_PORT'] ?? 4000);
// The admin and public dev servers keep their documented ports; only the API
// port needs an override when another service owns :4000.
const adminUrl = 'http://127.0.0.1:5173';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const e2eOrigins = `${adminUrl},http://localhost:5173`;

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
      url: `${apiUrl}/api/health`,
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
        HOST: '127.0.0.1',
        PORT: String(apiPort),
      },
    },
    {
      command: 'pnpm --filter @mernpress/admin dev',
      url: adminUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_PROXY_TARGET: apiUrl,
      },
    },
    {
      command: 'pnpm --filter @mernpress/web dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
