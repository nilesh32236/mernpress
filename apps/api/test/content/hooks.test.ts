import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  HookRejectedError,
  type PostActionPayload,
  type PostFilterDraft,
} from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from '../helpers/auth.js';

interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string };
}

interface AdminPostShape {
  id: string;
  title: string;
  slug: string;
  version: number;
}

describe('content hooks (app.contentHooks)', () => {
  let app: FastifyInstance;
  let cookieHeader: string;
  let csrfToken: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookieHeader = session.cookieHeader;
    csrfToken = session.csrfToken;
  });

  afterEach(async () => {
    await app.close();
  });

  function adminHeaders(): Record<string, string> {
    return {
      cookie: cookieHeader,
      'x-csrf-token': csrfToken,
      origin: ADMIN_ORIGIN,
      'content-type': 'application/json',
    };
  }

  async function createPost(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: adminHeaders(),
      payload,
    });
  }

  it('runs filters in priority order with stable registration order within one priority', async () => {
    // Registered in "wrong" order on purpose: the priority-10 filter is added
    // first but must run LAST; the two priority-5 filters must run before it and
    // in their own registration order (p5-first added before p5-second).
    app.contentHooks.addFilter(
      'content.post.create',
      (draft: PostFilterDraft) => ({ ...draft, title: `${draft.title}|p10` }),
      10,
    );
    app.contentHooks.addFilter(
      'content.post.create',
      (draft: PostFilterDraft) => ({ ...draft, title: `${draft.title}|p5-first` }),
      5,
    );
    app.contentHooks.addFilter(
      'content.post.create',
      (draft: PostFilterDraft) => ({ ...draft, title: `${draft.title}|p5-second` }),
      5,
    );

    const response = await createPost({ type: 'post', title: 'start' });

    expect(response.statusCode).toBe(201);
    // Priority 5 runs before priority 10; within priority 5, registration order holds.
    expect((response.json() as AdminPostShape).title).toBe('start|p5-first|p5-second|p10');
  });

  it('awaits async filters', async () => {
    app.contentHooks.addFilter('content.post.create', async (draft: PostFilterDraft) => {
      await Promise.resolve();
      return { ...draft, title: 'async title' };
    });

    const response = await createPost({ type: 'post', title: 'sync title' });

    expect(response.statusCode).toBe(201);
    expect((response.json() as AdminPostShape).title).toBe('async title');
  });

  it('revalidates the filtered draft: an invalid (empty) title rejects the create with 400 VALIDATION_ERROR', async () => {
    app.contentHooks.addFilter('content.post.create', (draft: PostFilterDraft) => ({
      ...draft,
      title: '',
    }));

    const response = await createPost({ type: 'post', title: 'Valid title' });

    expect(response.statusCode).toBe(400);
    expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    expect(await app.database.post.count()).toBe(0);
  });

  it('maps a filter veto (HookRejectedError) to 400 HOOK_REJECTED', async () => {
    app.contentHooks.addFilter('content.post.create', () => {
      throw new HookRejectedError('vetoed by test');
    });

    const response = await createPost({ type: 'post', title: 'Veto me' });

    expect(response.statusCode).toBe(400);
    expect((response.json() as ErrorEnvelope).error.code).toBe('HOOK_REJECTED');
    expect(await app.database.post.count()).toBe(0);
  });

  it('fires the created action only after a successful commit, with the post id in the payload', async () => {
    const seen: PostActionPayload[] = [];
    app.contentHooks.addAction('content.post.created', (payload: PostActionPayload) => {
      seen.push(payload);
    });

    const created = await createPost({ type: 'post', title: 'Fires action', slug: 'fires-action' });
    expect(created.statusCode).toBe(201);
    const post = created.json() as AdminPostShape;

    expect(seen).toHaveLength(1);
    expect(seen[0]?.postId).toBe(post.id);
    expect(seen[0]?.slug).toBe('fires-action');
    expect(seen[0]?.status).toBe('DRAFT');

    // A failed create (duplicate explicit slug) must NOT fire the action.
    const duplicate = await createPost({ type: 'post', title: 'Dupe', slug: 'fires-action' });
    expect(duplicate.statusCode).toBe(409);
    expect(seen).toHaveLength(1);
  });

  it('contains action failures: a throwing action does not fail the committed write', async () => {
    app.contentHooks.addAction('content.post.created', () => {
      throw new Error('action blew up');
    });

    const response = await createPost({ type: 'post', title: 'Survives bad action' });

    expect(response.statusCode).toBe(201);
    expect(await app.database.post.count()).toBe(1);
  });

  it('guards against re-entrant filter recursion and maps it to 400 HOOK_REJECTED', async () => {
    // The filter re-enters applyFilters on the same hook; the registry's depth
    // guard (maxDepth 8) trips and raises HookRejectedError.
    app.contentHooks.addFilter('content.post.create', async (draft: PostFilterDraft) => {
      return app.contentHooks.applyFilters('content.post.create', draft);
    });

    const response = await createPost({ type: 'post', title: 'Recursive' });

    expect(response.statusCode).toBe(400);
    expect((response.json() as ErrorEnvelope).error.code).toBe('HOOK_REJECTED');
    expect(await app.database.post.count()).toBe(0);
  });

  it('contains a filter bug: a generic throw is logged and the write proceeds unfiltered', async () => {
    app.contentHooks.addFilter('content.post.create', () => {
      throw new Error('plugin blew up');
    });

    const response = await createPost({ type: 'post', title: 'Survives bad filter' });

    expect(response.statusCode).toBe(201);
    expect(await app.database.post.count()).toBe(1);
  });

  it('still applies later filters after one throws', async () => {
    app.contentHooks.addFilter(
      'content.post.create',
      () => {
        throw new Error('first filter is broken');
      },
      5,
    );
    app.contentHooks.addFilter(
      'content.post.create',
      (draft: PostFilterDraft) => ({ ...draft, excerpt: 'from healthy filter' }),
      10,
    );

    const response = await createPost({ type: 'post', title: 'Partial filters' });

    expect(response.statusCode).toBe(201);
    expect((response.json() as { excerpt: string | null }).excerpt).toBe('from healthy filter');
  });

  it('dispose() clears every handler', async () => {
    let filterCalls = 0;
    let actionCalls = 0;
    app.contentHooks.addFilter('content.post.create', (draft: PostFilterDraft) => {
      filterCalls += 1;
      return draft;
    });
    app.contentHooks.addAction('content.post.created', () => {
      actionCalls += 1;
    });

    const first = await createPost({ type: 'post', title: 'Before dispose' });
    expect(first.statusCode).toBe(201);
    expect(filterCalls).toBe(1);
    expect(actionCalls).toBe(1);

    app.contentHooks.dispose();

    const second = await createPost({ type: 'post', title: 'After dispose' });
    expect(second.statusCode).toBe(201);
    expect(filterCalls).toBe(1);
    expect(actionCalls).toBe(1);
  });
});
