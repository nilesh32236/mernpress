import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAnalytics, type AnalyticsSummary } from './api.js';
import { AnalyticsPage } from './AnalyticsPage.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, fetchAnalytics: vi.fn() };
});

const summary: AnalyticsSummary = {
  days: 7,
  totalViews: 42,
  uniquePaths: 3,
  daily: [
    { day: '2026-10-30', views: 0 },
    { day: '2026-10-31', views: 4 },
    { day: '2026-11-01', views: 8 },
    { day: '2026-11-02', views: 6 },
    { day: '2026-11-03', views: 9 },
    { day: '2026-11-04', views: 7 },
    { day: '2026-11-05', views: 8 },
  ],
  topPaths: [
    { path: '/hello', views: 30 },
    { path: '/about', views: 12 },
  ],
  topReferrers: [{ host: 'example.com', views: 5 }],
};

beforeEach(() => {
  vi.mocked(fetchAnalytics).mockResolvedValue(summary);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('analytics page', () => {
  it('shows totals, daily bars, top pages and referrers', async () => {
    render(<AnalyticsPage />);

    expect(await screen.findByText('42')).toBeDefined();
    expect(screen.getByLabelText('Pages').textContent).toContain('3');
    expect(screen.getByLabelText('Average').textContent).toContain('6');
    expect(screen.getByText('/hello')).toBeDefined();
    expect(screen.getByText('example.com')).toBeDefined();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(7);
    expect(screen.getByText(/no cookies, no visitor identifiers/i)).toBeDefined();
    expect(vi.mocked(fetchAnalytics)).toHaveBeenCalledWith(7);
  });

  it('switches to the 30-day window', async () => {
    render(<AnalyticsPage />);
    await screen.findByText('42');

    fireEvent.change(screen.getByLabelText('Analytics period'), { target: { value: '30' } });

    await waitFor(() => expect(vi.mocked(fetchAnalytics)).toHaveBeenCalledWith(30));
  });

  it('shows an empty state and a retry on failure', async () => {
    vi.mocked(fetchAnalytics).mockRejectedValueOnce(new Error('boom'));
    render(<AnalyticsPage />);
    expect(await screen.findByText(/Could not reach|Cannot reach|boom/)).toBeDefined();
  });
});
