import { normalizeScreenOptions, type ScreenOptionsState } from '@mernpress/contracts';
import type { DatabaseClient, Prisma } from '@mernpress/database';
import type { Principal } from '../content/types.js';

/**
 * Per-user Screen Options (WordPress user meta equivalent).
 *
 * The client caches the map for fast paint, but this service is authoritative:
 * reads always normalize, so stale or hand-edited values cannot break the
 * admin, and writes replace the whole map in one update.
 */
export interface ScreenOptionsServiceOptions {
  prisma: DatabaseClient;
}

export function createScreenOptionsService({ prisma }: ScreenOptionsServiceOptions) {
  async function get(principal: Principal): Promise<ScreenOptionsState> {
    const row = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { screenOptions: true },
    });
    return normalizeScreenOptions(row?.screenOptions);
  }

  async function update(principal: Principal, input: unknown): Promise<ScreenOptionsState> {
    const options = normalizeScreenOptions(input);
    await prisma.user.update({
      where: { id: principal.userId },
      data: { screenOptions: options as unknown as Prisma.InputJsonValue },
    });
    return options;
  }

  return { get, update };
}

export type ScreenOptionsService = ReturnType<typeof createScreenOptionsService>;
