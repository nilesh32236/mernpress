import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  fetchCustomizer,
  fetchOptions,
  fetchPosts,
  fetchThemes,
  updateCustomizer,
  updateOptions,
  type AdminPost,
  type CustomizerSettings,
} from './api.js';
import { CustomizePage } from './CustomizePage.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchOptions: vi.fn(),
    fetchCustomizer: vi.fn(),
    fetchPosts: vi.fn(),
    fetchThemes: vi.fn(),
    updateCustomizer: vi.fn(),
    updateOptions: vi.fn(),
  };
});

function page(id: string, title: string): AdminPost {
  return {
    id,
    type: 'page',
    status: 'PUBLISHED',
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    excerpt: null,
    content: '',
    contentFormat: 'wp_block_html',
    contentVersion: 1,
    authorId: null,
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    robots: null,
    ogTitle: null,
    ogDescription: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    terms: { categories: [], tags: [] },
    featuredMedia: null,
    author: null,
  };
}

const emptySettings: CustomizerSettings = {
  colors: null,
  menu: null,
  css: null,
  showOnFront: 'posts',
  pageOnFront: null,
  pageForPosts: null,
};

beforeEach(() => {
  vi.mocked(fetchOptions).mockResolvedValue({ site_title: 'Example', site_tagline: 'Writing' });
  vi.mocked(fetchCustomizer).mockResolvedValue(emptySettings);
  vi.mocked(fetchPosts).mockResolvedValue({
    items: [
      page('p1', 'Home Page'),
      page('p2', 'Blog Page'),
      { ...page('p3', 'Bin'), status: 'TRASHED' },
    ],
    pagination: { page: 1, perPage: 100, total: 3, totalPages: 1 },
  });
  vi.mocked(fetchThemes).mockResolvedValue({ themes: [], active: 'mernpress' });
  vi.mocked(updateCustomizer).mockImplementation(async (settings) => settings);
  vi.mocked(updateOptions).mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('customize page', () => {
  it('lists the panels and saves colours', async () => {
    render(<CustomizePage />);
    await screen.findByRole('heading', { name: 'Customizing: MERNPress' });

    for (const label of [
      'Site Identity',
      'Colors',
      'Menus',
      'Homepage Settings',
      'Additional CSS',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeDefined();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Colors' }));
    fireEvent.change(screen.getByLabelText('Background'), { target: { value: '#f7f2e8' } });
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#8a3b2e' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Publish' }));

    await waitFor(() =>
      expect(vi.mocked(updateCustomizer)).toHaveBeenCalledWith({
        colors: { background: '#f7f2e8', accent: '#8a3b2e' },
        menu: null,
        css: null,
        showOnFront: 'posts',
        pageOnFront: null,
        pageForPosts: null,
      }),
    );
    expect(await screen.findByText('Colors saved.')).toBeDefined();
  });

  it('rejects a non-hex colour before calling the API', async () => {
    render(<CustomizePage />);
    await screen.findByRole('heading', { name: 'Customizing: MERNPress' });
    fireEvent.click(screen.getByRole('button', { name: 'Colors' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'red' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Publish' }));

    expect(await screen.findByText('Colors must be hex values such as #1d2327.')).toBeDefined();
    expect(vi.mocked(updateCustomizer)).not.toHaveBeenCalled();
  });

  it('adds, reorders and saves menu items', async () => {
    render(<CustomizePage />);
    await screen.findByRole('heading', { name: 'Customizing: MERNPress' });
    fireEvent.click(screen.getByRole('button', { name: 'Menus' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add menu item' }));
    fireEvent.change(screen.getAllByLabelText('Label')[0]!, { target: { value: 'About' } });
    fireEvent.change(screen.getAllByLabelText('URL')[0]!, { target: { value: '/about' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add menu item' }));
    fireEvent.change(screen.getAllByLabelText('Label')[1]!, { target: { value: 'Docs' } });
    fireEvent.change(screen.getAllByLabelText('URL')[1]!, {
      target: { value: 'https://example.com/docs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move Docs up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save & Publish' }));

    await waitFor(() =>
      expect(vi.mocked(updateCustomizer)).toHaveBeenCalledWith(
        expect.objectContaining({
          menu: [
            { label: 'Docs', url: 'https://example.com/docs' },
            { label: 'About', url: '/about' },
          ],
        }),
      ),
    );
  });

  it('requires a homepage for a static front page and clears selections for latest posts', async () => {
    render(<CustomizePage />);
    await screen.findByRole('heading', { name: 'Customizing: MERNPress' });
    fireEvent.click(screen.getByRole('button', { name: 'Homepage Settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'A static page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save & Publish' }));

    expect(
      await screen.findByText('Choose a homepage or switch back to latest posts.'),
    ).toBeDefined();
    expect(vi.mocked(updateCustomizer)).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Homepage'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Posts page'), { target: { value: 'p2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Publish' }));
    await waitFor(() =>
      expect(vi.mocked(updateCustomizer)).toHaveBeenCalledWith({
        colors: null,
        menu: null,
        css: null,
        showOnFront: 'page',
        pageOnFront: 'p1',
        pageForPosts: 'p2',
      }),
    );

    // Trashed pages never appear in the selectors.
    expect(screen.queryByRole('option', { name: 'Bin' })).toBeNull();
  });

  it('saves Additional CSS and reports a server rejection', async () => {
    vi.mocked(updateCustomizer).mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_ERROR', 'Additional CSS contains a disallowed construct.'),
    );
    render(<CustomizePage />);
    await screen.findByRole('heading', { name: 'Customizing: MERNPress' });
    fireEvent.click(screen.getByRole('button', { name: 'Additional CSS' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Additional CSS' }), {
      target: { value: '.site-title { letter-spacing: 1px; }' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Publish' }));
    await waitFor(() =>
      expect(vi.mocked(updateCustomizer)).toHaveBeenCalledWith(
        expect.objectContaining({ css: '.site-title { letter-spacing: 1px; }' }),
      ),
    );
    expect(
      await screen.findByText('Additional CSS contains a disallowed construct.'),
    ).toBeDefined();
  });
});
