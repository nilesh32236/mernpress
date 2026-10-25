import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv, requireTestDatabaseUrl } from './load-env.js';

loadRootEnv();

const testDatabaseUrl = requireTestDatabaseUrl();
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('Applying migrations to the test database...');
const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  cwd: packageRoot,
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
