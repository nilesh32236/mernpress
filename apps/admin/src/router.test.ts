import { describe, expect, it } from 'vitest';
import { breadcrumbs, editContentPath, listPath, newContentPath, parseRoute } from './router.js';

describe('admin router', () => {
  it('maps implemented routes with /admin base path (production)', () => {
    expect(parseRoute('/admin')).toEqual({ name: 'dashboard' });
    expect(parseRoute('/admin/')).toEqual({ name: 'dashboard' });
    expect(parseRoute('/admin/posts')).toEqual({ name: 'list', type: 'post' });
    expect(parseRoute('/admin/pages')).toEqual({ name: 'list', type: 'page' });
    expect(parseRoute('/admin/posts/new')).toEqual({ name: 'new', type: 'post' });
    expect(parseRoute('/admin/pages/new')).toEqual({ name: 'new', type: 'page' });
    expect(parseRoute('/admin/posts/abc/edit')).toEqual({ name: 'edit', type: 'post', id: 'abc' });
    expect(parseRoute('/admin/pages/abc%201/edit')).toEqual({
      name: 'edit',
      type: 'page',
      id: 'abc 1',
    });
  });

  it('maps routes without /admin prefix (dev mode)', () => {
    expect(parseRoute('/')).toEqual({ name: 'dashboard' });
    expect(parseRoute('/posts')).toEqual({ name: 'list', type: 'post' });
    expect(parseRoute('/posts/new')).toEqual({ name: 'new', type: 'post' });
    expect(parseRoute('/posts/abc/edit')).toEqual({ name: 'edit', type: 'post', id: 'abc' });
  });

  it('returns notFound for unknown routes', () => {
    expect(parseRoute('/admin/taxonomy')).toEqual({ name: 'notFound' });
    expect(parseRoute('/taxonomy')).toEqual({ name: 'notFound' });
  });

  it('builds internal list paths (navigate adds /admin in production)', () => {
    expect(listPath('post')).toBe('/posts');
    expect(listPath('page', { status: 'DRAFT' })).toBe('/pages?status=DRAFT');
    expect(listPath('post', { status: 'PUBLISHED', search: 'hello world', page: 2 })).toBe(
      '/posts?status=PUBLISHED&search=hello+world&page=2',
    );
    expect(listPath('post', { page: 1 })).toBe('/posts');
  });

  it('builds internal new/edit paths (navigate adds /admin in production)', () => {
    expect(newContentPath('post')).toBe('/posts/new');
    expect(newContentPath('page')).toBe('/pages/new');
    expect(editContentPath('post', 'id with space')).toBe('/posts/id%20with%20space/edit');
  });

  it('builds breadcrumbs per route', () => {
    expect(breadcrumbs(parseRoute('/admin'))).toEqual([{ label: 'Dashboard' }]);
    expect(breadcrumbs(parseRoute('/admin/posts'))).toEqual([
      { label: 'Dashboard', to: '/' },
      { label: 'Posts' },
    ]);
    expect(breadcrumbs(parseRoute('/admin/posts/new'))[2]).toEqual({ label: 'New post' });
    expect(breadcrumbs(parseRoute('/admin/terms'))).toEqual([
      { label: 'Dashboard', to: '/' },
      { label: 'Categories & Tags' },
    ]);
    expect(breadcrumbs(parseRoute('/admin/posts/abc/edit'))[2]).toEqual({ label: 'Edit' });
  });
});
