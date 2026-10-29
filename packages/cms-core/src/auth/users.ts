import type { DatabaseClient, Prisma, UserRole, UserStatus } from '@mernpress/database';
import { requireCapability } from './capabilities.js';
import { hashPassword, passwordPolicyError, verifyPassword } from './password.js';
import { normalizeUsername, usernamePolicyError } from './username.js';
import type { Paged, Principal } from '../content/types.js';

/**
 * User-administration domain errors. Like `ContentError`, they carry a stable
 * `code` plus an HTTP status for the route's shared error envelope; services
 * never build HTTP responses themselves.
 */
export type UserAdminErrorCode =
  | 'FORBIDDEN'
  | 'USER_NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'INVALID_USERNAME'
  | 'INVALID_ROLE'
  | 'INVALID_STATUS'
  | 'WEAK_PASSWORD'
  | 'INVALID_PASSWORD'
  | 'LAST_ADMIN'
  | 'SELF_ROLE_CHANGE'
  | 'SELF_STATUS_CHANGE'
  | 'SELF_DELETE'
  | 'REASSIGN_REQUIRED'
  | 'REASSIGN_INVALID';

export class UserAdminError extends Error {
  readonly code: UserAdminErrorCode;
  readonly statusCode: number;

  constructor(code: UserAdminErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'UserAdminError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Safe administrator-facing user record. Never includes `passwordHash`. */
export interface AdminUser {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  /** ISO-8601 UTC instant. */
  createdAt: string;
  /** Number of posts/pages currently authored by this user. */
  postCount: number;
}

/** Self-service profile record. Never includes `passwordHash` or status. */
export interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  /** ISO-8601 UTC instant. */
  createdAt: string;
}

export interface UserListQuery {
  search?: string | undefined;
  page: number;
  perPage: number;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: UserRole;
}

export interface UpdateProfileInput {
  username?: string | undefined;
}

export interface ChangeOwnPasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface DeleteUserOptions {
  /** Required when the user still authors posts/pages (WordPress-style reassignment). */
  reassignToUserId?: string | undefined;
}

export interface DeleteUserResult {
  deletedUserId: string;
  reassignedPostCount: number;
}

export interface UserAdminService {
  listUsers(principal: Principal, query: UserListQuery): Promise<Paged<AdminUser>>;
  createUser(principal: Principal, input: CreateUserInput): Promise<AdminUser>;
  updateUserRole(principal: Principal, userId: string, role: UserRole): Promise<AdminUser>;
  setUserStatus(principal: Principal, userId: string, status: UserStatus): Promise<AdminUser>;
  resetUserPassword(principal: Principal, userId: string, newPassword: string): Promise<void>;
  deleteUser(
    principal: Principal,
    userId: string,
    options: DeleteUserOptions,
  ): Promise<DeleteUserResult>;
  getOwnProfile(principal: Principal): Promise<UserProfile>;
  updateOwnProfile(principal: Principal, input: UpdateProfileInput): Promise<UserProfile>;
  changeOwnPassword(principal: Principal, input: ChangeOwnPasswordInput): Promise<void>;
}

export interface UserAdminServiceOptions {
  prisma: DatabaseClient;
  now?: () => Date;
}

const VALID_ROLES: ReadonlySet<string> = new Set<UserRole>([
  'administrator',
  'editor',
  'author',
  'contributor',
  'subscriber',
]);

const SEARCH_MAX = 200;

const SUMMARY_SELECT = {
  id: true,
  username: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

const PROFILE_SELECT = {
  id: true,
  username: true,
  role: true,
  createdAt: true,
} as const;

type AuditClient = Pick<DatabaseClient, 'auditEvent'>;

type SummaryRow = {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
};

type ProfileRow = {
  id: string;
  username: string;
  role: UserRole;
  createdAt: Date;
};

/**
 * Writes one user-administration audit row. Callers pass identifiers and
 * non-secret metadata only: never usernames, passwords, hashes or tokens.
 * The client may be a transaction so the event commits with its write.
 *
 * (The auth audit module owns login/session events; user administration events
 * live here because they have no IP/identifier hashing requirement.)
 */
async function writeAudit(
  client: AuditClient,
  eventType: string,
  input: {
    actorUserId: string;
    targetUserId: string | null;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await client.auditEvent.create({
    data: {
      eventType,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}

function toAdminUser(row: SummaryRow & { _count: { posts: number } }): AdminUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    postCount: row._count.posts,
  };
}

function toProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

function assertRole(role: string): asserts role is UserRole {
  if (!VALID_ROLES.has(role)) {
    throw new UserAdminError(
      'INVALID_ROLE',
      'Role must be one of: administrator, editor, author, contributor, subscriber.',
      400,
    );
  }
}

function assertStatus(status: string): asserts status is UserStatus {
  if (status !== 'active' && status !== 'disabled') {
    throw new UserAdminError('INVALID_STATUS', 'Status must be active or disabled.', 400);
  }
}

function validatedUsername(raw: string): string {
  const username = normalizeUsername(raw);
  const error = usernamePolicyError(username);
  if (error) {
    throw new UserAdminError('INVALID_USERNAME', error, 400);
  }
  return username;
}

function assertPasswordPolicy(password: string): void {
  const error = passwordPolicyError(password);
  if (error) {
    throw new UserAdminError('WEAK_PASSWORD', error, 400);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * User administration (P2-05) and self-service profile use cases.
 *
 * Authorization is domain-level: every administrative method requires the
 * `user.manage` capability, which only `administrator` currently holds (ADR
 * 0004). Self-service methods act only on `principal.userId`. Routes
 * authenticate and pass `{ userId, role }`; they do not decide permission.
 *
 * Session invalidation is a direct `session` write rather than a call into the
 * auth service: `createAuthService` exposes no "revoke for user" helper and its
 * internal `revokeSession` is per-session only. Keeping `users.ts` standalone
 * avoids editing `service.ts`.
 */
export function createUserAdminService(options: UserAdminServiceOptions): UserAdminService {
  const { prisma } = options;
  const now = options.now ?? (() => new Date());

  function requireManageUsers(principal: Principal): void {
    requireCapability(principal, 'user.manage');
  }

  async function findSummary(
    client: AuditClient & Pick<DatabaseClient, 'user'>,
    userId: string,
  ): Promise<SummaryRow> {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: SUMMARY_SELECT,
    });
    if (!user) {
      throw new UserAdminError('USER_NOT_FOUND', 'User not found.', 404);
    }
    return user;
  }

  async function getSummary(userId: string): Promise<SummaryRow> {
    return findSummary(prisma, userId);
  }

  /**
   * Refuses an operation that would leave zero active administrators. The
   * check runs before the self-guards so the sole administrator always gets the
   * stronger LAST_ADMIN reason (the self-guards still cover multi-admin cases).
   */
  async function assertNotLastActiveAdmin(
    tx: Prisma.TransactionClient,
    target: SummaryRow,
  ): Promise<void> {
    if (target.role !== 'administrator' || target.status !== 'active') {
      return;
    }

    const otherActiveAdmins = await tx.user.count({
      where: {
        role: 'administrator',
        status: 'active',
        id: { not: target.id },
      },
    });

    if (otherActiveAdmins === 0) {
      throw new UserAdminError(
        'LAST_ADMIN',
        'Cannot remove or disable the last active administrator.',
        409,
      );
    }
  }

  async function revokeAllSessions(
    tx: Prisma.TransactionClient,
    userId: string,
    revokedAt: Date,
  ): Promise<number> {
    const result = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
    return result.count;
  }

  async function listUsers(principal: Principal, query: UserListQuery): Promise<Paged<AdminUser>> {
    requireManageUsers(principal);

    const where: Prisma.UserWhereInput = {};
    if (query.search !== undefined && query.search.trim().length > 0) {
      where.username = {
        contains: query.search.trim().slice(0, SEARCH_MAX),
        mode: 'insensitive',
      };
    }

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { ...SUMMARY_SELECT, _count: { select: { posts: true } } },
        orderBy: [{ username: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
    ]);

    return {
      items: rows.map(toAdminUser),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  async function createUser(principal: Principal, input: CreateUserInput): Promise<AdminUser> {
    requireManageUsers(principal);
    assertRole(input.role);

    const username = validatedUsername(input.username);
    assertPasswordPolicy(input.password);
    const passwordHash = await hashPassword(input.password);

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { username }, select: { id: true } });
        if (existing) {
          throw new UserAdminError('USERNAME_TAKEN', 'That username is already in use.', 409);
        }

        const user = await tx.user.create({
          data: {
            username,
            passwordHash,
            role: input.role,
            status: 'active',
          },
          select: { ...SUMMARY_SELECT, _count: { select: { posts: true } } },
        });

        await writeAudit(tx, 'user.created', {
          actorUserId: principal.userId,
          targetUserId: user.id,
          metadata: { role: input.role },
        });

        return toAdminUser(user);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UserAdminError('USERNAME_TAKEN', 'That username is already in use.', 409);
      }
      throw error;
    }
  }

  async function updateUserRole(
    principal: Principal,
    userId: string,
    role: UserRole,
  ): Promise<AdminUser> {
    requireManageUsers(principal);
    assertRole(role);

    return prisma.$transaction(async (tx) => {
      const target = await findSummary(tx, userId);

      if (target.role !== role) {
        if (role !== 'administrator') {
          await assertNotLastActiveAdmin(tx, target);
        }

        if (target.id === principal.userId) {
          throw new UserAdminError('SELF_ROLE_CHANGE', 'You cannot change your own role.', 409);
        }
      }

      const updated = await tx.user.update({
        where: { id: target.id },
        data: { role },
        select: { ...SUMMARY_SELECT, _count: { select: { posts: true } } },
      });

      if (target.role !== role) {
        await writeAudit(tx, 'user.role.changed', {
          actorUserId: principal.userId,
          targetUserId: target.id,
          metadata: { fromRole: target.role, toRole: role },
        });
      }

      return toAdminUser(updated);
    });
  }

  async function setUserStatus(
    principal: Principal,
    userId: string,
    status: UserStatus,
  ): Promise<AdminUser> {
    requireManageUsers(principal);
    assertStatus(status);

    return prisma.$transaction(async (tx) => {
      const target = await findSummary(tx, userId);

      if (target.status !== status && status === 'disabled') {
        await assertNotLastActiveAdmin(tx, target);

        if (target.id === principal.userId) {
          throw new UserAdminError(
            'SELF_STATUS_CHANGE',
            'You cannot disable your own account.',
            409,
          );
        }
      }

      const revokedSessionCount =
        target.status === status || status !== 'disabled'
          ? 0
          : await revokeAllSessions(tx, target.id, now());

      const updated = await tx.user.update({
        where: { id: target.id },
        data: { status },
        select: { ...SUMMARY_SELECT, _count: { select: { posts: true } } },
      });

      if (target.status !== status) {
        await writeAudit(tx, 'user.status.changed', {
          actorUserId: principal.userId,
          targetUserId: target.id,
          metadata: {
            fromStatus: target.status,
            toStatus: status,
            revokedSessionCount,
          },
        });
      }

      return toAdminUser(updated);
    });
  }

  async function resetUserPassword(
    principal: Principal,
    userId: string,
    newPassword: string,
  ): Promise<void> {
    requireManageUsers(principal);
    assertPasswordPolicy(newPassword);

    const target = await getSummary(userId);
    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      await findSummary(tx, target.id);

      await tx.user.update({
        where: { id: target.id },
        data: { passwordHash },
      });

      const revokedSessionCount = await revokeAllSessions(tx, target.id, now());

      await writeAudit(tx, 'user.password.reset', {
        actorUserId: principal.userId,
        targetUserId: target.id,
        metadata: { revokedSessionCount },
      });
    });
  }

  async function deleteUser(
    principal: Principal,
    userId: string,
    deleteOptions: DeleteUserOptions,
  ): Promise<DeleteUserResult> {
    requireManageUsers(principal);

    return prisma.$transaction(async (tx) => {
      const target = await findSummary(tx, userId);

      await assertNotLastActiveAdmin(tx, target);

      if (target.id === principal.userId) {
        throw new UserAdminError('SELF_DELETE', 'You cannot delete your own account.', 409);
      }

      const authoredPostCount = await tx.post.count({ where: { authorId: target.id } });
      let reassignedPostCount = 0;
      let reassignToUserId: string | undefined;

      if (authoredPostCount > 0) {
        const requested = deleteOptions.reassignToUserId;
        if (requested === undefined) {
          throw new UserAdminError(
            'REASSIGN_REQUIRED',
            'This user authors content. Provide reassignTo to move their posts to another user.',
            409,
          );
        }

        if (requested === target.id) {
          throw new UserAdminError('REASSIGN_INVALID', 'reassignTo must be a different user.', 400);
        }

        const reassignTo = await tx.user.findUnique({
          where: { id: requested },
          select: { id: true },
        });
        if (!reassignTo) {
          throw new UserAdminError('REASSIGN_INVALID', 'reassignTo user not found.', 400);
        }

        const moved = await tx.post.updateMany({
          where: { authorId: target.id },
          data: { authorId: reassignTo.id },
        });
        reassignedPostCount = moved.count;
        reassignToUserId = reassignTo.id;
      }

      // Write the audit row before the delete so its target FK is valid; the
      // schema's ON DELETE SET NULL then keeps the row after the user is gone.
      await writeAudit(tx, 'user.deleted', {
        actorUserId: principal.userId,
        targetUserId: target.id,
        metadata: {
          role: target.role,
          reassignedPostCount,
          ...(reassignToUserId === undefined ? {} : { reassignToUserId }),
        },
      });

      await tx.user.delete({ where: { id: target.id } });

      return { deletedUserId: target.id, reassignedPostCount };
    });
  }

  async function getOwnProfile(principal: Principal): Promise<UserProfile> {
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: PROFILE_SELECT,
    });
    if (!user) {
      throw new UserAdminError('USER_NOT_FOUND', 'User not found.', 404);
    }
    return toProfile(user);
  }

  async function updateOwnProfile(
    principal: Principal,
    input: UpdateProfileInput,
  ): Promise<UserProfile> {
    const current = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: PROFILE_SELECT,
    });
    if (!current) {
      throw new UserAdminError('USER_NOT_FOUND', 'User not found.', 404);
    }

    if (input.username === undefined) {
      return toProfile(current);
    }

    const username = validatedUsername(input.username);
    if (username === current.username) {
      return toProfile(current);
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const taken = await tx.user.findFirst({
          where: { username, id: { not: current.id } },
          select: { id: true },
        });
        if (taken) {
          throw new UserAdminError('USERNAME_TAKEN', 'That username is already in use.', 409);
        }

        const updated = await tx.user.update({
          where: { id: current.id },
          data: { username },
          select: PROFILE_SELECT,
        });

        await writeAudit(tx, 'user.profile.updated', {
          actorUserId: principal.userId,
          targetUserId: current.id,
        });

        return toProfile(updated);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UserAdminError('USERNAME_TAKEN', 'That username is already in use.', 409);
      }
      throw error;
    }
  }

  /**
   * Changes the caller's own password.
   *
   * Session choice: the route principal carries no session id, and the auth
   * service exposes no "revoke every session except this one" helper, so this
   * invalidates ALL of the user's sessions. The browser session ends and the
   * user must log in again with the new password. Weakening this to "keep the
   * current session" would require changing the guard contract/domain API.
   */
  async function changeOwnPassword(
    principal: Principal,
    input: ChangeOwnPasswordInput,
  ): Promise<void> {
    assertPasswordPolicy(input.newPassword);

    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      throw new UserAdminError('USER_NOT_FOUND', 'User not found.', 404);
    }

    const valid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new UserAdminError('INVALID_PASSWORD', 'The current password is incorrect.', 400);
    }

    const passwordHash = await hashPassword(input.newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      const revokedSessionCount = await revokeAllSessions(tx, user.id, now());

      await writeAudit(tx, 'user.password.changed', {
        actorUserId: principal.userId,
        targetUserId: user.id,
        metadata: { revokedSessionCount },
      });
    });
  }

  return {
    listUsers,
    createUser,
    updateUserRole,
    setUserStatus,
    resetUserPassword,
    deleteUser,
    getOwnProfile,
    updateOwnProfile,
    changeOwnPassword,
  };
}
