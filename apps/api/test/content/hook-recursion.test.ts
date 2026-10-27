import { describe, expect, it } from 'vitest';
import { createHookRegistry, HookRejectedError } from '@mernpress/cms-core';

describe('hook registry recursion depth accounting', () => {
  it('respects the configured depth limit for recursively invoked actions', async () => {
    const registry = createHookRegistry({ maxDepth: 2, logger: { warn: () => undefined } });
    let calls = 0;

    registry.addAction('content.post.created', async () => {
      calls += 1;
      await registry.doAction('content.post.created', {} as never);
    });

    await registry.doAction('content.post.created', {} as never);

    // With maxDepth 2, each invocation enters twice (outer + one recursion)
    // before the guard rejects the next. Repeated invocations must not grow.
    // A single invocation therefore yields exactly 2 handler calls.
    expect(calls).toBe(2);
    registry.dispose();
  });

  it('restores the depth counter after a rejected recursive invocation', async () => {
    const registry = createHookRegistry({ maxDepth: 2, logger: { warn: () => undefined } });
    let calls = 0;

    registry.addAction('content.post.created', async () => {
      calls += 1;
      await registry.doAction('content.post.created', {} as never);
    });

    await registry.doAction('content.post.created', {} as never);
    const afterFirst = calls;

    // A second, independent invocation must produce the same number of calls,
    // proving the counter was restored (not decremented twice into negatives).
    await registry.doAction('content.post.created', {} as never);
    expect(calls - afterFirst).toBe(2);
    registry.dispose();
  });

  it('repeated recursive invocations cannot gradually bypass the guard', async () => {
    const registry = createHookRegistry({ maxDepth: 2, logger: { warn: () => undefined } });
    let calls = 0;

    registry.addAction('content.post.created', async () => {
      calls += 1;
      await registry.doAction('content.post.created', {} as never);
    });

    for (let i = 0; i < 5; i += 1) {
      await registry.doAction('content.post.created', {} as never);
    }
    // Each invocation contributes exactly 2 calls; no drift.
    expect(calls).toBe(10);
    registry.dispose();
  });

  it('subsequent ordinary hooks still execute correctly', async () => {
    const registry = createHookRegistry({ maxDepth: 2, logger: { warn: () => undefined } });
    const calls: string[] = [];

    registry.addAction('content.post.created', async () => {
      calls.push('recurse');
      await registry.doAction('content.post.created', {} as never);
    });
    registry.addAction('content.post.updated', () => {
      calls.push('ordinary');
    });

    await registry.doAction('content.post.created', {} as never);
    await registry.doAction('content.post.updated', {} as never);

    expect(calls).toContain('ordinary');
    registry.dispose();
  });

  it('filter recursion still works and post-commit actions still fire', async () => {
    const registry = createHookRegistry({ maxDepth: 8, logger: { warn: () => undefined } });
    const actions: string[] = [];

    registry.addFilter('content.post.create', (draft) => ({ ...draft, title: `${draft.title}+1` }));
    registry.addAction('content.post.created', () => {
      actions.push('content.post.created');
    });

    const result = await registry.applyFilters('content.post.create', {
      type: 'post',
      title: 't',
      slug: 's',
      excerpt: null,
      content: '',
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robots: null,
      ogTitle: null,
      ogDescription: null,
    });
    expect((result as { title: string }).title).toBe('t+1');

    await registry.doAction('content.post.created', {} as never);
    expect(actions).toEqual(['content.post.created']);
    registry.dispose();
  });

  it('HookRejectedError is thrown when applyFilters exceeds depth', async () => {
    const registry = createHookRegistry({ maxDepth: 2, logger: { warn: () => undefined } });
    const baseDraft = {
      type: 'post' as const,
      title: 't',
      slug: 's',
      excerpt: null,
      content: '',
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robots: null,
      ogTitle: null,
      ogDescription: null,
    };
    registry.addFilter('content.post.create', async (draft) => {
      return registry.applyFilters('content.post.create', draft);
    });

    await expect(registry.applyFilters('content.post.create', baseDraft)).rejects.toBeInstanceOf(
      HookRejectedError,
    );
    registry.dispose();
  });

  it('restores filter depth after a rejected recursive filter chain', async () => {
    const registry = createHookRegistry({ maxDepth: 2, logger: { warn: () => undefined } });
    const baseDraft = {
      type: 'post' as const,
      title: 't',
      slug: 's',
      excerpt: null,
      content: '',
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      robots: null,
      ogTitle: null,
      ogDescription: null,
    };
    let calls = 0;
    const unsubscribe = registry.addFilter('content.post.create', async (draft) => {
      calls += 1;
      return registry.applyFilters('content.post.create', draft);
    });

    await expect(registry.applyFilters('content.post.create', baseDraft)).rejects.toBeInstanceOf(
      HookRejectedError,
    );
    unsubscribe();

    // A second independent chain must still be limited to two entries. If the
    // rejected chain had decremented depth twice, this would allow three.
    calls = 0;
    registry.addFilter('content.post.create', async (draft) => {
      calls += 1;
      return registry.applyFilters('content.post.create', draft);
    });
    await expect(registry.applyFilters('content.post.create', baseDraft)).rejects.toBeInstanceOf(
      HookRejectedError,
    );
    expect(calls).toBe(2);
    registry.dispose();
  });
});
