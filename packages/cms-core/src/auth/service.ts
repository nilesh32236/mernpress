import type { DatabaseClient } from '@mernpress/database';
import { createAuthAudit, type LoginFailureReason } from './audit.js';
import { createIdentifierHasher } from './identifiers.js';
import {
  hashPassword,
  passwordPolicyError,
  verifyDummyPassword,
  verifyPassword,
} from './password.js';
import { createLoginRateLimiter } from './rate-limit.js';
import { generateOpaqueToken, hashCsrfToken, hashSessionToken } from './tokens.js';
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

/**
 * Authentication use cases: first-admin bootstrap, login, session validation
 * and logout.
 *
 * This factory only orchestrates. Password hashing, token formats, identifier
 * hashing, audit writes and login-attempt persistence live in their own
 * modules, so each can change (or be tested) without rewriting the use case.
 * The service depends only on the database port and explicit configuration; it
 * imports no Fastify, cookie or HTTP types.
 */
export function createAuthService(options: {
  prisma: DatabaseClient;
  config: AuthConfig;
}): AuthService {
  const { prisma, config } = options;
  const now = config.now ?? (() => new Date());
  const sessionTtlMs = config.sessionTtlMinutes * 60_000;
  const sessionIdleMs = config.sessionIdleMinutes * 60_000;

  const hasher = createIdentifierHasher(config.hashPepper);
  const audit = createAuthAudit(prisma, hasher);
  const rateLimiter = createLoginRateLimiter({
    prisma,
    hasher,
    now,
    config: {
      max: config.loginRateLimitMax,
      windowMinutes: config.loginRateLimitWindowMinutes,
    },
  });

  function invalidCredentials(): AuthError {
    return new AuthError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
  }

  function rateLimited(retryAfterSeconds: number): AuthError {
    return new AuthError('RATE_LIMITED', 'Too many login attempts. Try again later.', 429, {
      retryAfterSeconds,
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
    revokedAt: Date,
  ): Promise<void> {
    const result = await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt },
    });

    if (result.count === 1) {
      await audit.sessionRevoked({ userId, reason });
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

      await audit.bootstrap({ userId: user.id }, tx);

      return toPublicUser(user);
    });
  }

  async function login(input: LoginInput): Promise<LoginResult> {
    const username = normalizeUsername(input.username);
    const usernameError = usernamePolicyError(username);
    const keys = rateLimiter.keysFor(username, input.ip);
    const identifierHash = hasher.username(username);

    const decision = await rateLimiter.check(keys);
    if (!decision.allowed) {
      throw rateLimited(decision.retryAfterSeconds);
    }

    /**
     * Shared failure path: every generic failure records exactly one attempt,
     * one per-attempt audit event, and at most one coalesced threshold event.
     */
    async function fail(
      reason: LoginFailureReason,
      options: { userId?: string } = {},
    ): Promise<never> {
      const { thresholdReached } = await rateLimiter.record(keys);
      await audit.loginFailure({
        ip: input.ip,
        reason,
        identifierHash,
        ...(options.userId === undefined ? {} : { userId: options.userId }),
      });
      if (thresholdReached) {
        await audit.rateLimitThreshold({ ip: input.ip, identifierHash });
      }

      throw invalidCredentials();
    }

    if (usernameError) {
      await verifyDummyPassword(input.password);
      return fail('invalid_username');
    }

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      await verifyDummyPassword(input.password);
      return fail('unknown_user');
    }

    if (user.status !== 'active') {
      await verifyPassword(user.passwordHash, input.password);
      return fail('disabled_user', { userId: user.id });
    }

    const validPassword = await verifyPassword(user.passwordHash, input.password);
    if (!validPassword) {
      return fail('invalid_password', { userId: user.id });
    }

    const sessionToken = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + sessionTtlMs);

    await prisma.$transaction(async (tx) => {
      await rateLimiter.clear(keys, tx);
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
      await audit.loginSuccess({ userId: user.id, role: user.role, ip: input.ip }, tx);
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

    const result = await prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now() },
    });

    if (result.count === 1) {
      await audit.logout({ userId: session.userId });
    }
  }

  return {
    bootstrapAdmin,
    login,
    validateSession,
    logout,
  };
}
