import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ADMIN_ORIGIN,
  createTestApp,
  loginAs,
  seedAdmin,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
} from './helpers/auth.js';

describe('public vitals summary', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('returns aggregated p75 without paths and gates the reading setting', async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    const headers = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };

    // Two LCP samples in different buckets.
    await app.inject({
      method: 'POST',
      url: '/api/public/vitals',
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { metric: 'lcp', value: 2100 },
    });
    await app.inject({
      method: 'POST',
      url: '/api/public/vitals',
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { metric: 'lcp', value: 2600 },
    });

    const response = await app.inject({ method: 'GET', url: '/api/public/vitals-summary' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      days: number;
      vitals: Array<{ metric: string; samples: number; p75: number | null; rating: string | null }>;
    };
    expect(body.days).toBe(28);
    expect(body.vitals.map((entry) => entry.metric)).toEqual(['lcp', 'inp', 'cls', 'fcp', 'ttfb']);
    expect(body.vitals.find((entry) => entry.metric === 'lcp')).toMatchObject({
      samples: 2,
      p75: 3000,
      rating: 'needs-improvement',
    });
    expect(JSON.stringify(body)).not.toContain('/hello');
    // Site settings expose the mode (default off).
    const site = await app.inject({ method: 'GET', url: '/api/public/site' });
    expect((site.json() as { speculationMode: string }).speculationMode).toBe('off');

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers,
      payload: { group: 'reading', values: { speculation_mode: 'prerender' } },
    });
    expect(saved.statusCode).toBe(200);
    const siteAfter = await app.inject({ method: 'GET', url: '/api/public/site' });
    expect((siteAfter.json() as { speculationMode: string }).speculationMode).toBe('prerender');

    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers,
      payload: { group: 'reading', values: { speculation_mode: 'eager' } },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
