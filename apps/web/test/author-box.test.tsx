import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AuthorBox from '../components/AuthorBox';
import PostView from '../components/PostView';
import type { PublicAuthorSummary, PublicPost } from '../lib/api';

const author: PublicAuthorSummary = {
  id: 'u1',
  username: 'ada',
  displayName: 'Ada Lovelace',
  bio: 'Writes about engines and analytical machines.',
  website: 'https://example.com/ada',
};

const post: PublicPost = {
  id: '1',
  type: 'post',
  title: 'Analytical engines',
  slug: 'analytical-engines',
  excerpt: null,
  content: '',
  contentFormat: 'wp_block_html',
  renderedContent: '<p>Body</p>',
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
  updatedAt: '2026-01-01T00:00:00.000Z',
  author,
  terms: { categories: [], tags: [] },
};

describe('author box', () => {
  it('renders the display name, bio, local initials and a safe website link', () => {
    const html = renderToStaticMarkup(<AuthorBox author={author} />);
    expect(html).toContain('About the author');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('AL');
    expect(html).toContain('Writes about engines and analytical machines.');
    expect(html).toContain('href="/author/ada"');
    expect(html).toContain('rel="author"');
    expect(html).toContain('href="https://example.com/ada"');
    expect(html).toContain('rel="me noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('@');
  });

  it('falls back to the username and hides optional fields when empty', () => {
    const html = renderToStaticMarkup(
      <AuthorBox
        author={{
          id: 'u2',
          username: 'admin',
          displayName: null,
          bio: null,
          website: null,
        }}
      />,
    );
    expect(html).toContain('>admin</a>');
    expect(html).toContain('>A</span>');
    expect(html).not.toContain('author-box-bio');
    expect(html).not.toContain('author-box-website');
  });

  it('appears on single posts but not pages', () => {
    const postHtml = renderToStaticMarkup(<PostView post={post} />);
    expect(postHtml).toContain('author-box');
    const pageHtml = renderToStaticMarkup(<PostView post={{ ...post, type: 'page' }} />);
    expect(pageHtml).not.toContain('author-box');
  });
});
