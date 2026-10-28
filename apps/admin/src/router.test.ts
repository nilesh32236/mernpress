import { describe, expect, it } from 'vitest';
import { breadcrumbs, editContentPath, listPath, newContentPath, parseRoute } from './router.js';

describe('admin router', () => {
  it('maps implemented routes', () => {
    expect(parseRoute('/')).toEqual({ name: 'dashboard' });
    expect(parseRoute('/posts')).toEqual({ name: 'list', type: 'post' });
    expect(parseRoute('/pages')).toEqual({ name: 'list', type: 'page' });
    expect(parseRoute('/posts/new')).toEqual({ name: 'new', type: 'post' });
    expect(parseRoute('/pages/new')).toEqual({ name: 'new', type: 'page' });
    expect(parseRoute('/posts/abc/edit')).toEqual({ name: 'edit', type: 'post', id: 'abc' });
    expect(parseRoute('/pages/abc%201/edit')).toEqual({ name: 'edit', type: 'page', id: 'abc 1' });
  });

  it('returns notFound for unknown routes', () => {
    expect(parseRoute('/taxonomy')).toEqual({ name: 'notFound' });
    expect(parseRoute('/posts/abc')).toEqual({ name: 'notFound' });
    expect(parseRoute('/posts/abc/edit/extra')).toEqual({ name: 'notFound' });
  });

  it('builds list paths with filters and pagination', () => {
    expect(listPath('post')).toBe('/posts');
    expect(listPath('page', { status: 'DRAFT' })).toBe('/pages?status=DRAFT');
    expect(listPath('post', { status: 'PUBLISHED', search: 'hello world', page: 2 })).toBe(
      '/posts?status=PUBLISHED&search=hello+world&page=2',
    );
    expect(listPath('post', { page: 1 })).toBe('/posts');
  });

  it('builds new/edit paths', () => {
    expect(newContentPath('post')).toBe('/posts/new');
    expect(newContentPath('page')).toBe('/pages/new');
    expect(editContentPath('post', 'id with space')).toBe('/posts/id%20with%20space/edit');
  });

  it('builds breadcrumbs per route', () => {
    expect(breadcrumbs(parseRoute('/'))).toEqual([{ label: 'Dashboard' }]);
    expect(breadcrumbs(parseRoute('/posts'))).toEqual([
      { label: 'Dashboard', to: '/' },
      { label: 'Posts' },
    ]);
    expect(breadcrumbs(parseRoute('/posts/new'))[2]).toEqual({ label: 'New post' });
    expect(breadcrumbs(parseRoute('/terms'))).toEqual([
      { label: 'Dashboard', to: '/' },
      { label: 'Categories & Tags' },
    ]);
    expect(breadcrumbs(parseRoute('/posts/abc/edit'))[2]).toEqual({ label: 'Edit' });
  });
});
