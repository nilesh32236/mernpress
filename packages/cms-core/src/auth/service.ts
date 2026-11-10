import { DEFAULT_ADMIN_COLOR_SCHEME, isAdminColorScheme } from '@mernpress/contracts';
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
  TwoFactorLoginChallenge,
  ManualTestAccountInput,
  PublicUser,
  SessionValidation,
} from './types.js';
import { AuthError } from './types.js';
import type { TwoFactorService } from './two-factor.js';
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
  twoFactor?: TwoFactorService;
}): AuthService {
  const { prisma, config, twoFactor } = options;
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

  const VALID_ROLES = new Set(['administrator', 'editor', 'author', 'contributor', 'subscriber']);
  const MANUAL_TEST_ROLES = new Set(['editor', 'author', 'contributor', 'subscriber']);

  function toPublicUser(user: {
    id: string;
    username: string;
    role: string;
    status: string;
    adminColor: string;
  }): PublicUser {
    // Fail closed on an unknown role/status rather than silently authorizing.
    if (!VALID_ROLES.has(user.role) || (user.status !== 'active' && user.status !== 'disabled')) {
      throw new Error('Unsupported user role or status');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role as PublicUser['role'],
      status: user.status,
      adminColor: isAdminColorScheme(user.adminColor)
        ? user.adminColor
        : DEFAULT_ADMIN_COLOR_SCHEME,
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

  /**
   * Create a development-only manual-test account (ADR 0004 / P2-04 manual
   * acceptance aid). NOT user administration (P2-05): it is a narrow bootstrap
   * for local role-matrix testing. Administrator is never creatable here; the
   * first admin stays bootstrap-only. Never overwrites or changes an existing
   * account — a username collision is a 409.
   */
  async function createManualTestAccount(input: ManualTestAccountInput): Promise<PublicUser> {
    if (!MANUAL_TEST_ROLES.has(input.role)) {
      throw new AuthError(
        'INVALID_ROLE',
        `Role must be one of: ${[...MANUAL_TEST_ROLES].join(', ')}.`,
        400,
      );
    }

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
      const existing = await tx.user.findUnique({ where: { username } });
      if (existing) {
        // Never overwrite, re-role, reset the password of, or deactivate an
        // existing account. Stop with a clear conflict.
        throw new AuthError(
          'USERNAME_TAKEN',
          `An account named "${username}" already exists; refusing to overwrite it.`,
          409,
        );
      }

      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          role: input.role,
          status: 'active',
        },
      });

      await audit.manualTestAccountCreated({ userId: user.id, role: input.role }, tx);

      return toPublicUser(user);
    });
  }

  async function issueSession(
    user: {
      id: string;
      username: string;
      role: string;
      status: string;
      adminColor: string;
    },
    remember: boolean,
    ip: string,
  ): Promise<LoginResult> {
    const sessionToken = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const createdAt = now();
    // WordPress "Remember Me" keeps the session for 14 days; the default TTL
    // stays the server-configured window.
    const ttlMs = remember ? Math.max(sessionTtlMs, 14 * 24 * 60 * 60 * 1000) : sessionTtlMs;
    const expiresAt = new Date(createdAt.getTime() + ttlMs);
    const keys = rateLimiter.keysFor(user.username, ip);

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
      await audit.loginSuccess({ userId: user.id, role: user.role, ip }, tx);
    });

    return {
      user: toPublicUser(user),
      sessionToken,
      csrfToken,
      expiresAt,
    };
  }

  async function login(input: LoginInput): Promise<LoginResult | TwoFactorLoginChallenge> {
    const rawIdentifier = input.username.trim();
    const emailMode = rawIdentifier.includes('@');
    const username = emailMode ? rawIdentifier.toLowerCase() : normalizeUsername(rawIdentifier);
    const usernameError = emailMode
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)
        ? null
        : 'Enter a valid email address.'
      : usernamePolicyError(username);
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

    const user = await prisma.user.findFirst({
      where: emailMode ? { email: username } : { username },
    });

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

    if (twoFactor && (await twoFactor.isEnabled(user.id))) {
      const challenge = await twoFactor.beginChallenge({
        userId: user.id,
        remember: input.remember === true,
        ip: input.ip,
      });
      return {
        twoFactorRequired: true,
        challengeToken: challenge.token,
        username: user.username,
        expiresAt: challenge.expiresAt,
      };
    }

    return issueSession(user, input.remember === true, input.ip);
  }

  async function completeTwoFactor(input: {
    challengeToken: string;
    code: string;
    ip: string;
  }): Promise<LoginResult> {
    if (!twoFactor) {
      throw new AuthError(
        'INVALID_TWO_FACTOR_CHALLENGE',
        'Two-factor authentication is not available.',
        400,
      );
    }
    let result: Awaited<ReturnType<typeof twoFactor.consumeChallenge>>;
    try {
      result = await twoFactor.consumeChallenge({
        token: input.challengeToken,
        code: input.code,
        ip: input.ip,
      });
    } catch (error) {
      // A wrong 2FA code must cost the same login budget as a wrong password;
      // otherwise a correct password mints unlimited fresh challenges and the
      // per-challenge attempt cap is meaningless. The username is charged
      // through the same limiter the login form uses, so the account locks
      // after the configured number of failures per window.
      if (error instanceof AuthError && error.code === 'INVALID_TWO_FACTOR_CODE') {
        const challenge = await prisma.twoFactorChallenge.findUnique({
          where: { tokenHash: hashSessionToken(input.challengeToken.trim()) },
          include: { user: { select: { username: true } } },
        });
        if (challenge) {
          await rateLimiter.record(rateLimiter.keysFor(challenge.user.username, input.ip));
        }
      }
      throw error;
    }
    const user = await prisma.user.findUnique({ where: { id: result.userId } });
    if (!user || user.status !== 'active') {
      throw invalidCredentials();
    }
    return issueSession(user, result.remember, input.ip);
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
    createManualTestAccount,
    login,
    completeTwoFactor,
    validateSession,
    logout,
  };
}
