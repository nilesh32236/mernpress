import { checkDatabase, createDatabaseClient } from './client.js';
import { loadRootEnv, requireDatabaseUrl } from './load-env.js';
import { seedDemoContent } from './seed-demo.js';

loadRootEnv();

const client = createDatabaseClient({ connectionString: requireDatabaseUrl() });

try {
  await checkDatabase(client);
  const result = await seedDemoContent(client, {
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
  });

  if (result.skipped) {
    console.log(`Seed: ${result.reason}`);
  } else {
    const c = result.created;
    console.log(
      `Seed: created ${c.posts} post(s), ${c.pages} page(s), ${c.categories} categor(ies), ${c.tags} tag(s).`,
    );
  }
  console.log(
    'Seed is idempotent and safe to re-run. The first administrator is created with: pnpm auth:bootstrap',
  );
} finally {
  await client.$disconnect();
}
