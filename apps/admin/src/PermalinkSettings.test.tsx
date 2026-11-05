import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOptions, updateOptions } from './api.js';
import { PermalinkSettings } from './PermalinkSettings.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchOptions: vi.fn(),
    updateOptions: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(fetchOptions).mockResolvedValue({
    permalink_structure: null,
    permalink_pattern: null,
    permalink_base: 'posts',
    category_base: 'category',
    tag_base: 'tag',
  });
  vi.mocked(updateOptions).mockImplementation(async (_group, values) => values);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('permalink settings', () => {
  it('saves a preset with custom category and tag bases', async () => {
    render(<PermalinkSettings />);
    await screen.findByRole('radio', { name: /Custom structure/ });

    expect(document.body.textContent).toContain('/posts/sample-post');
    fireEvent.click(screen.getByRole('radio', { name: /Month and name/ }));
    expect(document.body.textContent).toContain('/2026/01/sample-post');

    fireEvent.change(screen.getByLabelText('Category base'), { target: { value: 'sections' } });
    fireEvent.change(screen.getByLabelText('Tag base'), { target: { value: 'topics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(vi.mocked(updateOptions)).toHaveBeenCalledWith('permalinks', {
        permalink_structure: 'month',
        permalink_pattern: '/%year%/%monthnum%/%postname%/',
        category_base: 'sections',
        tag_base: 'topics',
      }),
    );
    expect(await screen.findByText('Permalink structure saved.')).toBeDefined();
  });

  it('validates the custom pattern before saving', async () => {
    render(<PermalinkSettings />);
    await screen.findByRole('radio', { name: /Custom structure/ });
    fireEvent.click(screen.getByRole('radio', { name: /Custom structure/ }));

    const pattern = document.getElementById('permalink_pattern') as HTMLInputElement;
    fireEvent.change(pattern, { target: { value: '/%year%/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText(/must contain %postname% or %post_id%/)).toBeDefined();
    expect(vi.mocked(updateOptions)).not.toHaveBeenCalled();
  });

  it('offers Plain and previews the query-string form', async () => {
    render(<PermalinkSettings />);
    await screen.findByRole('radio', { name: /Plain/ });
    fireEvent.click(screen.getByRole('radio', { name: /Plain/ }));
    expect(document.body.textContent).toContain('?p=');
  });
});
