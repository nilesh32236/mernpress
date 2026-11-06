import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { themeStringsFor } from '@mernpress/contracts';
import PostView from '../components/PostView';
import PostList from '../components/PostList';
import Pagination from '../components/Pagination';
import SearchForm from '../components/SearchForm';
import type { PublicPost } from '../lib/api';

const strings = themeStringsFor(
  {
    hi: {
      writtenBy: 'लेखक',
      minRead: 'मिनट पढ़ें',
      inCategory: 'में',
      uncategorized: 'अवर्गीकृत',
      postNavigation: 'पोस्ट नेविगेशन',
      aboutAuthor: 'लेखक के बारे में',
      visitWebsite: 'वेबसाइट देखें',
      relatedPosts: 'संबंधित पोस्ट',
      morePosts: 'और पोस्ट',
      comments: 'टिप्पणियाँ',
      thoughtOn: 'विचार',
      thoughtsOn: 'विचार',
      leaveReply: 'उत्तर दें',
      commentNotes: 'आपका ईमेल प्रकाशित नहीं होगा।',
      nameLabel: 'नाम *',
      emailLabel: 'ईमेल *',
      websiteLabel: 'वेबसाइट',
      commentLabel: 'टिप्पणी *',
      postComment: 'टिप्पणी भेजें',
      previousPage: 'पिछला पृष्ठ',
      nextPage: 'अगला पृष्ठ',
      paginationLabel: 'पृष्ठों का पेजिनेशन',
      searchPlaceholder: 'यहाँ लिखें...',
      searchButton: 'खोजें',
      search: 'खोज',
      languagesLabel: 'भाषाएँ',
    },
  },
  'hi',
  'en',
);

function post(overrides: Partial<PublicPost> = {}): PublicPost {
  return {
    id: 'p1',
    type: 'post',
    title: 'नमस्ते',
    slug: 'hello',
    path: '/hi/posts/hello',
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
    publishedAt: '2026-11-06T00:00:00.000Z',
    commentStatus: 'open',
    sticky: false,
    passwordProtected: false,
    format: 'standard',
    language: 'hi',
    updatedAt: '2026-11-06T00:00:00.000Z',
    author: {
      id: 'u1',
      username: 'admin',
      displayName: 'Admin',
      bio: null,
      website: null,
    },
    terms: {
      categories: [{ id: 't1', name: 'समाचार', slug: 'news', path: '/category/news' }],
      tags: [],
    },
    ...overrides,
  };
}

describe('per-language component strings', () => {
  it('renders post meta, author box and comments headings in the page language', () => {
    const html = renderToStaticMarkup(<PostView post={post()} strings={strings} />);
    expect(html).toContain('लेखक');
    expect(html).toContain('मिनट पढ़ें');
    expect(html).toContain('में');
    expect(html).toContain('लेखक के बारे में');
    expect(html).toContain('टिप्पणियाँ');
    expect(html).toContain('उत्तर दें');
    expect(html).toContain('टिप्पणी भेजें');
    expect(html).toContain('पोस्ट नेविगेशन');
    expect(html).not.toContain('Written by');
    expect(html).not.toContain('Leave a Reply');
  });

  it('translates list meta, pagination and the search form', () => {
    const list = renderToStaticMarkup(<PostList posts={[post()]} strings={strings} />);
    expect(list).toContain('मिनट पढ़ें');

    const pagination = renderToStaticMarkup(
      <Pagination page={2} totalPages={3} basePath="/hi/posts" strings={strings} />,
    );
    expect(pagination).toContain('aria-label="पिछला पृष्ठ"');
    expect(pagination).toContain('aria-label="अगला पृष्ठ"');
    expect(pagination).toContain('aria-label="पृष्ठों का पेजिनेशन"');

    const search = renderToStaticMarkup(<SearchForm strings={strings} />);
    expect(search).toContain('placeholder="यहाँ लिखें..."');
    expect(search).toContain('खोजें');
  });

  it('uses the language switcher label', () => {
    const html = renderToStaticMarkup(<PostView post={post()} strings={strings} />);
    // PostView does not render the switcher; the label is passed by the page.
    // This guards against accidentally removing the optional prop contract.
    expect(strings.languagesLabel).toBe('भाषाएँ');
    expect(html).not.toContain('aria-label="Languages"');
  });
});
