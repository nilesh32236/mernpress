-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'TRASHED');

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(300) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "content_format" VARCHAR(32) NOT NULL DEFAULT 'wp_block_html',
    "content_version" INTEGER NOT NULL DEFAULT 1,
    "author_id" UUID,
    "seo_title" VARCHAR(300),
    "seo_description" VARCHAR(500),
    "canonical_url" VARCHAR(2048),
    "robots" VARCHAR(100),
    "og_title" VARCHAR(300),
    "og_description" VARCHAR(500),
    "published_at" TIMESTAMPTZ(6),
    "trashed_at" TIMESTAMPTZ(6),
    "previous_status" "PostStatus",
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_slug_history" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "old_slug" VARCHAR(200) NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_slug_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" UUID NOT NULL,
    "taxonomy" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_terms" (
    "post_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_terms_pkey" PRIMARY KEY ("post_id","term_id")
);

-- CreateIndex
CREATE INDEX "posts_type_status_published_at_idx" ON "posts"("type", "status", "published_at");

-- CreateIndex
CREATE INDEX "posts_status_updated_at_idx" ON "posts"("status", "updated_at");

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "posts_type_slug_key" ON "posts"("type", "slug");

-- CreateIndex
CREATE INDEX "post_slug_history_post_id_changed_at_idx" ON "post_slug_history"("post_id", "changed_at");

-- CreateIndex
CREATE INDEX "terms_taxonomy_parent_id_idx" ON "terms"("taxonomy", "parent_id");

-- CreateIndex
CREATE INDEX "terms_taxonomy_name_idx" ON "terms"("taxonomy", "name");

-- CreateIndex
CREATE INDEX "post_terms_term_id_post_id_idx" ON "post_terms"("term_id", "post_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_slug_history" ADD CONSTRAINT "post_slug_history_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_terms" ADD CONSTRAINT "post_terms_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_terms" ADD CONSTRAINT "post_terms_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Check constraints + partial unique indexes that the Prisma datamodel cannot express.
-- posts.type is a code registry value (post/page now; plugin-registered later via migration).
ALTER TABLE "posts" ADD CONSTRAINT "posts_type_check" CHECK ("type" IN ('post', 'page'));
ALTER TABLE "posts" ADD CONSTRAINT "posts_content_format_check" CHECK ("content_format" = 'wp_block_html');

-- terms.taxonomy is a code registry value (category/tag now; custom taxonomies are Phase 9).
ALTER TABLE "terms" ADD CONSTRAINT "terms_taxonomy_check" CHECK ("taxonomy" IN ('category', 'tag'));
-- Only hierarchical categories may have a parent; tags stay flat (DB-enforced).
ALTER TABLE "terms" ADD CONSTRAINT "terms_parent_taxonomy_check" CHECK ("taxonomy" = 'category' OR "parent_id" IS NULL);
-- A term can never be its own parent (DB-level self-parent guard; deeper cycles are a service invariant).
ALTER TABLE "terms" ADD CONSTRAINT "terms_no_self_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- Unique term slug per taxonomy. PostgreSQL treats NULLs as distinct, so two
-- partial unique indexes are required to cover root (parent_id IS NULL) and child
-- (parent_id IS NOT NULL) terms. Root slugs are unique per taxonomy; child slugs
-- are unique per (taxonomy, parent) while a root slug also reserves the name.
CREATE UNIQUE INDEX "terms_root_slug_key" ON "terms"("taxonomy", "slug") WHERE "parent_id" IS NULL;
CREATE UNIQUE INDEX "terms_child_slug_key" ON "terms"("taxonomy", "parent_id", "slug") WHERE "parent_id" IS NOT NULL;

