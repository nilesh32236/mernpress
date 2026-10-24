import { checkDatabase, createDatabaseClient } from './client.js';
import { loadRootEnv, requireDatabaseUrl } from './load-env.js';

loadRootEnv();

const databaseUrl = requireDatabaseUrl();
const client = createDatabaseClient({ connectionString: databaseUrl });

try {
  const result = await checkDatabase(client);
  const rows = await client.$queryRaw<Array<{ id: string }>>`SELECT uuidv7()::text AS id`;
  const uuid = rows[0]?.id;

  console.log(`Database OK: timezone=${result.timezone} uuidv7=${uuid ?? 'missing'}`);

  if (!uuid || uuid[14] !== '7') {
    throw new Error(`Expected a version 7 UUID from PostgreSQL, received: ${uuid ?? 'none'}`);
  }
} finally {
  await client.$disconnect();
}
