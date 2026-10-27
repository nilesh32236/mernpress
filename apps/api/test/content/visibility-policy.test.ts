import { describe, expect, it } from 'vitest';
import { canReadPost } from '@mernpress/cms-core';

describe('canReadPost visibility policy (pure)', () => {
  const admin = { userId: 'a', role: 'administrator' };
  const editor = { userId: 'e', role: 'editor' };
  const author = { userId: 'u1', role: 'author' };
  const contributor = { userId: 'u2', role: 'contributor' };

  it('owner sees their own content in every state', () => {
    for (const status of ['DRAFT', 'PUBLISHED', 'TRASHED'] as const) {
      expect(canReadPost(author, 'u1', status)).toBe(true);
    }
  });

  it('admin and editor see every state of others', () => {
    for (const p of [admin, editor]) {
      for (const status of ['DRAFT', 'PUBLISHED', 'TRASHED'] as const) {
        expect(canReadPost(p, 'someone-else', status)).toBe(true);
      }
    }
  });

  it('author/contributor see only PUBLISHED content of others', () => {
    for (const p of [author, contributor]) {
      expect(canReadPost(p, 'someone-else', 'PUBLISHED')).toBe(true);
      expect(canReadPost(p, 'someone-else', 'DRAFT')).toBe(false);
      expect(canReadPost(p, 'someone-else', 'TRASHED')).toBe(false);
    }
  });

  it('null authorId is never owned', () => {
    expect(canReadPost(author, null, 'PUBLISHED')).toBe(true); // non-owner published still visible
    expect(canReadPost(author, null, 'DRAFT')).toBe(false);
  });
});
