import { describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag }));

const { POST } = await import('../app/api/revalidate/route');

const secret = 'test-revalidate-secret-2026-11-06';

function request(body: unknown, provided: string | null = secret): Request {
  return new Request('http://127.0.0.1:3000/api/revalidate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(provided === null ? {} : { 'x-revalidate-secret': provided }),
    },
    body: JSON.stringify(body),
  });
}

describe('revalidation webhook', () => {
  it('revalidates the public content tag', async () => {
    vi.stubEnv('MERNPRESS_REVALIDATE_SECRET', secret);
    const response = await POST(request({ tags: ['public-content'] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ['public-content'] });
    expect(revalidateTag).toHaveBeenCalledWith('public-content', { expire: 0 });
    vi.unstubAllEnvs();
  });

  it('rejects a missing or wrong secret', async () => {
    vi.stubEnv('MERNPRESS_REVALIDATE_SECRET', secret);
    expect((await POST(request({ tags: ['public-content'] }, null))).status).toBe(403);
    expect((await POST(request({ tags: ['public-content'] }, 'nope'))).status).toBe(403);
    expect(revalidateTag).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('rejects unknown tags and malformed bodies', async () => {
    vi.stubEnv('MERNPRESS_REVALIDATE_SECRET', secret);
    expect((await POST(request({ tags: ['everything'] }))).status).toBe(400);
    expect((await POST(request({ tags: [] }))).status).toBe(400);
    expect((await POST(request({}))).status).toBe(400);
    vi.unstubAllEnvs();
  });

  it('is disabled when no secret is configured', async () => {
    vi.stubEnv('MERNPRESS_REVALIDATE_SECRET', '');
    expect((await POST(request({ tags: ['public-content'] }))).status).toBe(503);
    vi.unstubAllEnvs();
  });
});
