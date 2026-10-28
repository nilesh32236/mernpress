import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'Hello content' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/admin/posts');
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      type: 'post',
      title: 'New title',
      slug: 'new-title',
      excerpt: 'Short excerpt',
      content: 'Hello content',
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
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));

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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(post))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(
        response({ error: { code: 'VERSION_CONFLICT', message: 'Version conflict' } }, 409),
      );
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
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/admin/posts/post-1');
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toMatchObject({
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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(post))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(published));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, post.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Content published.')).toBeDefined();
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/admin/posts/post-1/publish');
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
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(post))
      .mockResolvedValueOnce(response(termsPage([category])))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response({ ...post, title: 'Term post updated', version: 2 }))
      .mockResolvedValueOnce(
        response({ error: { code: 'TERM_NOT_FOUND', message: 'Term not found' } }, 400),
      );
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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(post))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(saved))
      .mockResolvedValueOnce(response(published));
    vi.stubGlobal('fetch', fetchMock);

    renderEditor(authorA, post.id);
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: 'Publish after edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Content published.')).toBeDefined();
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/admin/posts/post-1');
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toMatchObject({
      baseVersion: 1,
      title: 'Publish after edit',
    });
    expect(fetchMock.mock.calls[4]?.[0]).toBe('/api/admin/posts/post-1/publish');
    expect(JSON.parse(String(fetchMock.mock.calls[4]?.[1]?.body))).toEqual({ baseVersion: 2 });
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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(post))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(termsPage()))
      .mockResolvedValueOnce(response(saved))
      .mockResolvedValueOnce(
        response({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500),
      )
      .mockResolvedValueOnce(response(published));
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
    expect(fetchMock.mock.calls[5]?.[0]).toBe('/api/admin/posts/post-1/publish');
    expect(JSON.parse(String(fetchMock.mock.calls[5]?.[1]?.body))).toEqual({ baseVersion: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
