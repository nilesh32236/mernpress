import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsNewsWidget } from './EventsNewsWidget.js';
import type { DashboardFeeds } from './api.js';

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const feeds: DashboardFeeds = {
  events: [
    {
      title: 'WordCamp Manchester 2026',
      url: 'https://manchester.wordcamp.org/2026/',
      location: 'Manchester, UK',
      date: '2026-11-06 00:00:00',
    },
  ],
  news: [
    {
      title: 'WordPress 7.2 Beta 4',
      url: 'https://wordpress.org/news/2026/11/beta/',
      publishedAt: '2026-11-03T10:00:00.000Z',
    },
  ],
  eventsConfigured: true,
  newsConfigured: true,
  eventsError: null,
  newsError: null,
  location: 'Manchester',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('events and news widget', () => {
  it('renders event rows, news links and the WordPress footer links', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...feeds, location: '' }));
    render(<EventsNewsWidget />);

    expect(await screen.findByText('WordCamp Manchester 2026')).toBeDefined();
    expect(screen.getByText('Manchester, UK')).toBeDefined();
    expect(screen.getByText('WordPress 7.2 Beta 4')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Meetups' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'WordCamps' })).toBeDefined();
  });

  it('searches events for a typed location', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(response(feeds));
    render(<EventsNewsWidget />);
    await screen.findByText('WordPress 7.2 Beta 4');

    fireEvent.click(screen.getByRole('button', { name: /Select location/ }));
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Manchester' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Find events' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/admin/dashboard/feeds?location=Manchester',
        expect.anything(),
      ),
    );
  });

  it('shows the location hint when no location is chosen', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        ...feeds,
        events: [],
        eventsError: 'Choose a location to see nearby events.',
      }),
    );
    render(<EventsNewsWidget />);
    expect(await screen.findByText('Choose a location to see nearby events.')).toBeDefined();
  });
});
