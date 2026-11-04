import { randomInt } from 'node:crypto';
import type { DatabaseClient } from '@mernpress/database';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import { hashPassword, verifyPassword } from './password.js';
import { normalizeUsername } from './username.js';

/**
 * WordPress-style application passwords (Profile → Application Passwords).
 *
 * A credential is generated once, shown once and stored only as an Argon2id
 * hash. It authenticates API requests with HTTP Basic auth, not the interactive
 * admin session, and can be revoked individually.
 */
export interface ApplicationPasswordSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
}

export interface CreatedApplicationPassword {
  /** Shown once at creation; never retrievable again. */
  password: string;
  item: ApplicationPasswordSummary;
}

export interface ApplicationPasswordService {
  list(principal: Principal): Promise<ApplicationPasswordSummary[]>;
  create(principal: Principal, name: string): Promise<CreatedApplicationPassword>;
  revoke(principal: Principal, id: string): Promise<void>;
  /**
   * Verify a Basic-auth credential. Returns the principal for an active user or
   * null. Records the last-used time (throttled) and IP.
   */
  verify(username: string, password: string, ip?: string | null): Promise<Principal | null>;
}

export interface ApplicationPasswordServiceOptions {
  prisma: DatabaseClient;
  now?: () => Date;
}

const GROUP_COUNT = 6;
const GROUP_LENGTH = 4;
const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const NAME_MAX = 200;
/** Bound Argon2 work per Basic-auth attempt for users with many credentials. */
const MAX_VERIFY = 10;
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

function generatePassword(): string {
  const groups: string[] = [];
  for (let group = 0; group < GROUP_COUNT; group += 1) {
    let value = '';
    for (let index = 0; index < GROUP_LENGTH; index += 1) {
      value += CHARSET[randomInt(CHARSET.length)];
    }
    groups.push(value);
  }
  return groups.join(' ');
}

/** WordPress ignores whitespace when checking an application password. */
function normalizePassword(value: string): string {
  return value.replace(/\s+/g, '');
}

function toSummary(row: {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
}): ApplicationPasswordSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: row.lastUsedIp,
  };
}

export function createApplicationPasswordService({
  prisma,
  now = () => new Date(),
}: ApplicationPasswordServiceOptions): ApplicationPasswordService {
  async function list(principal: Principal): Promise<ApplicationPasswordSummary[]> {
    const rows = await prisma.applicationPassword.findMany({
      where: { userId: principal.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        lastUsedIp: true,
      },
    });
    return rows.map(toSummary);
  }

  async function create(principal: Principal, name: string): Promise<CreatedApplicationPassword> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ContentError('VALIDATION_ERROR', 'Enter a name for the application password.', 400);
    }
    if (trimmed.length > NAME_MAX) {
      throw new ContentError('VALIDATION_ERROR', 'That name is too long.', 400);
    }
    const plaintext = generatePassword();
    const row = await prisma.applicationPassword.create({
      data: {
        userId: principal.userId,
        name: trimmed,
        passwordHash: await hashPassword(normalizePassword(plaintext)),
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        lastUsedIp: true,
      },
    });
    return { password: plaintext, item: toSummary(row) };
  }

  async function revoke(principal: Principal, id: string): Promise<void> {
    const deleted = await prisma.applicationPassword.deleteMany({
      where: { id, userId: principal.userId },
    });
    if (deleted.count === 0) {
      throw new ContentError('NOT_FOUND', 'Application password not found', 404);
    }
  }

  async function verify(
    username: string,
    password: string,
    ip?: string | null,
  ): Promise<Principal | null> {
    const candidate = normalizePassword(password);
    if (candidate.length < 8) return null;
    const user = await prisma.user.findUnique({
      where: { username: normalizeUsername(username) },
      select: {
        id: true,
        role: true,
        status: true,
        applicationPasswords: {
          orderBy: { createdAt: 'desc' },
          take: MAX_VERIFY,
          select: { id: true, passwordHash: true, lastUsedAt: true },
        },
      },
    });
    if (!user || user.status !== 'active') return null;

    for (const credential of user.applicationPasswords) {
      if (await verifyPassword(credential.passwordHash, candidate)) {
        const lastUsed = credential.lastUsedAt;
        if (!lastUsed || now().getTime() - lastUsed.getTime() > LAST_USED_THROTTLE_MS) {
          await prisma.applicationPassword.update({
            where: { id: credential.id },
            data: {
              lastUsedAt: now(),
              ...(ip ? { lastUsedIp: ip.slice(0, 64) } : {}),
            },
          });
        }
        return { userId: user.id, role: user.role };
      }
    }
    return null;
  }

  return { list, create, revoke, verify };
}
