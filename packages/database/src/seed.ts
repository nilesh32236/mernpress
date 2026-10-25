import { checkDatabase, createDatabaseClient } from './client.js';
import { loadRootEnv, requireDatabaseUrl } from './load-env.js';

loadRootEnv();

const client = createDatabaseClient({ connectionString: requireDatabaseUrl() });

try {
  await checkDatabase(client);
  console.log('Phase 2 seed: no CMS data is created (intentional, idempotent no-op).');
  console.log('Create the first administrator with: pnpm auth:bootstrap');
} finally {
  await client.$disconnect();
}
