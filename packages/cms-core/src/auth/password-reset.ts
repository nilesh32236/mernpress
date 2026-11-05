import type { DatabaseClient } from '@mernpress/database';
import type { MailService } from '../mail/service.js';
import { createAuthAudit } from './audit.js';
import { createIdentifierHasher } from './identifiers.js';
import { hashPassword, passwordPolicyError } from './password.js';
import { createLoginRateLimiter } from './rate-limit.js';
import { generateOpaqueToken, hashSessionToken } from './tokens.js';
import { AuthError } from './types.js';
import { normalizeUsername } from './username.js';

/**
 * WordPress-compatible lost-password flow.
 *
 * A request always answers generically so the endpoint cannot be used to
 * enumerate accounts. Tokens are 256-bit, stored only as SHA-256 hashes, valid
 * for 24 hours, single-use, and replaced when a newer request arrives. Request
 * and reset attempts are rate-limited through the existing database-backed
 * limiter using separate hash namespaces.
 */
export interface PasswordResetConfig {
  hashPepper: string;
  /** Token lifetime in minutes (WordPress default: 24 hours). */
  tokenTtlMinutes?: number;
  /** Lost-password requests allowed per identifier inside the window. */
  requestMax?: number;
  /** Lost-password requests allowed per IP inside the window (shared NAT). */
  requestMaxPerIp?: number;
  requestWindowMinutes?: number;
  /** Failed reset submissions allowed per IP inside the window. */
  attemptMax?: number;
  attemptWindowMinutes?: number;
  now?: () => Date;
}

export interface PasswordResetServiceOptions {
  prisma: DatabaseClient;
  config: PasswordResetConfig;
  mail?: MailService | undefined;
}

export interface PasswordResetService {
  /** Token lifetime in minutes (used in notification copy). */
  readonly tokenTtlMinutes: number;
  /** Create a single-use token (used by the lost-password request and welcome e-mail). */
  createToken(userId: string): Promise<string | null>;
  request(input: { identifier: string; ip: string }): Promise<void>;
  reset(input: { token: string; login: string; password: string; ip: string }): Promise<void>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createPasswordResetService({
  prisma,
  config,
  mail,
}: PasswordResetServiceOptions): PasswordResetService {
  const now = config.now ?? (() => new Date());
  const tokenTtlMinutes = config.tokenTtlMinutes ?? 24 * 60;
  const hasher = createIdentifierHasher(config.hashPepper);
  const audit = createAuthAudit(prisma, hasher);

  const requestLimiter = createLoginRateLimiter({
    prisma,
    hasher,
    now,
    config: {
      max: config.requestMax ?? 3,
      windowMinutes: config.requestWindowMinutes ?? 15,
    },
  });
  const requestIpLimiter = createLoginRateLimiter({
    prisma,
    hasher,
    now,
    config: {
      max: config.requestMaxPerIp ?? 10,
      windowMinutes: config.requestWindowMinutes ?? 15,
    },
  });
  const attemptLimiter = createLoginRateLimiter({
    prisma,
    hasher,
    now,
    config: {
      max: config.attemptMax ?? 10,
      windowMinutes: config.attemptWindowMinutes ?? 15,
    },
  });

  function invalidKey(): AuthError {
    return new AuthError(
      'INVALID_RESET_KEY',
      'This password reset link is invalid or has expired.',
      400,
    );
  }

  function identifierKey(identifier: string): string[] {
    return [hasher.scope('password-reset-request-user', identifier)];
  }

  function ipKey(ip: string): string[] {
    return [hasher.scope('password-reset-request-ip', ip)];
  }

  async function createToken(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, status: true },
    });
    if (!user || user.status !== 'active' || !user.email) {
      return null;
    }
    const token = generateOpaqueToken();
    const createdAt = now();
    await prisma.$transaction([
      // WordPress keeps one reset key per user: a new request replaces it.
      prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashSessionToken(token),
          createdAt,
          expiresAt: new Date(createdAt.getTime() + tokenTtlMinutes * 60_000),
        },
      }),
    ]);
    return token;
  }

  async function request(input: { identifier: string; ip: string }): Promise<void> {
    if (!mail || !mail.status().configured) {
      throw new AuthError(
        'MAIL_NOT_CONFIGURED',
        'Password reset email cannot be sent because email delivery is not configured.',
        503,
      );
    }

    const raw = input.identifier.trim();
    const emailMode = raw.includes('@');
    const identifier = emailMode ? raw.toLowerCase() : normalizeUsername(raw);
    const keys = identifierKey(identifier);
    const ipKeys = ipKey(input.ip);
    const [decision, ipDecision] = await Promise.all([
      requestLimiter.check(keys),
      requestIpLimiter.check(ipKeys),
    ]);
    if (!decision.allowed || !ipDecision.allowed) {
      const retryAfterSeconds = !decision.allowed
        ? decision.retryAfterSeconds
        : !ipDecision.allowed
          ? ipDecision.retryAfterSeconds
          : 1;
      throw new AuthError('RATE_LIMITED', 'Too many reset requests. Try again later.', 429, {
        retryAfterSeconds,
      });
    }

    // Invalid shapes still consume the window but never touch the database.
    const validShape = emailMode ? EMAIL_PATTERN.test(identifier) : identifier.length > 0;
    await Promise.all([requestLimiter.record(keys), requestIpLimiter.record(ipKeys)]);
    if (!validShape) return;

    const user = await prisma.user.findFirst({
      where: emailMode ? { email: identifier } : { username: identifier },
      select: { id: true, username: true, email: true, status: true },
    });
    if (!user || user.status !== 'active' || !user.email) return;

    const token = await createToken(user.id);
    if (!token) return;
    await audit.passwordResetRequested({ userId: user.id, ip: input.ip });
    // Delivery failures are logged by the mail service; the response stays
    // generic so account existence is not revealed.
    await mail.notifyPasswordReset({
      to: user.email,
      username: user.username,
      token,
      expiresInMinutes: tokenTtlMinutes,
    });
  }

  async function reset(input: {
    token: string;
    login: string;
    password: string;
    ip: string;
  }): Promise<void> {
    const attemptKeys = [hasher.scope('password-reset-attempt-ip', input.ip)];
    const decision = await attemptLimiter.check(attemptKeys);
    if (!decision.allowed) {
      throw new AuthError('RATE_LIMITED', 'Too many reset attempts. Try again later.', 429, {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }

    const policyError = passwordPolicyError(input.password);
    if (policyError) {
      throw new AuthError('WEAK_PASSWORD', policyError, 400);
    }

    const tokenHash = hashSessionToken(input.token.trim());
    const row = await prisma.passwordReset.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, username: true, status: true } } },
    });
    const current = now();
    const login = normalizeUsername(input.login.trim());
    const valid =
      row !== null &&
      row.usedAt === null &&
      row.expiresAt.getTime() > current.getTime() &&
      row.user.status === 'active' &&
      row.user.username === login;

    if (!valid) {
      await attemptLimiter.record(attemptKeys);
      throw invalidKey();
    }

    const passwordHash = await hashPassword(input.password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      });
      // WordPress invalidates every session after a password reset.
      await tx.session.deleteMany({ where: { userId: row.userId } });
      await tx.passwordReset.update({
        where: { id: row.id },
        data: { usedAt: current },
      });
      await tx.passwordReset.deleteMany({
        where: { userId: row.userId, id: { not: row.id }, usedAt: null },
      });
      await audit.passwordResetCompleted({ userId: row.userId, ip: input.ip });
      await tx.loginAttempt.deleteMany({
        where: { keyHash: { in: attemptKeys } },
      });
    });
  }

  return { tokenTtlMinutes, createToken, request, reset };
}
