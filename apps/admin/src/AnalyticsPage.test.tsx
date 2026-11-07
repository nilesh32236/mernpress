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
  byTemplate: [
    {
      template: 'post',
      label: 'Post',
      samples: 24,
      vitals: [
        {
          metric: 'lcp',
          label: 'Largest Contentful Paint',
          p75: 3000,
          rating: 'needs-improvement',
          samples: 12,
        },
        {
          metric: 'inp',
          label: 'Interaction to Next Paint',
          p75: 200,
          rating: 'good',
          samples: 12,
        },
        { metric: 'cls', label: 'Cumulative Layout Shift', p75: null, rating: null, samples: 0 },
        { metric: 'fcp', label: 'First Contentful Paint', p75: null, rating: null, samples: 0 },
        { metric: 'ttfb', label: 'Time to First Byte', p75: null, rating: null, samples: 0 },
      ],
    },
  ],
  vitals: [
    { metric: 'lcp', label: 'Largest Contentful Paint', p75: 2000, rating: 'good', samples: 12 },
    {
      metric: 'inp',
      label: 'Interaction to Next Paint',
      p75: 400,
      rating: 'needs-improvement',
      samples: 9,
    },
    {
      metric: 'cls',
      label: 'Cumulative Layout Shift',
      p75: 120,
      rating: 'needs-improvement',
      samples: 12,
    },
    { metric: 'fcp', label: 'First Contentful Paint', p75: 1200, rating: 'good', samples: 12 },
    { metric: 'ttfb', label: 'Time to First Byte', p75: 2400, rating: 'poor', samples: 12 },
  ],
};

beforeEach(() => {
  vi.mocked(fetchAnalytics).mockResolvedValue(summary);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/admin/analytics');
});

describe('analytics page', () => {
  it('shows totals, daily bars, top pages and referrers', async () => {
    render(<AnalyticsPage />);

    expect(await screen.findByText('42')).toBeDefined();
    expect(screen.getByLabelText('Pages viewed').textContent).toContain('3');
    expect(screen.getByLabelText('Daily average').textContent).toContain('6');
    expect(screen.getByText('/hello')).toBeDefined();
    expect(screen.getByText('example.com')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Core Web Vitals (field data)' })).toBeDefined();
    expect(screen.getByText('2 s')).toBeDefined();
    expect(screen.getByText('400 ms')).toBeDefined();
    expect(screen.getByText('0.12')).toBeDefined();
    expect(screen.getByText('2.4 s')).toBeDefined();
    expect(screen.getAllByText('needs improvement').length).toBe(2);
    expect(screen.getByText('poor')).toBeDefined();
    expect(screen.getAllByText('12 samples').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'By template' })).toBeDefined();
    expect(screen.getByText('3 s')).toBeDefined();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(7);
    expect(screen.getByText(/no cookies, no visitor identifiers/i)).toBeDefined();
    expect(vi.mocked(fetchAnalytics)).toHaveBeenCalledWith(7);
  });

  it('switches to the 30-day window', async () => {
    render(<AnalyticsPage />);
    await screen.findByText('42');

    fireEvent.change(screen.getByLabelText('Analytics period'), { target: { value: '30' } });

    await waitFor(() => expect(vi.mocked(fetchAnalytics)).toHaveBeenCalledWith(30));
    expect(window.location.search).toBe('?days=30');
  });

  it('reads the period from the URL on load', async () => {
    window.history.replaceState(null, '', '/admin/analytics?days=30');
    render(<AnalyticsPage />);
    await screen.findByText('42');
    expect(vi.mocked(fetchAnalytics)).toHaveBeenCalledWith(30);
    expect((screen.getByLabelText('Analytics period') as HTMLSelectElement).value).toBe('30');
  });

  it('uses one consistent empty state', async () => {
    vi.mocked(fetchAnalytics).mockResolvedValue({
      ...summary,
      totalViews: 0,
      uniquePaths: 0,
      daily: summary.daily.map((entry) => ({ ...entry, views: 0 })),
      topPaths: [],
      topReferrers: [],
      vitals: summary.vitals.map((entry) => ({ ...entry, p75: null, rating: null, samples: 0 })),
    });
    render(<AnalyticsPage />);
    expect((await screen.findAllByText('No page views in this period.')).length).toBeGreaterThan(0);
    expect(screen.getByText('No external referrers in this period.')).toBeDefined();
    expect(screen.getByText(/No field samples in this period/)).toBeDefined();
  });

  it('shows an empty state and a retry on failure', async () => {
    vi.mocked(fetchAnalytics).mockRejectedValueOnce(new Error('boom'));
    render(<AnalyticsPage />);
    expect(await screen.findByText(/Could not reach|Cannot reach|boom/)).toBeDefined();
  });
});
