import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONSENT } from '@mernpress/contracts';
import { ApiError, fetchConsent, updateConsent } from './api.js';
import { ConsentPage } from './ConsentPage.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, fetchConsent: vi.fn(), updateConsent: vi.fn() };
});

beforeEach(() => {
  vi.mocked(fetchConsent).mockResolvedValue(DEFAULT_CONSENT);
  vi.mocked(updateConsent).mockImplementation(async (config) => config);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('consent settings page', () => {
  it('loads, previews and saves the banner configuration', async () => {
    render(<ConsentPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Consent' })).toBeDefined();
    expect(vi.mocked(fetchConsent)).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Show the cookie banner on the public site'));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Cookies on this site' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Choose which optional storage you allow.' },
    });
    fireEvent.click(
      screen.getByLabelText('Require analytics consent before the local page-view beacon runs'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(vi.mocked(updateConsent)).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          title: 'Cookies on this site',
          analyticsRequired: true,
        }),
      ),
    );
    expect(await screen.findByText('Consent settings saved.')).toBeDefined();
    expect(screen.getByText('Cookies on this site')).toBeDefined();
  });

  it('requires a title and message before saving', async () => {
    render(<ConsentPage />);
    await screen.findByRole('heading', { level: 1, name: 'Consent' });

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('A title and message are required.')).toBeDefined();
    expect(vi.mocked(updateConsent)).not.toHaveBeenCalled();
  });

  it('shows a server validation message', async () => {
    vi.mocked(updateConsent).mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_ERROR', 'message must be shorter than 500 characters'),
    );
    render(<ConsentPage />);
    await screen.findByRole('heading', { level: 1, name: 'Consent' });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText('message must be shorter than 500 characters')).toBeDefined();
  });
});
