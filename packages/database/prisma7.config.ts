import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(packageRoot, '../../.env'), quiet: true });

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and configure PostgreSQL before running Prisma commands.',
  );
}

/**
 * Shadow database for `migrate diff`/`migrate dev`. Prisma replays migrations on
 * this disposable database to compute a diff; it never touches the dev DB. It is
 * built from DATABASE_URL's credentials with the database name swapped. It may be
 * overridden via SHADOW_DATABASE_URL (CI uses its own disposable shadow DB).
 */
function deriveShadowUrl(url: string): string {
  const parsed = new URL(url);
  const base = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const shadowName = base.endsWith('_shadow') ? base : `${base}_shadow`;
  parsed.pathname = `/${encodeURIComponent(shadowName)}`;
  parsed.search = '';
  return parsed.toString();
}

const shadowDatabaseUrl = process.env['SHADOW_DATABASE_URL'] ?? deriveShadowUrl(databaseUrl);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
    shadowDatabaseUrl,
  },
});
