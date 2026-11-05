import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrivacyPolicyPage, fetchOptions, fetchPosts, setPrivacyPolicyPage } from './api.js';
import { OptionGroupForm } from './OptionGroupForm.js';
import type { AdminPost } from './api.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchOptions: vi.fn(),
    fetchPosts: vi.fn(),
    updateOptions: vi.fn(),
    createPrivacyPolicyPage: vi.fn(),
    setPrivacyPolicyPage: vi.fn(),
  };
});

function paged(items: AdminPost[]) {
  return {
    items,
    pagination: { page: 1, perPage: 100, total: items.length, totalPages: 1 },
  };
}

const existingPage = {
  id: 'p2',
  type: 'page' as const,
  status: 'DRAFT' as const,
  title: 'Existing policy',
  slug: 'existing-policy',
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
  publishedAt: null,
  commentStatus: 'open' as const,
  sticky: false,
  notesNotify: null,
  structureLocked: false,
  passwordProtected: false,
  isPrivate: false,
  format: 'standard' as const,
  trashedAt: null,
  previousStatus: null,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  terms: { categories: [], tags: [] },
  featuredMedia: null,
  author: null,
};

beforeEach(() => {
  vi.mocked(fetchOptions).mockResolvedValue({ wp_page_for_privacy_policy: null });
  vi.mocked(fetchPosts).mockResolvedValue(
    paged([
      existingPage,
      { ...existingPage, id: 'p3', status: 'TRASHED', title: 'Trashed page', slug: 'trashed' },
    ]),
  );
  vi.mocked(createPrivacyPolicyPage).mockResolvedValue({
    pageId: 'p1',
    page: { ...existingPage, id: 'p1', title: 'Privacy Policy', slug: 'privacy-policy' } as never,
  });
  vi.mocked(setPrivacyPolicyPage).mockResolvedValue({ pageId: 'p2' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('privacy policy helpers', () => {
  it('creates a policy page from the template and selects it', async () => {
    render(<OptionGroupForm group="privacy" />);

    const create = await screen.findByRole('button', {
      name: 'Create a new Privacy Policy page',
    });
    fireEvent.click(create);

    await waitFor(() => expect(vi.mocked(createPrivacyPolicyPage)).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Privacy Policy page created.')).toBeDefined();
    expect((screen.getByLabelText('Privacy Policy page') as HTMLSelectElement).value).toBe('p1');
    expect(screen.getByRole('link', { name: 'Edit page' }).getAttribute('href')).toBe(
      '/admin/pages/p1/edit',
    );
    expect(screen.getByRole('link', { name: 'View page' }).getAttribute('href')).toBe(
      '/privacy-policy',
    );
    // Trashed pages never appear in the selector.
    expect(screen.queryByRole('option', { name: 'Trashed page' })).toBeNull();
  });

  it('applies the selected page with Use This Page', async () => {
    render(<OptionGroupForm group="privacy" />);
    await screen.findByRole('option', { name: 'Existing policy' });

    fireEvent.change(screen.getByLabelText('Privacy Policy page'), {
      target: { value: 'p2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use This Page' }));

    await waitFor(() => expect(vi.mocked(setPrivacyPolicyPage)).toHaveBeenCalledWith('p2'));
    expect(await screen.findByText('Privacy Policy page updated.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Edit page' }).getAttribute('href')).toBe(
      '/admin/pages/p2/edit',
    );
  });
});
