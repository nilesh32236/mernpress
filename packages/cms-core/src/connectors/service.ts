import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';

/**
 * Settings → Connectors.
 *
 * WordPress stores provider credentials here for plugins to share. MERNPress has
 * no AI plugin yet, so the credentials are stored encrypted at rest with a key
 * derived from the server pepper, exposed back only as a mask, and documented as
 * not consumed by any bundled feature.
 */
export interface ConnectorProvider {
  id: string;
  name: string;
  description: string;
}

export interface ConnectorState extends ConnectorProvider {
  configured: boolean;
  maskedKey: string | null;
  updatedAt: string | null;
}

export const CONNECTOR_PROVIDERS: readonly ConnectorProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Text and image generation with GPT and DALL·E.',
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Text and image generation with Gemini and Imagen.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Text generation with Claude.',
  },
];

export interface ConnectorServiceOptions {
  prisma: DatabaseClient;
  /** Server pepper; the connector encryption key is derived from it. */
  pepper: string;
  now?: () => Date;
}

const KEY_PREFIX = 'connector_key_';
const KEY_BYTES = 32;

function encryptionKey(pepper: string): Buffer {
  return scryptSync(pepper, 'mernpress-connectors', KEY_BYTES);
}

function encrypt(pepper: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(pepper), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

function decrypt(pepper: string, payload: string): string | null {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(pepper),
      Buffer.from(ivPart, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

function mask(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}

export function createConnectorService({
  prisma,
  pepper,
  now = () => new Date(),
}: ConnectorServiceOptions) {
  async function list(principal: Principal): Promise<ConnectorState[]> {
    requireCapability(principal, 'manage_options');
    const rows = await prisma.option.findMany({
      where: { key: { in: CONNECTOR_PROVIDERS.map((provider) => `${KEY_PREFIX}${provider.id}`) } },
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return CONNECTOR_PROVIDERS.map((provider) => {
      const row = byKey.get(`${KEY_PREFIX}${provider.id}`);
      let maskedKey: string | null = null;
      let updatedAt: string | null = null;
      if (row) {
        try {
          const value = JSON.parse(row.value) as { encrypted?: string };
          const decrypted =
            typeof value.encrypted === 'string' ? decrypt(pepper, value.encrypted) : null;
          if (decrypted) {
            maskedKey = mask(decrypted);
            updatedAt = row.updatedAt.toISOString();
          }
        } catch {
          // Corrupt value: report as not configured.
        }
      }
      return { ...provider, configured: maskedKey !== null, maskedKey, updatedAt };
    });
  }

  async function setKey(
    principal: Principal,
    id: string,
    apiKey: string,
  ): Promise<ConnectorState[]> {
    requireCapability(principal, 'manage_options');
    const provider = CONNECTOR_PROVIDERS.find((entry) => entry.id === id);
    if (!provider) {
      throw new ContentError('NOT_FOUND', 'Connector not found', 404);
    }
    const key = apiKey.trim();
    if (key.length < 8 || key.length > 4096) {
      throw new ContentError('VALIDATION_ERROR', 'Enter a valid API key.', 400);
    }
    const payload = JSON.stringify({
      encrypted: encrypt(pepper, key),
      updatedAt: now().toISOString(),
    });
    await prisma.option.upsert({
      where: { key: `${KEY_PREFIX}${id}` },
      create: { key: `${KEY_PREFIX}${id}`, value: payload, group: 'connectors' },
      update: { value: payload, group: 'connectors' },
    });
    return list(principal);
  }

  async function disconnect(principal: Principal, id: string): Promise<ConnectorState[]> {
    requireCapability(principal, 'manage_options');
    if (!CONNECTOR_PROVIDERS.some((entry) => entry.id === id)) {
      throw new ContentError('NOT_FOUND', 'Connector not found', 404);
    }
    await prisma.option.deleteMany({ where: { key: `${KEY_PREFIX}${id}` } });
    return list(principal);
  }

  return { list, setKey, disconnect };
}

export type ConnectorService = ReturnType<typeof createConnectorService>;
