import { createHmac } from 'node:crypto';
import type { DatabaseClient, Prisma } from '@mernpress/database';
import {
  hashPassword,
  passwordPolicyError,
  verifyDummyPassword,
  verifyPassword,
} from './password.js';
import { generateOpaqueToken, hashCsrfToken, hashSessionToken, verifyCsrfToken } from './tokens.js';
import type {
  AuthConfig,
  AuthService,
  BootstrapInput,
  LoginInput,
  LoginResult,
  PublicUser,
  SessionValidation,
} from './types.js';
import { AuthError } from './types.js';
import { normalizeUsername, usernamePolicyError } from './username.js';

const BOOTSTRAP_LOCK = 'mernpress.auth.bootstrap';
const UNKNOWN_IP = 'unknown';

type AuditData = Prisma.AuditEventUncheckedCreateInput;

export function createAuthService(options: {
  prisma: DatabaseClient;
  config: AuthConfig;
}): AuthService {
  const { prisma, config } = options;
  const now = config.now ?? (() => new Date());
  const sessionTtlMs = config.sessionTtlMinutes * 60_000;
  const sessionIdleMs = config.sessionIdleMinutes * 60_000;
  const rateWindowMs = config.loginRateLimitWindowMinutes * 60_000;

  function keyedHash(domain: 'ip' | 'user', value: string): string {
    return createHmac('sha256', config.hashPepper).update(`${domain}:${value}`).digest('hex');
  }

  function ipHash(ip: string): string {
    return keyedHash('ip', ip || UNKNOWN_IP);
  }

  function identifierHash(username: string): string {
    return keyedHash('user', username);
  }

  function rateKeys(username: string, ip: string): string[] {
    return [ipHash(ip), identifierHash(username)];
  }

  function invalidCredentials(): AuthError {
    return new AuthError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
  }

  function auditData(input: {
    eventType: string;
    actorUserId?: string | null;
    targetUserId?: string | null;
    ipHashValue?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): AuditData {
    return {
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      targetUserId: input.targetUserId ?? null,
      ipHash: input.ipHashValue ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    };
  }

  async function checkRateLimit(keys: string[]): Promise<void> {
    const current = now();
    const cutoff = new Date(current.getTime() - rateWindowMs);

    await prisma.loginAttempt.deleteMany({
      where: { keyHash: { in: keys }, attemptedAt: { lt: cutoff } },
    });

    const counts = await Promise.all(
      keys.map((keyHash) =>
        prisma.loginAttempt.count({
          where: { keyHash, attemptedAt: { gte: cutoff } },
        }),
      ),
    );

    if (counts.some((count) => count >= config.loginRateLimitMax)) {
      const oldest = await prisma.loginAttempt.findFirst({
        where: { keyHash: { in: keys }, attemptedAt: { gte: cutoff } },
        orderBy: { attemptedAt: 'asc' },
        select: { attemptedAt: true },
      });

      const retryAfterSeconds = oldest
        ? Math.max(
            1,
            Math.ceil((oldest.attemptedAt.getTime() + rateWindowMs - current.getTime()) / 1000),
          )
        : Math.ceil(rateWindowMs / 1000);

      throw new AuthError('RATE_LIMITED', 'Too many login attempts. Try again later.', 429, {
        retryAfterSeconds,
      });
    }
  }

  async function recordFailure(keys: string[]): Promise<void> {
    const attemptedAt = now();
    await prisma.loginAttempt.createMany({
      data: keys.map((keyHash) => ({ keyHash, attemptedAt })),
    });
  }

  function toPublicUser(user: {
    id: string;
    username: string;
    role: string;
    status: string;
  }): PublicUser {
    if (user.role !== 'administrator' || (user.status !== 'active' && user.status !== 'disabled')) {
      throw new Error('Unsupported user role or status');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
    };
  }

  async function revokeSession(
    sessionId: string,
    userId: string,
    reason: string,
    createdAt: Date,
  ): Promise<void> {
    const result = await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: createdAt },
    });

    if (result.count === 1) {
      await prisma.auditEvent.create({
        data: auditData({
          eventType: 'auth.session.revoked',
          actorUserId: userId,
          targetUserId: userId,
          metadata: { reason },
        }),
      });
    }
  }

  async function bootstrapAdmin(input: BootstrapInput): Promise<PublicUser> {
    const username = normalizeUsername(input.username);
    const usernameError = usernamePolicyError(username);
    if (usernameError) {
      throw new AuthError('INVALID_USERNAME', usernameError, 400);
    }

    const passwordError = passwordPolicyError(input.password);
    if (passwordError) {
      throw new AuthError('WEAK_PASSWORD', passwordError, 400);
    }

    const passwordHash = await hashPassword(input.password);

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BOOTSTRAP_LOCK}::text))`;

      const adminCount = await tx.user.count({ where: { role: 'administrator' } });
      if (adminCount > 0) {
        throw new AuthError(
          'ADMIN_ALREADY_EXISTS',
          'An administrator already exists; refusing to bootstrap another one.',
          409,
        );
      }

      const existing = await tx.user.findUnique({ where: { username } });
      if (existing) {
        throw new AuthError('USERNAME_TAKEN', 'That username is already in use.', 409);
      }

      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          role: 'administrator',
          status: 'active',
        },
      });

      await tx.auditEvent.create({
        data: auditData({
          eventType: 'auth.bootstrap',
          actorUserId: user.id,
          targetUserId: user.id,
        }),
      });

      return toPublicUser(user);
    });
  }

  async function login(input: LoginInput): Promise<LoginResult> {
    const username = normalizeUsername(input.username);
    const usernameError = usernamePolicyError(username);
    const keys = rateKeys(username, input.ip);

    try {
      await checkRateLimit(keys);
    } catch (error) {
      if (error instanceof AuthError && error.code === 'RATE_LIMITED') {
        await prisma.auditEvent.create({
          data: auditData({
            eventType: 'auth.login.rate_limited',
            ipHashValue: ipHash(input.ip),
            metadata: { identifierHash: identifierHash(username) },
          }),
        });
      }
      throw error;
    }

    if (usernameError) {
      await verifyDummyPassword(input.password);
      await recordFailure(keys);
      await prisma.auditEvent.create({
        data: auditData({
          eventType: 'auth.login.failure',
          ipHashValue: ipHash(input.ip),
          metadata: { reason: 'invalid_username', identifierHash: identifierHash(username) },
        }),
      });
      throw invalidCredentials();
    }

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      await verifyDummyPassword(input.password);
      await recordFailure(keys);
      await prisma.auditEvent.create({
        data: auditData({
          eventType: 'auth.login.failure',
          ipHashValue: ipHash(input.ip),
          metadata: { reason: 'unknown_user', identifierHash: identifierHash(username) },
        }),
      });
      throw invalidCredentials();
    }

    if (user.status !== 'active') {
      await verifyPassword(user.passwordHash, input.password);
      await recordFailure(keys);
      await prisma.auditEvent.create({
        data: auditData({
          eventType: 'auth.login.failure',
          targetUserId: user.id,
          ipHashValue: ipHash(input.ip),
          metadata: { reason: 'disabled_user' },
        }),
      });
      throw invalidCredentials();
    }

    const validPassword = await verifyPassword(user.passwordHash, input.password);
    if (!validPassword) {
      await recordFailure(keys);
      await prisma.auditEvent.create({
        data: auditData({
          eventType: 'auth.login.failure',
          targetUserId: user.id,
          ipHashValue: ipHash(input.ip),
          metadata: { reason: 'invalid_password' },
        }),
      });
      throw invalidCredentials();
    }

    const sessionToken = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + sessionTtlMs);

    await prisma.$transaction(async (tx) => {
      await tx.loginAttempt.deleteMany({ where: { keyHash: { in: keys } } });
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hashSessionToken(sessionToken),
          csrfHash: hashCsrfToken(csrfToken),
          createdAt,
          lastUsedAt: createdAt,
          expiresAt,
        },
      });
      await tx.auditEvent.create({
        data: auditData({
          eventType: 'auth.login.success',
          actorUserId: user.id,
          targetUserId: user.id,
          ipHashValue: ipHash(input.ip),
          metadata: { role: user.role },
        }),
      });
    });

    return {
      user: toPublicUser(user),
      sessionToken,
      csrfToken,
      expiresAt,
    };
  }

  async function validateSession(sessionToken: string): Promise<SessionValidation | null> {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(sessionToken) },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    const current = now();
    const idleDeadline = new Date(session.lastUsedAt.getTime() + sessionIdleMs);

    if (session.revokedAt !== null) {
      return null;
    }

    if (session.expiresAt.getTime() <= current.getTime()) {
      await revokeSession(session.id, session.userId, 'expired', current);
      return null;
    }

    if (idleDeadline.getTime() <= current.getTime()) {
      await revokeSession(session.id, session.userId, 'idle_timeout', current);
      return null;
    }

    if (session.user.status !== 'active') {
      await revokeSession(session.id, session.userId, 'user_disabled', current);
      return null;
    }

    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: current },
    });

    return {
      user: toPublicUser(session.user),
      sessionId: session.id,
      csrfHash: session.csrfHash,
      expiresAt: session.expiresAt,
    };
  }

  async function logout(sessionToken: string): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(sessionToken) },
      select: { id: true, userId: true, revokedAt: true },
    });

    if (!session || session.revokedAt !== null) {
      return;
    }

    const current = now();
    const result = await prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: current },
    });

    if (result.count === 1) {
      await prisma.auditEvent.create({
        data: auditData({
          eventType: 'auth.logout',
          actorUserId: session.userId,
          targetUserId: session.userId,
        }),
      });
    }
  }

  return {
    bootstrapAdmin,
    login,
    validateSession,
    logout,
  };
}

export { verifyCsrfToken };
