import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportPage } from './ImportPage.js';

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

beforeEach(() => {
  document.cookie = 'mernpress_csrf=test-token';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('import screen', () => {
  it('lists the WordPress importer and reports unavailable importers', () => {
    render(<ImportPage />);
    expect(screen.getByText('WordPress')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Run Importer' })).toBeDefined();
    expect(screen.getAllByText('Not available in this build').length).toBeGreaterThan(3);
  });

  it('uploads a WXR file and reports the result', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      response({ imported: 2, posts: 1, pages: 1, terms: 2, skipped: 1, failed: 0, errors: [] }),
    );

    render(<ImportPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Run Importer' }));

    const xml = '<rss><channel><item><title>x</title></item></channel></rss>';
    const file = new File([xml], 'export.xml', { type: 'text/xml' });
    Object.defineProperty(file, 'text', { value: async () => xml });
    fireEvent.change(screen.getByLabelText('Import file'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Selected: export.xml/)).toBeDefined());
    fireEvent.submit(screen.getByRole('form', { name: 'Import WordPress' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/import/wordpress',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      await screen.findByText(
        /Import finished: 1 post, 1 page, 2 terms\. 1 item skipped, 0 failed\./,
      ),
    ).toBeDefined();
  });
});
