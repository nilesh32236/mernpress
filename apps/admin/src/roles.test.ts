import { describe, expect, it } from 'vitest';
import type { AdminPost, AuthUser } from './api.js';
import {
  availableTransitions,
  canAssignTerms,
  canCreateContent,
  canEditPost,
  canPublishPost,
  canReadContent,
  canTrashPost,
  roleLabel,
  statusLabel,
} from './roles.js';

const user = (role: AuthUser['role'], id = 'user-1'): AuthUser => ({
  id,
  username: id,
  role,
  status: 'active',
});

const post = (authorId: string, status: AdminPost['status'] = 'DRAFT'): AdminPost => ({
  id: 'post-1',
  type: 'post',
  status,
  title: 'Title',
  slug: 'title',
  excerpt: null,
  content: '',
  contentFormat: 'wp_block_html',
  contentVersion: 1,
  authorId,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  robots: null,
  ogTitle: null,
  ogDescription: null,
  publishedAt: null,
  commentStatus: 'open',
  sticky: false,
  notesNotify: null,
  language: 'en',
  translationGroup: 'group-1',
  structureLocked: false,
  passwordProtected: false,
  isPrivate: false,
  format: 'standard',
  trashedAt: null,
  previousStatus: null,
  version: 1,
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
  terms: { categories: [], tags: [] },
  featuredMedia: null,
  author: null,
});

describe('admin capability helpers', () => {
  it('hides content from subscribers only', () => {
    expect(canReadContent(user('subscriber'))).toBe(false);
    for (const role of ['administrator', 'editor', 'author', 'contributor'] as const) {
      expect(canReadContent(user(role))).toBe(true);
      expect(canCreateContent(user(role))).toBe(true);
    }
  });

  it('allows non-subscribers to assign existing terms', () => {
    expect(canAssignTerms(user('administrator'))).toBe(true);
    expect(canAssignTerms(user('editor'))).toBe(true);
    expect(canAssignTerms(user('author'))).toBe(true);
    expect(canAssignTerms(user('contributor'))).toBe(true);
    expect(canAssignTerms(user('subscriber'))).toBe(false);
  });

  it('applies object-level edit rules', () => {
    const author = user('author');
    const otherAuthor = user('author', 'user-2');
    const contributor = user('contributor');
    const editor = user('editor');

    expect(canEditPost(editor, post('someone-else', 'TRASHED'))).toBe(true);
    expect(canEditPost(author, post('user-1', 'PUBLISHED'))).toBe(true);
    expect(canEditPost(author, post('user-2'))).toBe(false);
    expect(canEditPost(contributor, post('user-1', 'DRAFT'))).toBe(true);
    expect(canEditPost(contributor, post('user-1', 'PUBLISHED'))).toBe(false);
    expect(canEditPost(contributor, post('user-2', 'DRAFT'))).toBe(false);
    expect(canEditPost(otherAuthor, post('user-1'))).toBe(false);
  });

  it('computes lifecycle controls per role and status', () => {
    const author = user('author');
    const other = user('author', 'user-2');
    const contributor = user('contributor');

    expect(availableTransitions(author, post('user-1', 'DRAFT'))).toEqual(['publish', 'trash']);
    expect(availableTransitions(author, post('user-1', 'PUBLISHED'))).toEqual([
      'unpublish',
      'trash',
    ]);
    expect(availableTransitions(author, post('user-1', 'TRASHED'))).toEqual(['restore']);
    expect(availableTransitions(author, post('user-2', 'DRAFT'))).toEqual([]);
    expect(availableTransitions(contributor, post('user-1', 'DRAFT'))).toEqual([]);
    expect(canPublishPost(other, post('user-1'))).toBe(false);
    expect(canTrashPost(other, post('user-1'))).toBe(false);
  });

  it('labels roles and statuses', () => {
    expect(roleLabel('administrator')).toBe('Administrator');
    expect(roleLabel('contributor')).toBe('Contributor');
    expect(statusLabel('DRAFT')).toBe('Draft');
    expect(statusLabel('PUBLISHED')).toBe('Published');
    expect(statusLabel('TRASHED')).toBe('Trashed');
  });
});
