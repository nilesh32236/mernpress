import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
} from 'node:crypto';
import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from './capabilities.js';
import type { Principal } from '../content/types.js';
import { createAuthAudit } from './audit.js';
import { createIdentifierHasher } from './identifiers.js';
import { verifyPassword } from './password.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp.js';
import { hashSessionToken } from './tokens.js';
import { AuthError } from './types.js';

/**
 * Two-factor authentication (TOTP + one-time recovery codes).
 *
 * The TOTP secret is sealed with AES-256-GCM using a key derived from
 * AUTH_HASH_PEPPER; recovery codes are stored as HMAC-SHA256 hashes. Login
 * challenges are single-use, 10-minute, hashed tokens with a five-attempt cap.
 */
export interface TwoFactorStatus {
  enabled: boolean;
  confirmedAt: string | null;
  recoveryCodesRemaining: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

export interface TwoFactorChallenge {
  token: string;
  expiresAt: Date;
}

export interface TwoFactorChallengeResult {
  userId: string;
  remember: boolean;
  usedRecoveryCode: boolean;
}

export interface TwoFactorService {
  status(principal: Principal): Promise<TwoFactorStatus>;
  beginSetup(principal: Principal): Promise<TwoFactorSetup>;
  confirmSetup(principal: Principal, code: string): Promise<TwoFactorStatus>;
  disable(principal: Principal, password: string, code: string): Promise<TwoFactorStatus>;
  regenerateRecoveryCodes(
    principal: Principal,
    password: string,
  ): Promise<{ recoveryCodes: string[] }>;
  isEnabled(userId: string): Promise<boolean>;
  beginChallenge(input: {
    userId: string;
    remember: boolean;
    ip: string;
  }): Promise<TwoFactorChallenge>;
  consumeChallenge(input: {
    token: string;
    code: string;
    ip: string;
  }): Promise<TwoFactorChallengeResult>;
  resetForUser(principal: Principal, userId: string): Promise<TwoFactorStatus>;
}

export interface TwoFactorServiceOptions {
  prisma: DatabaseClient;
  pepper: string;
  now?: () => Date;
  issuer?: string;
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 8;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function encryptionKey(pepper: string): Buffer {
  return createHash('sha256').update(`mernpress:totp:${pepper}`).digest();
}

function sealSecret(pepper: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(pepper), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
}

function openSecret(pepper: string, sealed: string): string {
  const [ivPart, tagPart, dataPart] = sealed.split('.');
  if (!ivPart || !tagPart || !dataPart) throw new Error('Invalid sealed secret');
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
}

function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashRecoveryCode(pepper: string, value: string): string {
  return createHmac('sha256', pepper)
    .update(`recovery:${normalizeRecoveryCode(value)}`)
    .digest('hex');
}

function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let index = 0; index < RECOVERY_CODE_COUNT; index += 1) {
    let code = '';
    for (let character = 0; character < 8; character += 1) {
      code += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    }
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

export function createTwoFactorService({
  prisma,
  pepper,
  now = () => new Date(),
  issuer = 'MERNPress',
}: TwoFactorServiceOptions): TwoFactorService {
  const hasher = createIdentifierHasher(pepper);
  const audit = createAuthAudit(prisma, hasher);

  function invalidCode(): AuthError {
    return new AuthError('INVALID_TWO_FACTOR_CODE', 'That authentication code is not valid.', 401);
  }

  async function status(principal: Principal): Promise<TwoFactorStatus> {
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { twoFactorEnabled: true, twoFactorConfirmedAt: true },
    });
    if (!user) throw new AuthError('UNAUTHENTICATED', 'Not authenticated', 401);
    const remaining = await prisma.twoFactorRecoveryCode.count({
      where: { userId: principal.userId, usedAt: null },
    });
    return {
      enabled: user.twoFactorEnabled,
      confirmedAt: user.twoFactorConfirmedAt?.toISOString() ?? null,
      recoveryCodesRemaining: remaining,
    };
  }

  async function beginSetup(principal: Principal): Promise<TwoFactorSetup> {
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { id: true, username: true, twoFactorEnabled: true },
    });
    if (!user) throw new AuthError('UNAUTHENTICATED', 'Not authenticated', 401);
    if (user.twoFactorEnabled) {
      throw new AuthError(
        'TWO_FACTOR_ALREADY_ENABLED',
        'Two-factor authentication is already enabled.',
        409,
      );
    }
    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes();
    await prisma.$transaction([
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: user.id,
          codeHash: hashRecoveryCode(pepper, code),
        })),
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorSecret: sealSecret(pepper, secret),
          twoFactorEnabled: false,
          twoFactorConfirmedAt: null,
          twoFactorLastCounter: null,
        },
      }),
    ]);
    return {
      secret,
      otpauthUrl: otpauthUrl({ secret, account: user.username, issuer }),
      recoveryCodes,
    };
  }

  async function verifyUserCode(
    userId: string,
    code: string,
  ): Promise<{ usedRecoveryCode: boolean }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorLastCounter: true,
      },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new AuthError(
        'TWO_FACTOR_NOT_ENABLED',
        'Two-factor authentication is not enabled.',
        400,
      );
    }
    const current = now();
    const secret = openSecret(pepper, user.twoFactorSecret);
    const result = verifyTotp(secret, code, { timestampMs: current.getTime() });
    if (result.valid) {
      if (user.twoFactorLastCounter !== null && result.counter <= user.twoFactorLastCounter) {
        throw invalidCode();
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorLastCounter: result.counter },
      });
      return { usedRecoveryCode: false };
    }

    const codeHash = hashRecoveryCode(pepper, code);
    const recovery = await prisma.twoFactorRecoveryCode.findUnique({ where: { codeHash } });
    if (!recovery || recovery.userId !== user.id || recovery.usedAt !== null) {
      throw invalidCode();
    }
    const updated = await prisma.twoFactorRecoveryCode.updateMany({
      where: { id: recovery.id, usedAt: null },
      data: { usedAt: current },
    });
    if (updated.count === 0) throw invalidCode();
    return { usedRecoveryCode: true };
  }

  async function confirmSetup(principal: Principal, code: string): Promise<TwoFactorStatus> {
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { id: true, twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user || !user.twoFactorSecret) {
      throw new AuthError('TWO_FACTOR_NOT_ENABLED', 'Start setup first.', 400);
    }
    if (user.twoFactorEnabled) {
      throw new AuthError(
        'TWO_FACTOR_ALREADY_ENABLED',
        'Two-factor authentication is already enabled.',
        409,
      );
    }
    const result = verifyTotp(openSecret(pepper, user.twoFactorSecret), code, {
      timestampMs: now().getTime(),
    });
    if (!result.valid) throw invalidCode();
    const confirmedAt = now();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorConfirmedAt: confirmedAt,
        twoFactorLastCounter: result.counter,
      },
    });
    await audit.twoFactorChanged({ userId: user.id, action: 'enabled' });
    return status(principal);
  }

  async function disable(
    principal: Principal,
    password: string,
    code: string,
  ): Promise<TwoFactorStatus> {
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { id: true, passwordHash: true, twoFactorEnabled: true },
    });
    if (!user || !user.twoFactorEnabled) {
      throw new AuthError(
        'TWO_FACTOR_NOT_ENABLED',
        'Two-factor authentication is not enabled.',
        400,
      );
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new AuthError('INVALID_PASSWORD', 'Your password is not correct.', 403);
    }
    await verifyUserCode(user.id, code);
    await prisma.$transaction([
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.twoFactorChallenge.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorSecret: null,
          twoFactorEnabled: false,
          twoFactorConfirmedAt: null,
          twoFactorLastCounter: null,
        },
      }),
    ]);
    await audit.twoFactorChanged({ userId: user.id, action: 'disabled' });
    return status(principal);
  }

  async function regenerateRecoveryCodes(
    principal: Principal,
    password: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { id: true, passwordHash: true, twoFactorEnabled: true },
    });
    if (!user || !user.twoFactorEnabled) {
      throw new AuthError(
        'TWO_FACTOR_NOT_ENABLED',
        'Two-factor authentication is not enabled.',
        400,
      );
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new AuthError('INVALID_PASSWORD', 'Your password is not correct.', 403);
    }
    const recoveryCodes = generateRecoveryCodes();
    await prisma.$transaction([
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: user.id,
          codeHash: hashRecoveryCode(pepper, code),
        })),
      }),
    ]);
    return { recoveryCodes };
  }

  async function isEnabled(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    return user?.twoFactorEnabled === true;
  }

  async function beginChallenge(input: {
    userId: string;
    remember: boolean;
    ip: string;
  }): Promise<TwoFactorChallenge> {
    if (!(await isEnabled(input.userId))) {
      throw new AuthError('TWO_FACTOR_NOT_ENABLED', 'Two-factor is not enabled.', 400);
    }
    const token = randomBytes(32).toString('base64url');
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + CHALLENGE_TTL_MS);
    // Drop expired challenges for this user so the table cannot grow forever.
    await prisma.twoFactorChallenge.deleteMany({
      where: { userId: input.userId, expiresAt: { lt: createdAt } },
    });
    await prisma.twoFactorChallenge.create({
      data: {
        userId: input.userId,
        tokenHash: hashSessionToken(token),
        remember: input.remember,
        createdAt,
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  async function consumeChallenge(input: {
    token: string;
    code: string;
    ip: string;
  }): Promise<TwoFactorChallengeResult> {
    const tokenHash = hashSessionToken(input.token.trim());
    const challenge = await prisma.twoFactorChallenge.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, username: true, status: true } } },
    });
    const current = now();
    const valid =
      challenge !== null &&
      challenge.usedAt === null &&
      challenge.expiresAt.getTime() > current.getTime() &&
      challenge.attempts < MAX_ATTEMPTS &&
      challenge.user.status === 'active';
    if (!valid) {
      throw new AuthError(
        'INVALID_TWO_FACTOR_CHALLENGE',
        'This login challenge has expired. Sign in again.',
        401,
      );
    }
    try {
      const result = await verifyUserCode(challenge.userId, input.code);
      await prisma.twoFactorChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: current },
      });
      if (result.usedRecoveryCode) {
        await audit.twoFactorChanged({ userId: challenge.userId, action: 'recovery_used' });
      }
      return {
        userId: challenge.userId,
        remember: challenge.remember,
        usedRecoveryCode: result.usedRecoveryCode,
      };
    } catch (error) {
      const attempts = challenge.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await prisma.twoFactorChallenge
          .delete({ where: { id: challenge.id } })
          .catch(() => undefined);
      } else {
        await prisma.twoFactorChallenge.update({
          where: { id: challenge.id },
          data: { attempts },
        });
      }
      throw error;
    }
  }

  async function resetForUser(principal: Principal, userId: string): Promise<TwoFactorStatus> {
    requireCapability(principal, 'user.manage');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, twoFactorEnabled: true },
    });
    if (!user) throw new AuthError('USER_NOT_FOUND', 'User not found.', 404);
    await prisma.$transaction([
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      prisma.twoFactorChallenge.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorSecret: null,
          twoFactorEnabled: false,
          twoFactorConfirmedAt: null,
          twoFactorLastCounter: null,
        },
      }),
    ]);
    if (user.twoFactorEnabled) {
      await audit.twoFactorChanged({ userId, action: 'reset' });
    }
    const remaining = 0;
    return { enabled: false, confirmedAt: null, recoveryCodesRemaining: remaining };
  }

  return {
    status,
    beginSetup,
    confirmSetup,
    disable,
    regenerateRecoveryCodes,
    isEnabled,
    beginChallenge,
    consumeChallenge,
    resetForUser,
  };
}
