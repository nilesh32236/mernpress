import { fileURLToPath } from 'node:url';
import { loadEnv, type Env } from '../../src/config/env.js';
import { makeTempDir } from './temp-storage.js';

const loadedEnv = loadEnv();
const configuredTestDatabaseUrl = process.env['TEST_DATABASE_URL'];

if (!configuredTestDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for API tests. Copy .env.example to .env and create the test database.',
  );
}

if (!/(test|e2e)/i.test(new URL(configuredTestDatabaseUrl).pathname)) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name contains "test" or "e2e"');
}

export const testDatabaseUrl: string = configuredTestDatabaseUrl;

export function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...loadedEnv,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDatabaseUrl,
    AUTH_HASH_PEPPER: 'test-only-auth-hash-pepper-2026-10-25-0123456789',
    CORS_ORIGINS: ['http://127.0.0.1:5173'],
    TRUST_PROXY: false,
    SESSION_TTL_MINUTES: 480,
    SESSION_IDLE_MINUTES: 30,
    LOGIN_RATE_LIMIT_MAX: 5,
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: 15,
    // Per-test storage root: upload tests never touch the repo or each other
    // (reference test-setup pattern). The directories are removed when the
    // test worker exits, so a run leaves nothing behind in the temp folder.
    MEDIA_STORAGE_DIR: makeTempDir('mernpress-test-media-'),
    SCHEDULER_ENABLED: false,
    PLUGIN_STORAGE_DIR: makeTempDir('mernpress-test-plugins-'),
    PLUGIN_SEED_DIR: fileURLToPath(new URL('../../../../plugins', import.meta.url)),
    THEME_STORAGE_DIR: makeTempDir('mernpress-test-themes-'),
    THEME_SEED_DIR: fileURLToPath(new URL('../../../../themes', import.meta.url)),
    BACKUP_STORAGE_DIR: makeTempDir('mernpress-test-backups-'),
    BACKUP_RETENTION: 5,
    ...overrides,
  };
}
