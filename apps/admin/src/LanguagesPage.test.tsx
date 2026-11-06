import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLanguageMenus,
  fetchLanguages,
  fetchThemeStrings,
  updateLanguageMenus,
  updateLanguages,
  updateThemeStrings,
} from './api.js';
import { LanguagesPage } from './LanguagesPage.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchLanguages: vi.fn(),
    updateLanguages: vi.fn(),
    fetchThemeStrings: vi.fn(),
    updateThemeStrings: vi.fn(),
    fetchLanguageMenus: vi.fn(),
    updateLanguageMenus: vi.fn(),
  };
});

const stringPayload = {
  strings: {},
  defaults: { skipToContent: 'Skip to content', blog: 'Blog', home: 'Home' },
  keys: [
    { key: 'skipToContent', label: 'Skip link', fallback: 'Skip to content', max: 80 },
    { key: 'blog', label: 'Blog link', fallback: 'Blog', max: 40 },
  ],
};

beforeEach(() => {
  vi.mocked(fetchLanguages).mockResolvedValue({ default: 'en', enabled: ['en'] });
  vi.mocked(updateLanguages).mockImplementation(async (config) => config);
  vi.mocked(fetchThemeStrings).mockResolvedValue(stringPayload);
  vi.mocked(updateThemeStrings).mockImplementation(async (language, strings) => ({
    strings: { [language]: strings },
  }));
  vi.mocked(fetchLanguageMenus).mockResolvedValue({
    menus: null,
    default: 'en',
    enabled: ['en'],
  });
  vi.mocked(updateLanguageMenus).mockImplementation(async (language, menu) => ({
    menus: { [language]: menu },
  }));
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
  it('saves per-language theme strings', async () => {
    render(<LanguagesPage />);
    await screen.findByRole('heading', { level: 1, name: 'Languages' });
    await screen.findByRole('heading', { level: 2, name: 'Theme strings' });

    fireEvent.change(await screen.findByLabelText('Blog link'), {
      target: { value: 'Journal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save strings' }));

    await waitFor(() =>
      expect(vi.mocked(updateThemeStrings)).toHaveBeenCalledWith('en', { blog: 'Journal' }),
    );
    expect(await screen.findByText('Theme strings saved.')).toBeDefined();
  });

  it('saves a menu override for a non-default language', async () => {
    vi.mocked(fetchLanguages).mockResolvedValue({ default: 'en', enabled: ['en', 'hi'] });
    vi.mocked(fetchLanguageMenus).mockResolvedValue({
      menus: null,
      default: 'en',
      enabled: ['en', 'hi'],
    });
    render(<LanguagesPage />);
    await screen.findByRole('heading', { level: 2, name: 'Language menu' });

    fireEvent.click(screen.getByRole('button', { name: 'Add menu item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add menu item' }));
    const items = document.querySelectorAll('.customize-menu-item');
    // Reordering swaps rows by index; each row keeps its own inputs.
    fireEvent.change(within(items[0] as HTMLElement).getByLabelText('Navigation label'), {
      target: { value: 'होम' },
    });
    fireEvent.change(within(items[0] as HTMLElement).getByLabelText('URL'), {
      target: { value: '/hi' },
    });
    fireEvent.change(within(items[1] as HTMLElement).getByLabelText('Navigation label'), {
      target: { value: 'ब्लॉग' },
    });
    fireEvent.change(within(items[1] as HTMLElement).getByLabelText('URL'), {
      target: { value: '/hi/posts' },
    });
    fireEvent.click(within(items[1] as HTMLElement).getByRole('button', { name: /^Move up/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save menu' }));

    await waitFor(() =>
      expect(vi.mocked(updateLanguageMenus)).toHaveBeenCalledWith('hi', [
        { label: 'ब्लॉग', url: '/hi/posts' },
        { label: 'होम', url: '/hi' },
      ]),
    );
    expect(await screen.findByText('Language menu saved.')).toBeDefined();
  });
  it('groups theme strings and filters them', async () => {
    render(<LanguagesPage />);
    await screen.findByRole('heading', { level: 2, name: 'Theme strings' });
    expect(
      await screen.findByRole('heading', { level: 3, name: /Header and navigation/ }),
    ).toBeDefined();
    expect(screen.getByLabelText('Blog link')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Find a string'), { target: { value: 'zzz' } });
    expect(screen.queryByRole('heading', { level: 3, name: /Header and navigation/ })).toBeNull();
    expect(screen.queryByLabelText('Blog link')).toBeNull();
  });
});
