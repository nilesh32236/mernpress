import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PostView from '../components/PostView';
import type { PublicPost } from '../lib/api';

const basePost: PublicPost = {
  id: '1',
  type: 'post',
  title: 'Current post',
  slug: 'current-post',
  path: '/posts/current-post',
  excerpt: 'An excerpt',
  content: '',
  contentFormat: 'wp_block_html',
  renderedContent: '<p>' + 'word '.repeat(400) + '</p>',
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
  passwordProtected: false,
  format: 'standard',
  language: 'en',
  updatedAt: '2026-01-01T00:00:00.000Z',
  terms: {
    categories: [{ id: 'c1', name: 'Cat', slug: 'cat', path: '/category/cat' }],
    tags: [],
  },
  author: {
    id: 'u1',
    username: 'admin',
    displayName: null,
    bio: null,
    website: null,
  },
};

const related: PublicPost = {
  ...basePost,
  id: '2',
  title: 'Related post',
  slug: 'related-post',
  renderedContent: '<p>' + 'word '.repeat(200) + '</p>',
};

describe('related posts and reading time', () => {
  it('shows the reading time in the entry meta and related cards', () => {
    const html = renderToStaticMarkup(<PostView post={basePost} relatedPosts={[related]} />);
    expect(html).toContain('2 min read');
    expect(html).toContain('Related posts');
    expect(html).toContain('Related post');
    expect(html).toContain('1 min read');
    expect(html).not.toContain('Current post</a>');
  });

  it('falls back to more posts and excludes the current post', () => {
    const html = renderToStaticMarkup(<PostView post={basePost} morePosts={[basePost, related]} />);
    expect(html).toContain('More posts');
    expect(html).toContain('Related post');
    expect(html).not.toContain('Current post</a>');
  });
});
