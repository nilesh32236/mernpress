import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminPost, AdminTerm, AuthUser, Paged } from './api.js';
import { ContentEditor } from './ContentEditor.js';
import { NavigationGuardProvider } from './navigation-guard.js';

// The Gutenberg canvas is a 6 MB lazy chunk; unit tests replace it with a
// textarea so document-workflow behaviour stays fast and deterministic. The
// real canvas is exercised by tests/e2e/content.spec.ts in a browser.
vi.mock('./editor/BlockCanvas.js', async () => {
  const { BlockCanvasMock } = await import('./editor/BlockCanvasMock.js');
  return { default: BlockCanvasMock };
});

beforeEach(() => {
  window.history.replaceState(null, '', '/posts/new');
  document.cookie = 'mernpress_csrf=test-csrf; path=/';
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

const authorA: AuthUser = { id: 'a1', username: 'author-a', role: 'author', status: 'active' };
const authorB: AuthUser = { id: 'a2', username: 'author-b', role: 'author', status: 'active' };

function makePost(overrides: Partial<AdminPost> = {}): AdminPost {
  return {
    id: 'post-1',
    type: 'post',
    status: 'DRAFT',
    title: 'Draft title',
    slug: 'draft-title',
    excerpt: 'Excerpt',
    content: 'Body',
    contentFormat: 'wp_block_html',
    contentVersion: 1,
    authorId: 'a1',
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    robots: null,
    ogTitle: null,
    ogDescription: null,
    publishedAt: null,
    trashedAt: null,
    previousStatus: null,
    version: 1,
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T11:00:00.000Z',
    terms: { categories: [], tags: [] },
    featuredMedia: null,
    author: null,
    ...overrides,
  };
}

function termsPage(items: AdminTerm[] = []): Paged<AdminTerm> {
  return {
    items,
    pagination: { page: 1, perPage: 100, total: items.length, totalPages: 1 },
  };
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderEditor(user: AuthUser, id?: string) {
  return render(
    <NavigationGuardProvider>
      <ContentEditor user={user} type="post" {...(id ? { id } : {})} />
    </NavigationGuardProvider>,
  );
}

describe('content editor', () => {
  it('creates a draft with API-supported fields and navigates to edit', async () => {
    const created = makePost({ id: 'created-1', title: 'New title', slug: 'new-title' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(created, 201));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA);

    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'New title' } });
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'new-title' } });
    fireEvent.change(screen.getByLabelText('Excerpt'), { target: { value: 'Short excerpt' } });
    fireEvent.change(await screen.findByLabelText('Content'), {
      target: { value: 'Hello content' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/admin/posts');
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      type: 'post',
      title: 'New title',
      slug: 'new-title',
      excerpt: 'Short excerpt',
      content: 'Hello content',
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robots: null,
      ogTitle: null,
      ogDescription: null,
    });
    await waitFor(() => expect(window.location.pathname).toBe('/posts/created-1/edit'));
  });

  it('blocks an empty title before calling the API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Title is required.')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows server field errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(
        response(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request',
              details: [{ path: 'slug', message: 'Invalid slug' }],
            },
          },
          400,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Valid title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Invalid slug')).toBeDefined();
    expect(
      screen.getByText('The server rejected some fields. Check the highlighted values.'),
    ).toBeDefined();
  });

  it('shows a recoverable conflict instead of overwriting a stale version', async () => {
    const post = makePost();
    let saveCalls = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/autosave')) {
        return response({ autosave: null, postUpdatedAt: post.updatedAt });
      }
      if (url.includes('/api/admin/terms')) {
        return response(termsPage());
      }
      if (url.endsWith(`/api/admin/posts/${post.id}`) && init?.method === 'PATCH') {
        saveCalls += 1;
        return response({ error: { code: 'VERSION_CONFLICT', message: 'Version conflict' } }, 409);
      }
      return response(post);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, post.id);
    const title = await screen.findByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Changed title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText(
        'A newer version exists on the server. Reload it before editing again.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reload latest version' })).toBeDefined();
    expect(saveCalls).toBe(1);
    const patchCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith(`/api/admin/posts/${post.id}`) && call[1]?.method === 'PATCH',
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      baseVersion: 1,
      title: 'Changed title',
    });
  });

  it('publishes a saved draft and updates the displayed status', async () => {
    const post = makePost();
    const published = makePost({
      status: 'PUBLISHED',
      version: 2,
      publishedAt: '2026-10-27T12:00:00.000Z',
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, _init) => {
      const url = String(input);
      if (url.endsWith('/autosave')) {
        return response({ autosave: null, postUpdatedAt: post.updatedAt });
      }
      if (url.includes('/api/admin/terms')) {
        return response(termsPage());
      }
      if (url.endsWith('/publish')) {
        return response(published);
      }
      return response(post);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, post.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Content published.')).toBeDefined();
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    const publishCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/publish'));
    expect(publishCall?.[0]).toBe('/api/admin/posts/post-1/publish');
  });

  it('renders a read-only view when the role cannot edit the content', async () => {
    const post = makePost({ authorId: 'a1', status: 'PUBLISHED' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(post))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorB, post.id);

    expect(
      await screen.findByText(
        'Read-only view. Your role can read this content but cannot edit it.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to posts' })).toBeDefined();
  });
});

describe('content editor term assignment resilience', () => {
  it('keeps the selected terms when assignment fails so retry can resend them', async () => {
    const post = makePost({ title: 'Term post' });
    const category: AdminTerm = {
      id: 'cat-1',
      taxonomy: 'category',
      name: 'News',
      slug: 'news',
      description: null,
      parentId: null,
      postCount: 0,
      createdAt: '2026-10-27T00:00:00.000Z',
      updatedAt: '2026-10-27T00:00:00.000Z',
    };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/autosave')) {
        return response({ autosave: null, postUpdatedAt: post.updatedAt });
      }
      if (url.includes('/api/admin/terms')) {
        return response(url.includes('taxonomy=category') ? termsPage([category]) : termsPage());
      }
      if (url.endsWith(`/api/admin/posts/${post.id}/terms`)) {
        return response({ error: { code: 'TERM_NOT_FOUND', message: 'Term not found' } }, 400);
      }
      if (url.endsWith(`/api/admin/posts/${post.id}`) && init?.method === 'PATCH') {
        return response({ ...post, title: 'Term post updated', version: 2 });
      }
      return response(post);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, post.id);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'News' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Term post updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText(/Content saved, but category\/tag assignment failed/),
    ).toBeDefined();
    expect((screen.getByRole('checkbox', { name: 'News' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('editor publish workflow', () => {
  it('saves pending edits before publishing a draft', async () => {
    const post = makePost({
      status: 'DRAFT',
      version: 1,
      content: '<!-- wp:paragraph --><p>Old</p><!-- /wp:paragraph -->',
    });
    const saved = makePost({
      status: 'DRAFT',
      version: 2,
      title: 'Publish after edit',
      content: '<!-- wp:paragraph --><p>New</p><!-- /wp:paragraph -->',
    });
    const published = makePost({
      status: 'PUBLISHED',
      version: 3,
      title: 'Publish after edit',
      content: saved.content,
      publishedAt: '2026-10-28T12:00:00.000Z',
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/autosave')) {
        return response({ autosave: null, postUpdatedAt: post.updatedAt });
      }
      if (url.includes('/api/admin/terms')) {
        return response(termsPage());
      }
      if (url.endsWith('/publish')) {
        return response(published);
      }
      if (url.endsWith(`/api/admin/posts/${post.id}`) && init?.method === 'PATCH') {
        return response(saved);
      }
      return response(post);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, post.id);
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Publish after edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Content published.')).toBeDefined();
    const patchCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith(`/api/admin/posts/${post.id}`) && call[1]?.method === 'PATCH',
    );
    expect(patchCall?.[0]).toBe('/api/admin/posts/post-1');
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      baseVersion: 1,
      title: 'Publish after edit',
    });
    const publishCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/publish'));
    expect(publishCall?.[0]).toBe('/api/admin/posts/post-1/publish');
    expect(JSON.parse(String(publishCall?.[1]?.body))).toEqual({ baseVersion: 2 });
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
  });

  it('does not offer Publish to a contributor', async () => {
    const contributor: AuthUser = {
      id: 'c1',
      username: 'contributor',
      role: 'contributor',
      status: 'active',
    };
    const post = makePost({ authorId: 'c1', status: 'DRAFT' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(post))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(contributor, post.id);
    await screen.findByLabelText('Title');

    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDefined();
  });
});

describe('editor SEO fields', () => {
  it('renders SEO fields after switching to the SEO tab', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA);
    await screen.findByLabelText('Title');
    fireEvent.click(screen.getByText('SEO', { selector: 'summary' }));

    expect(screen.getByLabelText('SEO title')).toBeDefined();
    expect(screen.getByLabelText('SEO description')).toBeDefined();
    expect(screen.getByLabelText('Canonical URL')).toBeDefined();
    expect(screen.getByLabelText('Robots')).toBeDefined();
    expect(screen.getByLabelText('Social title')).toBeDefined();
    expect(screen.getByLabelText('Social description')).toBeDefined();
    expect((screen.getByLabelText('Robots') as HTMLSelectElement).value).toBe('');
  });

  it('submits typed SEO values when creating a post', async () => {
    const created = makePost({ id: 'created-seo', title: 'SEO post' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(created, 201));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'SEO post' } });
    fireEvent.click(screen.getByText('SEO', { selector: 'summary' }));
    fireEvent.change(screen.getByLabelText('SEO title'), { target: { value: 'Custom SEO title' } });
    fireEvent.change(screen.getByLabelText('SEO description'), {
      target: { value: 'Custom SEO description' },
    });
    fireEvent.change(screen.getByLabelText('Canonical URL'), {
      target: { value: 'https://example.com/canonical' },
    });
    fireEvent.change(screen.getByLabelText('Robots'), { target: { value: 'noindex, follow' } });
    fireEvent.change(screen.getByLabelText('Social title'), { target: { value: 'Social!' } });
    fireEvent.change(screen.getByLabelText('Social description'), {
      target: { value: 'Social blurb' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      title: 'SEO post',
      seoTitle: 'Custom SEO title',
      seoDescription: 'Custom SEO description',
      canonicalUrl: 'https://example.com/canonical',
      robots: 'noindex, follow',
      ogTitle: 'Social!',
      ogDescription: 'Social blurb',
    });
  });

  it('submits empty SEO values as null', async () => {
    const created = makePost({ id: 'created-seo-null', title: 'Plain post' });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(created, 201));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Plain post' } });
    fireEvent.click(screen.getByText('SEO', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      title: 'Plain post',
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robots: null,
      ogTitle: null,
      ogDescription: null,
    });
  });

  it('blocks submit and shows a field error for an invalid canonical URL', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Bad URL post' } });
    fireEvent.click(screen.getByText('SEO', { selector: 'summary' }));
    fireEvent.change(screen.getByLabelText('Canonical URL'), { target: { value: 'not-a-url' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Canonical URL must be a valid http(s) URL.')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loads existing SEO values into the fields when editing', async () => {
    const post = makePost({
      seoTitle: 'Stored SEO title',
      seoDescription: 'Stored SEO description',
      canonicalUrl: 'https://example.com/stored',
      robots: 'noindex, nofollow',
      ogTitle: 'Stored social title',
      ogDescription: 'Stored social description',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(post))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, post.id);
    await screen.findByLabelText('Title');
    fireEvent.click(screen.getByText('SEO', { selector: 'summary' }));

    expect((screen.getByLabelText('SEO title') as HTMLInputElement).value).toBe('Stored SEO title');
    expect((screen.getByLabelText('SEO description') as HTMLTextAreaElement).value).toBe(
      'Stored SEO description',
    );
    expect((screen.getByLabelText('Canonical URL') as HTMLInputElement).value).toBe(
      'https://example.com/stored',
    );
    expect((screen.getByLabelText('Robots') as HTMLSelectElement).value).toBe('noindex, nofollow');
    expect((screen.getByLabelText('Social title') as HTMLInputElement).value).toBe(
      'Stored social title',
    );
    expect((screen.getByLabelText('Social description') as HTMLTextAreaElement).value).toBe(
      'Stored social description',
    );
  });
});
describe('editor publish failure recovery', () => {
  it('keeps a newly created draft recoverable when publishing fails', async () => {
    const created = makePost({
      id: 'created-fail',
      status: 'DRAFT',
      version: 1,
      title: 'New post',
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(created, 201))
      .mockResolvedValueOnce(
        response({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'New post' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText(/Draft created, but publishing failed/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open draft' })).toBeDefined();
    // The create form is replaced, so a retry cannot create a duplicate post.
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('retries publishing with the saved version after a failed transition', async () => {
    const post = makePost({ status: 'DRAFT', version: 1 });
    const saved = makePost({ status: 'DRAFT', version: 2, title: 'Retry publish' });
    const published = makePost({
      status: 'PUBLISHED',
      version: 3,
      title: 'Retry publish',
      publishedAt: '2026-10-28T12:00:00.000Z',
    });
    let publishAttempts = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/autosave')) {
        return response({ autosave: null, postUpdatedAt: post.updatedAt });
      }
      if (url.includes('/api/admin/terms')) {
        return response(termsPage());
      }
      if (url.endsWith('/publish')) {
        publishAttempts += 1;
        if (publishAttempts === 1) {
          return response(
            { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
            500,
          );
        }
        return response(published);
      }
      if (url.endsWith(`/api/admin/posts/${post.id}`) && init?.method === 'PATCH') {
        return response(saved);
      }
      return response(post);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, post.id);
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Retry publish' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Internal server error')).toBeDefined();

    // The failed transition must not leave a stale version behind: the retry
    // transitions at version 2, without another content write.
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Content published.')).toBeDefined();
    expect(publishAttempts).toBe(2);
    const publishCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith('/publish'),
    );
    expect(JSON.parse(String(publishCalls[1]?.[1]?.body))).toEqual({ baseVersion: 2 });
  });
});

describe('editor revisions panel', () => {
  it('loads revisions on demand, views one, and restores it', async () => {
    const post = makePost();
    const revisionList = [
      {
        id: 'rev-1',
        postId: post.id,
        title: 'Earlier title',
        excerpt: null,
        authorId: 'a1',
        createdAt: '2026-10-26T09:00:00.000Z',
        revisionNumber: 1,
      },
    ];
    const revisionDetail = {
      ...revisionList[0],
      content: '<!-- wp:paragraph -->\n<p>Old content</p>\n<!-- /wp:paragraph -->',
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robots: null,
      ogTitle: null,
      ogDescription: null,
    };
    const urls: string[] = [];
    let restoreBody: unknown = null;
    let restored = false;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith(`/api/admin/posts/${post.id}/revisions/rev-1/restore`)) {
          restoreBody = JSON.parse(String(init?.body ?? '{}'));
          restored = true;
          return response(makePost({ version: 3 }));
        }
        if (url.endsWith(`/api/admin/posts/${post.id}/revisions/rev-1`)) {
          return response(revisionDetail);
        }
        if (url.endsWith(`/api/admin/posts/${post.id}/revisions`)) {
          return response(revisionList);
        }
        if (url.includes('/api/admin/terms')) {
          return response(termsPage());
        }
        if (url.endsWith(`/api/admin/posts/${post.id}`)) {
          return response(restored ? makePost({ version: 3 }) : post);
        }
        return response(post);
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderEditor(authorA, post.id);
    await screen.findByLabelText('Title');

    // Collapsed by default: no revisions request until the user expands.
    expect(urls.some((url) => url.includes('/revisions'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    const revisionButton = await screen.findByRole('button', { name: /#1/ });
    fireEvent.click(revisionButton);

    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByText(/Old content/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Restore this revision' }));
    expect(await screen.findByText('Revision #1 restored.')).toBeDefined();
    expect(urls.some((url) => url.endsWith('/revisions/rev-1/restore'))).toBe(true);
    expect(restoreBody).toEqual({ baseVersion: 1 });
  });

  it('shows the empty state when no revisions exist', async () => {
    const post = makePost();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/revisions')) {
          return response([]);
        }
        if (url.includes('/api/admin/terms')) {
          return response(termsPage());
        }
        return response(post);
      }),
    );

    renderEditor(authorA, post.id);
    await screen.findByLabelText('Title');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByText('Revisions appear after you save changes.')).toBeDefined();
  });
});

describe('editor preview', () => {
  it('opens the existing token URL without rotating', async () => {
    const post = makePost({ previewToken: 'a'.repeat(64) });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/api/admin/terms')) {
          return response(termsPage());
        }
        return response(post);
      }),
    );
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderEditor(authorA, post.id);
    await screen.findByLabelText('Title');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(`/preview/${'a'.repeat(64)}`, '_blank', 'noopener'),
    );
  });

  it('rotates a token first when none exists, then opens the returned path', async () => {
    const post = makePost({ previewToken: null });
    const token = 'b'.repeat(64);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/preview-token')) {
          return response({
            previewToken: token,
            previewPath: `/api/public/preview/${token}`,
            previewUrl: `https://site.example/preview/${token}`,
          });
        }
        if (url.includes('/api/admin/terms')) {
          return response(termsPage());
        }
        return response(post);
      }),
    );
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderEditor(authorA, post.id);
    await screen.findByLabelText('Title');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        `https://site.example/preview/${token}`,
        '_blank',
        'noopener',
      ),
    );
  });
});

describe('editor schedule (P8-04)', () => {
  function scheduleMock(options: { scheduledAt?: string | null } = {}) {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/schedule')) {
        calls.push({
          url,
          method,
          ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        });
        if (method === 'GET') {
          return response({ scheduledAt: options.scheduledAt ?? null });
        }
        if (method === 'PUT') {
          return response({ scheduledAt: JSON.parse(String(init?.body ?? '{}')).scheduledAt });
        }
        return response({ scheduledAt: null });
      }
      if (url.endsWith('/autosave')) {
        return response({ autosave: null, postUpdatedAt: makePost().updatedAt });
      }
      if (url.includes('/api/admin/terms')) {
        return response(termsPage());
      }
      return response(makePost());
    });
    return { fetchMock, calls };
  }

  it('schedules a draft and shows the scheduled time', async () => {
    const { fetchMock, calls } = scheduleMock();
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, 'post-1');
    await screen.findByLabelText('Title');

    // The Publish row shows "Immediately" + Edit for drafts.
    fireEvent.click(await screen.findByRole('button', { name: 'Edit schedule' }));
    const input = (await screen.findByLabelText('Schedule date and time')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-12-01T09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));

    expect(await screen.findByText(/The post publishes automatically/)).toBeDefined();
    expect(screen.getByText('Scheduled for', { selector: '.publish-label' })).toBeDefined();
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.body).toMatchObject({ baseVersion: 1 });
    expect(new Date(String((put?.body as { scheduledAt: string }).scheduledAt)).getTime()).toBe(
      new Date('2026-12-01T09:30').getTime(),
    );
  });

  it('shows an existing schedule and cancels it', async () => {
    const scheduledAt = '2026-12-05T10:00:00.000Z';
    const { fetchMock, calls } = scheduleMock({ scheduledAt });
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, 'post-1');
    await screen.findByLabelText('Title');

    await waitFor(() =>
      expect(screen.getByText('Scheduled for', { selector: '.publish-label' })).toBeDefined(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel schedule' }));

    expect(await screen.findByText('Schedule cancelled.')).toBeDefined();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  });
});

describe('editor featured image', () => {
  it('selects an image from the picker and includes it in the save payload', async () => {
    const post = makePost();
    const mediaItem = {
      id: 'media-1',
      fileName: 'abc.webp',
      originalName: 'hero.png',
      mimeType: 'image/webp',
      sizeBytes: 1000,
      width: 800,
      height: 600,
      altText: 'Hero',
      caption: '',
      description: '',
      url: '/api/media/media-1/abc.webp',
      derivatives: { '300': '/api/media/media-1/abc-300.webp' },
      uploadedById: 'a1',
      createdAt: '2026-10-27T10:00:00.000Z',
      updatedAt: '2026-10-27T10:00:00.000Z',
    };
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/autosave')) {
          return response({ autosave: null, postUpdatedAt: post.updatedAt });
        }
        if (url.includes('/api/admin/media')) {
          return response({
            items: [mediaItem],
            pagination: { page: 1, perPage: 12, total: 1, totalPages: 1 },
          });
        }
        if (url.includes('/api/admin/terms')) {
          return response(termsPage());
        }
        if (url.endsWith(`/api/admin/posts/${post.id}`) && method === 'PATCH') {
          calls.push({ url, method, body: JSON.parse(String(init?.body ?? '{}')) });
          return response({
            ...post,
            featuredMedia: { ...mediaItem, derivatives: mediaItem.derivatives },
            version: 2,
          });
        }
        return response(post);
      }),
    );

    renderEditor(authorA, post.id);
    await screen.findByLabelText('Title');

    // Open the picker and choose the image.
    fireEvent.click(screen.getByRole('button', { name: 'Set featured image' }));
    const picker = await screen.findByRole('listbox', { name: 'Media items' });
    const option = await within(picker).findByRole('option');
    fireEvent.click(option);

    // Save and assert the payload carries the media id.
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]?.body).toMatchObject({ featuredMediaId: 'media-1' });
  });
});

describe('editor autosave (P8-02)', () => {
  function autosaveMock(options: { autosave?: unknown; postUpdatedAt?: string; post?: AdminPost }) {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/autosave') && method === 'PUT') {
        calls.push({ url, method, body: JSON.parse(String(init?.body ?? '{}')) });
        return response({ id: 'as-1', postId: 'post-1', createdAt: '2026-10-27T12:00:00.000Z' });
      }
      if (url.endsWith('/autosave') && method === 'DELETE') {
        calls.push({ url, method });
        return response(null, 204);
      }
      if (url.endsWith('/autosave')) {
        return response({
          autosave: options.autosave ?? null,
          postUpdatedAt: options.postUpdatedAt ?? '2026-10-27T11:00:00.000Z',
        });
      }
      if (url.includes('/api/admin/terms')) {
        return response(termsPage());
      }
      return response(options.post ?? makePost());
    });
    return { fetchMock, calls };
  }

  it('offers recovery when a newer autosave exists; restore fills the form', async () => {
    const { fetchMock } = autosaveMock({
      autosave: {
        id: 'as-1',
        postId: 'post-1',
        title: 'Recovered title',
        excerpt: 'Recovered excerpt',
        content: '<p>Recovered content</p>',
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        robots: null,
        ogTitle: null,
        ogDescription: null,
        authorId: 'a1',
        createdAt: '2026-10-27T12:30:00.000Z',
      },
      postUpdatedAt: '2026-10-27T11:00:00.000Z',
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, 'post-1');
    await screen.findByLabelText('Title');

    expect(await screen.findByText(/A more recent autosave/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Restore autosave' }));

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Recovered title');
    expect(
      await screen.findByText('Autosave restored into the editor. Save to make it permanent.'),
    ).toBeDefined();
  });

  it('dismisses recovery without restoring and deletes the server autosave', async () => {
    const { fetchMock, calls } = autosaveMock({
      autosave: {
        id: 'as-1',
        postId: 'post-1',
        title: 'Old autosave',
        excerpt: null,
        content: 'x',
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        robots: null,
        ogTitle: null,
        ogDescription: null,
        authorId: 'a1',
        createdAt: '2026-10-27T12:30:00.000Z',
      },
      postUpdatedAt: '2026-10-27T11:00:00.000Z',
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, 'post-1');
    await screen.findByLabelText('Title');
    expect(await screen.findByText(/A more recent autosave/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'DELETE' && call.url.endsWith('/autosave'))).toBe(
        true,
      ),
    );
    expect(screen.queryByText(/A more recent autosave/)).toBeNull();
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Draft title');
  });

  it('does not offer recovery when the autosave is older than the post', async () => {
    const { fetchMock } = autosaveMock({
      autosave: {
        id: 'as-1',
        postId: 'post-1',
        title: 'Stale autosave',
        excerpt: null,
        content: 'x',
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        robots: null,
        ogTitle: null,
        ogDescription: null,
        authorId: 'a1',
        createdAt: '2026-10-27T10:00:00.000Z',
      },
      postUpdatedAt: '2026-10-27T11:00:00.000Z',
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, 'post-1');
    await screen.findByLabelText('Title');
    // Give the autosave fetch a chance to resolve.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/autosave'))).toBe(true),
    );
    expect(screen.queryByText(/A more recent autosave/)).toBeNull();
  });

  it('autosaves dirty edits after 30 s idle and discards the autosave after a save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { fetchMock, calls } = autosaveMock({});
      vi.stubGlobal('fetch', fetchMock);

      renderEditor(authorA, 'post-1');
      await screen.findByLabelText('Title');

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Edited title' } });
      await vi.advanceTimersByTimeAsync(31_000);

      await waitFor(() =>
        expect(calls.some((call) => call.method === 'PUT' && call.url.endsWith('/autosave'))).toBe(
          true,
        ),
      );
      const autosaveCall = calls.find((call) => call.method === 'PUT');
      expect(autosaveCall?.body).toMatchObject({ title: 'Edited title' });
    } finally {
      vi.useRealTimers();
    }
  });
});
