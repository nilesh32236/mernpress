import type { DatabaseClient } from './client.js';

export interface SeedDemoResult {
  created: { posts: number; pages: number; categories: number; tags: number };
  skipped: boolean;
  reason?: string;
}

const DEMO = {
  categories: [
    { name: 'News', slug: 'news' },
    { name: 'Guides', slug: 'guides' },
  ],
  tags: [
    { name: 'Demo', slug: 'demo' },
    { name: 'MERNPress', slug: 'mernpress' },
  ],
  post: {
    slug: 'welcome-to-mernpress',
    title: 'Welcome to MERNPress',
    excerpt: 'Your first post, created by the idempotent demo seed.',
    content:
      '<!-- wp:paragraph -->\n<p>This is a demo post. Edit or delete it — the seed will never overwrite your changes.</p>\n<!-- /wp:paragraph -->',
  },
  page: {
    slug: 'about',
    title: 'About',
    excerpt: 'A demo page created by the idempotent seed.',
    content:
      '<!-- wp:paragraph -->\n<p>This is a demo page. The seed only creates content that does not already exist.</p>\n<!-- /wp:paragraph -->',
  },
} as const;

/**
 * Idempotent demo-content seed (ADR 0003, D-8). Development/test only — it
 * refuses to run in production. It creates representative post/page/category/
 * tag data only when it is absent, keyed on stable slugs, and never overwrites
 * existing content. It never creates an administrator (that stays CLI-only) and
 * never touches a post that already exists.
 */
export async function seedDemoContent(
  prisma: DatabaseClient,
  options: { nodeEnv: string },
): Promise<SeedDemoResult> {
  if (options.nodeEnv === 'production') {
    throw new Error('Refusing to seed demo content in production (NODE_ENV=production).');
  }

  // Demo posts need an author. Use the first administrator if one exists;
  // otherwise leave the author null rather than inventing a principal. Never
  // create a user here.
  const admin = await prisma.user.findFirst({
    where: { role: 'administrator', status: 'active' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  const created = { posts: 0, pages: 0, categories: 0, tags: 0 };

  // ---- categories + tags (keyed on (taxonomy, slug)) ----
  const categoryIds: string[] = [];
  for (const c of DEMO.categories) {
    const existing = await prisma.term.findFirst({
      where: { taxonomy: 'category', slug: c.slug, parentId: null },
      select: { id: true },
    });
    if (existing) {
      categoryIds.push(existing.id);
    } else {
      const term = await prisma.term.create({
        data: { taxonomy: 'category', name: c.name, slug: c.slug },
        select: { id: true },
      });
      categoryIds.push(term.id);
      created.categories += 1;
    }
  }

  const tagIds: string[] = [];
  for (const t of DEMO.tags) {
    const existing = await prisma.term.findFirst({
      where: { taxonomy: 'tag', slug: t.slug, parentId: null },
      select: { id: true },
    });
    if (existing) {
      tagIds.push(existing.id);
    } else {
      const term = await prisma.term.create({
        data: { taxonomy: 'tag', name: t.name, slug: t.slug },
        select: { id: true },
      });
      tagIds.push(term.id);
      created.tags += 1;
    }
  }

  // ---- demo post (keyed on (type, slug)) ----
  const existingPost = await prisma.post.findFirst({
    where: { type: 'post', slug: DEMO.post.slug },
    select: { id: true },
  });
  if (!existingPost) {
    const post = await prisma.post.create({
      data: {
        type: 'post',
        status: 'DRAFT',
        title: DEMO.post.title,
        slug: DEMO.post.slug,
        excerpt: DEMO.post.excerpt,
        content: DEMO.post.content,
        authorId: admin?.id ?? null,
      },
      select: { id: true },
    });
    await prisma.postTerm.createMany({
      data: [
        ...categoryIds.map((termId, position) => ({ postId: post.id, termId, position })),
        ...tagIds.map((termId, i) => ({
          postId: post.id,
          termId,
          position: categoryIds.length + i,
        })),
      ],
    });
    created.posts += 1;
  }

  // ---- demo page ----
  const existingPage = await prisma.post.findFirst({
    where: { type: 'page', slug: DEMO.page.slug },
    select: { id: true },
  });
  if (!existingPage) {
    await prisma.post.create({
      data: {
        type: 'page',
        status: 'DRAFT',
        title: DEMO.page.title,
        slug: DEMO.page.slug,
        excerpt: DEMO.page.excerpt,
        content: DEMO.page.content,
        authorId: admin?.id ?? null,
      },
    });
    created.pages += 1;
  }

  const skipped =
    created.posts === 0 && created.pages === 0 && created.categories === 0 && created.tags === 0;

  return {
    created,
    skipped,
    ...(skipped ? { reason: 'Demo content already present; nothing created.' } : {}),
  };
}
