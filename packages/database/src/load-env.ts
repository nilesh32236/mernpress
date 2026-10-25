import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/**
 * Loads the repository-root .env for CLI scripts regardless of the directory
 * the package manager used to start them.
 */
export function loadRootEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  config({ path: path.resolve(here, '../../../.env'), quiet: true });
}

export function requireDatabaseUrl(): string {
  const value = process.env['DATABASE_URL'];
  if (!value) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and configure PostgreSQL before running database commands.',
    );
  }
  return value;
}

export function requireTestDatabaseUrl(): string {
  const value = process.env['TEST_DATABASE_URL'];
  if (!value) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Copy .env.example to .env and configure a dedicated test database.',
    );
  }
  return value;
}
