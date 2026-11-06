import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLanguages, updateLanguages } from './api.js';
import { LanguagesPage } from './LanguagesPage.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, fetchLanguages: vi.fn(), updateLanguages: vi.fn() };
});

beforeEach(() => {
  vi.mocked(fetchLanguages).mockResolvedValue({ default: 'en', enabled: ['en'] });
  vi.mocked(updateLanguages).mockImplementation(async (config) => config);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('languages settings page', () => {
  it('enables a language and saves the list', async () => {
    render(<LanguagesPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Languages' })).toBeDefined();
    expect(vi.mocked(fetchLanguages)).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Hindi (hi)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(vi.mocked(updateLanguages)).toHaveBeenCalledWith({
        default: 'en',
        enabled: ['en', 'hi'],
      }),
    );
    expect(await screen.findByText('Language settings saved.')).toBeDefined();
  });

  it('adds a custom language code', async () => {
    render(<LanguagesPage />);
    await screen.findByRole('heading', { level: 1, name: 'Languages' });

    fireEvent.change(screen.getByLabelText('Custom language code'), {
      target: { value: 'pt-br' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(vi.mocked(updateLanguages)).toHaveBeenCalledWith({
        default: 'en',
        enabled: ['en', 'pt-br'],
      }),
    );
  });

  it('rejects an invalid custom code', async () => {
    render(<LanguagesPage />);
    await screen.findByRole('heading', { level: 1, name: 'Languages' });

    fireEvent.change(screen.getByLabelText('Custom language code'), {
      target: { value: 'not a code' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add code' }));

    expect(await screen.findByText(/Use a language code such as/)).toBeDefined();
    expect(vi.mocked(updateLanguages)).not.toHaveBeenCalled();
  });
});
