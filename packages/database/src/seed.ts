import { checkDatabase, createDatabaseClient } from './client.js';
import { loadRootEnv, requireDatabaseUrl } from './load-env.js';

loadRootEnv();

const client = createDatabaseClient({ connectionString: requireDatabaseUrl() });

try {
  await checkDatabase(client);
  console.log('Phase 1 seed: no CMS data is created (intentional, idempotent no-op).');
  console.log('The first seed/bootstrap data belongs to Phase 2 authentication.');
} finally {
  await client.$disconnect();
}
