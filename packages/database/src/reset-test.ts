import { checkDatabase, createDatabaseClient } from './client.js';
import { loadRootEnv, requireTestDatabaseUrl } from './load-env.js';

loadRootEnv();

const testDatabaseUrl = requireTestDatabaseUrl();
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ''));

if (!/(test|e2e)/i.test(databaseName)) {
  throw new Error(
    `Refusing to reset a database whose name does not contain "test" or "e2e": ${databaseName}`,
  );
}

const client = createDatabaseClient({ connectionString: testDatabaseUrl });

try {
  await checkDatabase(client);
  await client.$executeRaw`
    TRUNCATE TABLE "audit_events", "sessions", "login_attempts", "users"
    RESTART IDENTITY CASCADE
  `;
  console.log('Test database reset: auth tables truncated.');
} finally {
  await client.$disconnect();
}
