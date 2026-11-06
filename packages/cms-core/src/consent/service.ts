import { normalizeConsentConfig, type ConsentConfig } from '@mernpress/contracts';
import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import type { Principal } from '../content/types.js';

/**
 * Cookie-consent configuration (stored in the option store).
 *
 * The visitor's choice itself lives only in their browser (localStorage); the
 * server stores just the banner text/categories and version. There is no
 * consent log and no per-visitor record.
 */
const OPTION_KEY = 'consent_config';
const OPTION_GROUP = 'consent';

export interface ConsentServiceOptions {
  prisma: DatabaseClient;
}

export function createConsentService({ prisma }: ConsentServiceOptions) {
  async function read(): Promise<ConsentConfig> {
    const row = await prisma.option.findUnique({
      where: { key: OPTION_KEY },
      select: { value: true },
    });
    if (!row) return normalizeConsentConfig(null);
    try {
      return normalizeConsentConfig(JSON.parse(row.value));
    } catch {
      return normalizeConsentConfig(null);
    }
  }

  async function get(principal: Principal): Promise<ConsentConfig> {
    requireCapability(principal, 'manage_options');
    return read();
  }

  async function update(principal: Principal, input: unknown): Promise<ConsentConfig> {
    requireCapability(principal, 'manage_options');
    const config = normalizeConsentConfig(input);
    const value = JSON.stringify(config);
    await prisma.option.upsert({
      where: { key: OPTION_KEY },
      create: { key: OPTION_KEY, value, group: OPTION_GROUP },
      update: { value, group: OPTION_GROUP },
    });
    return config;
  }

  return { get, update, read };
}

export type ConsentService = ReturnType<typeof createConsentService>;
