import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import type { PostStatus } from '@mernpress/database';

/**
 * Capability registry (ADR 0004, D-2/D-3). Code-level role → capability map; the
 * content-model §3.2 roles/role_capabilities tables are the Phase 9 extension for
 * plugin-registered/custom roles. Capability semantics are identical, so the later
 * migration is data, not behavior.
 */
export type Capability =
  | 'user.manage'
  | 'taxonomy.manage'
  | 'taxonomy.assign'
  | 'content.create'
  | 'content.read.any'
  | 'content.edit.any'
  | 'content.edit.own'
  | 'content.publish.own'
  | 'content.publish.any'
  | 'content.trash.any'
  | 'content.trash.own';

export type Role = 'administrator' | 'editor' | 'author' | 'contributor' | 'subscriber';

const ADMIN: readonly Capability[] = [
  'user.manage',
  'taxonomy.manage',
  'taxonomy.assign',
  'content.create',
  'content.read.any',
  'content.edit.any',
  'content.edit.own',
  'content.publish.own',
  'content.publish.any',
  'content.trash.any',
  'content.trash.own',
];

const ROLE_CAPABILITIES: Readonly<Record<Role, ReadonlySet<Capability>>> = {
  administrator: new Set(ADMIN),
  editor: new Set(
    ADMIN.filter(
      (capability) =>
        capability !== 'user.manage' &&
        capability !== 'content.edit.own' &&
        capability !== 'content.publish.own' &&
        capability !== 'content.trash.own',
    ),
  ),
  author: new Set([
    'taxonomy.assign',
    'content.create',
    'content.read.any',
    'content.edit.own',
    'content.publish.own',
    'content.trash.own',
  ]),
  contributor: new Set([
    'taxonomy.assign',
    'content.create',
    'content.read.any',
    'content.edit.own',
  ]),
  subscriber: new Set(),
};

/**
 * Whether a role grants a capability. Unknown roles are denied (fail closed).
 */
export function roleHasCapability(role: string, capability: Capability): boolean {
  const set = (ROLE_CAPABILITIES as Record<string, ReadonlySet<Capability> | undefined>)[role];
  return set !== undefined && set.has(capability);
}

/**
 * Require a capability on the principal or throw 403. Fail closed.
 */
export function requireCapability(principal: Principal, capability: Capability): void {
  if (!roleHasCapability(principal.role, capability)) {
    throw new ContentError('FORBIDDEN', 'Forbidden', 403);
  }
}

/**
 * Object-level ownership check. `true` when the principal owns the object.
 */
export function ownsObject(principal: Principal, authorId: string | null): boolean {
  return authorId !== null && authorId === principal.userId;
}

/**
 * Visibility policy for admin content reads (pre-Phase-3-acceptance correction).
 *
 * Administrators and editors see every content state. The owner sees their own
 * content in every state. Any other principal with `content.read.any` (authors,
 * contributors) sees only PUBLISHED content of other authors. Subscribers are
 * denied earlier via `content.read.any` (403). Hidden objects must surface as
 * 404, never 403, so existence is not leaked.
 */
export const FULL_VISIBILITY_ROLES: ReadonlySet<string> = new Set(['administrator', 'editor']);

export function canReadPost(
  principal: Principal,
  authorId: string | null,
  status: PostStatus,
): boolean {
  if (ownsObject(principal, authorId)) {
    return true;
  }
  if (FULL_VISIBILITY_ROLES.has(principal.role)) {
    return true;
  }
  // Fail closed: only principals that actually hold content.read.any may see
  // published content of others. Unknown roles are denied.
  if (!roleHasCapability(principal.role, 'content.read.any')) {
    return false;
  }
  return status === 'PUBLISHED';
}
