import type { DatabaseClient, Prisma } from '@mernpress/database';
import type { IdentifierHasher } from './identifiers.js';

type AuditClient = Pick<DatabaseClient, 'auditEvent'>;

export type LoginFailureReason =
  'invalid_username' | 'unknown_user' | 'disabled_user' | 'invalid_password';

/**
 * The only writer for authentication audit events.
 *
 * All methods take already-normalized values plus HMAC identifiers from
 * {@link IdentifierHasher}; raw usernames, IPs, passwords, cookies, CSRF tokens
 * and session tokens must never be passed in. Metadata is intentionally limited
 * to a reason and an identifier hash, which keeps audit rows safe to retain and
 * safe to show to an operator.
 *
 * A client (`tx`) can be supplied so bootstrap and login-success events commit
 * atomically with the user/session write they describe.
 */
export interface AuthAudit {
  bootstrap(input: { userId: string }, client?: AuditClient): Promise<void>;
  manualTestAccountCreated(
    input: { userId: string; role: string },
    client?: AuditClient,
  ): Promise<void>;
  loginSuccess(
    input: { userId: string; role: string; ip: string },
    client?: AuditClient,
  ): Promise<void>;
  loginFailure(input: {
    ip: string;
    reason: LoginFailureReason;
    identifierHash: string;
    userId?: string;
  }): Promise<void>;
  rateLimitThreshold(input: { ip: string; identifierHash: string }): Promise<void>;
  logout(input: { userId: string }): Promise<void>;
  sessionRevoked(input: { userId: string; reason: string }): Promise<void>;
  passwordResetRequested(input: { userId: string; ip: string }): Promise<void>;
  passwordResetCompleted(input: { userId: string; ip: string }): Promise<void>;
  twoFactorChanged(input: {
    userId: string;
    action: 'enabled' | 'disabled' | 'reset' | 'recovery_used';
  }): Promise<void>;
}

export function createAuthAudit(prisma: DatabaseClient, hasher: IdentifierHasher): AuthAudit {
  return {
    async bootstrap(input, client = prisma) {
      await client.auditEvent.create({
        data: {
          eventType: 'auth.bootstrap',
          actorUserId: input.userId,
          targetUserId: input.userId,
        },
      });
    },

    async manualTestAccountCreated(input, client = prisma) {
      await client.auditEvent.create({
        data: {
          eventType: 'auth.manual_test_account.created',
          actorUserId: input.userId,
          targetUserId: input.userId,
          metadata: { role: input.role },
        },
      });
    },

    async loginSuccess(input, client = prisma) {
      await client.auditEvent.create({
        data: {
          eventType: 'auth.login.success',
          actorUserId: input.userId,
          targetUserId: input.userId,
          ipHash: hasher.ip(input.ip),
          metadata: { role: input.role },
        },
      });
    },

    async loginFailure(input) {
      await prisma.auditEvent.create({
        data: {
          eventType: 'auth.login.failure',
          targetUserId: input.userId ?? null,
          ipHash: hasher.ip(input.ip),
          metadata: {
            reason: input.reason,
            identifierHash: input.identifierHash,
          } satisfies Prisma.InputJsonObject,
        },
      });
    },

    async rateLimitThreshold(input) {
      await prisma.auditEvent.create({
        data: {
          eventType: 'auth.login.rate_limited',
          ipHash: hasher.ip(input.ip),
          metadata: {
            reason: 'threshold_reached',
            identifierHash: input.identifierHash,
          } satisfies Prisma.InputJsonObject,
        },
      });
    },

    async logout(input) {
      await prisma.auditEvent.create({
        data: {
          eventType: 'auth.logout',
          actorUserId: input.userId,
          targetUserId: input.userId,
        },
      });
    },

    async sessionRevoked(input) {
      await prisma.auditEvent.create({
        data: {
          eventType: 'auth.session.revoked',
          actorUserId: input.userId,
          targetUserId: input.userId,
          metadata: { reason: input.reason },
        },
      });
    },

    async passwordResetRequested(input) {
      await prisma.auditEvent.create({
        data: {
          eventType: 'auth.password_reset.requested',
          actorUserId: input.userId,
          targetUserId: input.userId,
          ipHash: hasher.ip(input.ip),
          metadata: { source: 'self-service' },
        },
      });
    },

    async twoFactorChanged(input) {
      await prisma.auditEvent.create({
        data: {
          eventType: `auth.two_factor.${input.action}`,
          actorUserId: input.userId,
          targetUserId: input.userId,
          metadata: { action: input.action },
        },
      });
    },

    async passwordResetCompleted(input) {
      await prisma.auditEvent.create({
        data: {
          eventType: 'auth.password_reset.completed',
          actorUserId: input.userId,
          targetUserId: input.userId,
          ipHash: hasher.ip(input.ip),
          metadata: { source: 'self-service' },
        },
      });
    },
  };
}
