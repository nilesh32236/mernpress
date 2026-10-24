import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface DatabaseClientOptions {
  connectionString: string;
  maxConnections?: number;
  connectionTimeoutMs?: number;
}

export type DatabaseClient = PrismaClient;

/**
 * Creates a Prisma client with a PostgreSQL pool pinned to UTC.
 *
 * Construction is lazy: no connection is opened until the first query, which is
 * what lets the API start (and report readiness 503) while PostgreSQL is down.
 */
export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 2_000,
    idleTimeoutMillis: 30_000,
    options: '-c timezone=UTC',
  });

  return new PrismaClient({ adapter });
}

/**
 * Parameterized connectivity check used by readiness and the DB scripts.
 * Throws when the database cannot answer within the timeout.
 */
export async function checkDatabase(
  client: DatabaseClient,
  timeoutMs = 2_000,
): Promise<{ timezone: string }> {
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Database check timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timer.unref();
  });

  try {
    const rows = await Promise.race([
      client.$queryRaw<Array<{ timezone: string }>>`
        SELECT current_setting('TimeZone') AS timezone
      `,
      timeout,
    ]);

    const row = rows[0];
    if (!row) {
      throw new Error('Database connectivity check returned no rows');
    }
    if (row.timezone !== 'UTC') {
      throw new Error(`Database session timezone is ${row.timezone}, expected UTC`);
    }

    return { timezone: row.timezone };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
