import { z } from 'zod';

// Shared scalars
const uuid = z.string().uuid();
const slug = z.string().min(1).max(200);
const title = z.string().trim().min(1).max(300);
const excerpt = z.string().max(2000).nullable();
const content = z.string().max(2_000_000);
const seoTitle = z.string().max(300).nullable();
const seoDescription = z.string().max(500).nullable();
const canonicalUrl = z.string().url().max(2048).nullable();
const robots = z.string().max(100).nullable();
const contentType = z.enum(['post', 'page']);
const postStatus = z.enum(['DRAFT', 'PUBLISHED', 'TRASHED']);

export const createPostSchema = z
  .object({
    type: contentType,
    title,
    slug: slug.optional(),
    excerpt: excerpt.optional(),
    content: content.optional(),
    seoTitle: seoTitle.optional(),
    seoDescription: seoDescription.optional(),
    canonicalUrl: canonicalUrl.optional(),
    robots: robots.optional(),
    ogTitle: seoTitle.optional(),
    ogDescription: seoDescription.optional(),
  })
  .strict();

export const updatePostSchema = z
  .object({
    baseVersion: z.number().int().min(1),
    title: title.optional(),
    slug: slug.optional(),
    excerpt: excerpt.optional(),
    content: content.optional(),
    seoTitle: seoTitle.optional(),
    seoDescription: seoDescription.optional(),
    canonicalUrl: canonicalUrl.optional(),
    robots: robots.optional(),
    ogTitle: seoTitle.optional(),
    ogDescription: seoDescription.optional(),
    featuredMediaId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const transitionSchema = z
  .object({
    baseVersion: z.number().int().min(1),
  })
  .strict();

export const assignTermsSchema = z
  .object({
    baseVersion: z.number().int().min(1),
    categoryIds: z.array(uuid).max(100).default([]),
    tagIds: z.array(uuid).max(100).default([]),
  })
  .strict()
  .refine((v) => new Set(v.categoryIds).size === v.categoryIds.length, {
    message: 'categoryIds must be unique',
  })
  .refine((v) => new Set(v.tagIds).size === v.tagIds.length, { message: 'tagIds must be unique' });

const pagination = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
};

export const adminListQuerySchema = z
  .object({
    type: contentType.optional(),
    status: postStatus.optional(),
    search: z.string().max(200).optional(),
    category: z.string().uuid().optional(),
    tag: z.string().uuid().optional(),
    author: z.string().uuid().optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
      .optional(),
    sort: z.enum(['updatedAt', 'createdAt', 'publishedAt', 'title']).default('updatedAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    ...pagination,
  })
  .strict();

export const publicListQuerySchema = z
  .object({
    type: contentType.optional(),
    search: z.string().trim().min(1).max(200).optional(),
    category: z.string().min(1).max(200).optional(),
    tag: z.string().min(1).max(200).optional(),
    ...pagination,
  })
  .strict();

export const publicSlugQuerySchema = z
  .object({
    type: contentType.default('post'),
  })
  .strict();

export const idParamSchema = z.object({ id: uuid }).strict();
export const slugParamSchema = z.object({ slug: z.string().min(1).max(200) }).strict();

// ---- taxonomy ----

const taxonomyType = z.enum(['category', 'tag']);
const termName = z.string().trim().min(1).max(200);
const termDescription = z.string().max(2000).nullable();

export const createTermSchema = z
  .object({
    taxonomy: taxonomyType,
    name: termName,
    slug: slug.optional(),
    description: termDescription.optional(),
    parentId: uuid.nullable().optional(),
  })
  .strict();

export const convertTermsSchema = z
  .object({
    from: taxonomyType,
  })
  .strict();

export const updateTermSchema = z
  .object({
    name: termName.optional(),
    slug: slug.optional(),
    description: termDescription.optional(),
    parentId: uuid.nullable().optional(),
  })
  .strict();

export const termListQuerySchema = z
  .object({
    taxonomy: taxonomyType.optional(),
    search: z.string().max(200).optional(),
    sort: z
      .enum(['name', 'description', 'slug', 'count', 'createdAt', 'updatedAt'])
      .default('name'),
    order: z.enum(['asc', 'desc']).default('asc'),
    ...pagination,
  })
  .strict();
