import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PostView from '../components/PostView';
import type { PublicPost } from '../lib/api';

const basePost: PublicPost = {
  id: '1',
  type: 'post',
  title: 'Secret notes',
  slug: 'secret-notes',
  path: '/posts/secret-notes',
  excerpt: 'An excerpt',
  content: '',
  contentFormat: 'wp_block_html',
  renderedContent: '<p>Protected body</p>',
  toc: [],
  featuredImage: null,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  robots: null,
  ogTitle: null,
  ogDescription: null,
  publishedAt: '2026-01-01T00:00:00.000Z',
  commentStatus: 'open',
  sticky: false,
  passwordProtected: true,
  format: 'standard',
  language: 'en',
  translationGroup: 'group-1',
  updatedAt: '2026-01-01T00:00:00.000Z',
  terms: { categories: [], tags: [] },
  author: {
    id: 'u1',
    username: 'admin',
    displayName: null,
    bio: null,
    website: null,
  },
};

describe('password-protected posts', () => {
  it('renders the password form instead of the body', () => {
    const html = renderToStaticMarkup(<PostView post={basePost} />);
    expect(html).toContain('This content is password protected');
    expect(html).toContain('id="post-password"');
    expect(html).not.toContain('Protected body');
  });

  it('renders the format class and body when the post is public', () => {
    const html = renderToStaticMarkup(
      <PostView post={{ ...basePost, passwordProtected: false, format: 'quote' }} />,
    );
    expect(html).toContain('Protected body');
    expect(html).toContain('format-quote');
    expect(html).not.toContain('post-password-form');
  });
});
