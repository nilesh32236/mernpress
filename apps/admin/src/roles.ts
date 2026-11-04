import type { AdminPost, AuthUser, PostStatus } from './api.js';

export function canReadContent(user: AuthUser): boolean {
  return user.role !== 'subscriber';
}

export function canCreateContent(user: AuthUser): boolean {
  return user.role !== 'subscriber';
}

export function canAssignTerms(user: AuthUser): boolean {
  return user.role !== 'subscriber';
}

export function canReadComments(user: AuthUser): boolean {
  return user.role !== 'subscriber';
}

export function canModerateComments(user: AuthUser): boolean {
  return user.role === 'administrator' || user.role === 'editor';
}

/**
 * Mirrors the server's `taxonomy.manage` capability for UI affordances only.
 * The API remains authoritative and rejects unauthorized writes.
 */
export function canManageTerms(user: AuthUser): boolean {
  return user.role === 'administrator' || user.role === 'editor';
}

export function ownsPost(user: AuthUser, post: Pick<AdminPost, 'authorId'>): boolean {
  return post.authorId !== null && post.authorId === user.id;
}

/**
 * Mirrors the server's object-level edit capability for UI affordances only.
 * The API remains authoritative and rejects unauthorized writes.
 */
export function canEditPost(user: AuthUser, post: AdminPost): boolean {
  if (user.role === 'administrator' || user.role === 'editor') {
    return true;
  }
  if (!ownsPost(user, post)) {
    return false;
  }
  if (user.role === 'author') {
    return true;
  }
  return user.role === 'contributor' && post.status === 'DRAFT';
}

export function canPublishPost(user: AuthUser, post: AdminPost): boolean {
  if (user.role === 'administrator' || user.role === 'editor') {
    return true;
  }
  return user.role === 'author' && ownsPost(user, post);
}

export function canTrashPost(user: AuthUser, post: AdminPost): boolean {
  if (user.role === 'administrator' || user.role === 'editor') {
    return true;
  }
  return user.role === 'author' && ownsPost(user, post);
}

export function availableTransitions(
  user: AuthUser,
  post: AdminPost,
): Array<'publish' | 'unpublish' | 'trash' | 'restore'> {
  const actions: Array<'publish' | 'unpublish' | 'trash' | 'restore'> = [];
  if (post.status === 'DRAFT' && canPublishPost(user, post)) {
    actions.push('publish');
  }
  if (post.status === 'PUBLISHED' && canPublishPost(user, post)) {
    actions.push('unpublish');
  }
  if (post.status !== 'TRASHED' && canTrashPost(user, post)) {
    actions.push('trash');
  }
  if (post.status === 'TRASHED' && canTrashPost(user, post)) {
    actions.push('restore');
  }
  return actions;
}

export function roleLabel(role: AuthUser['role']): string {
  switch (role) {
    case 'administrator':
      return 'Administrator';
    case 'editor':
      return 'Editor';
    case 'author':
      return 'Author';
    case 'contributor':
      return 'Contributor';
    case 'subscriber':
      return 'Subscriber';
  }
}

export function statusLabel(status: PostStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'PUBLISHED':
      return 'Published';
    case 'TRASHED':
      return 'Trashed';
  }
}
