-- AlterTable: posts — preview tokens (P8-03), first-publish scheduling (P8-04),
-- cumulative revision counter (P8-01).
ALTER TABLE "posts"
  ADD COLUMN "preview_token" VARCHAR(64),
  ADD COLUMN "scheduled_at" TIMESTAMPTZ(6),
  ADD COLUMN "revision_count" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "posts_preview_token_key" ON "posts"("preview_token");
CREATE INDEX "posts_scheduled_at_idx" ON "posts"("scheduled_at");

-- CreateTable: post_revisions — immutable pre-update snapshots (P8-01).
CREATE TABLE "post_revisions" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "seo_title" VARCHAR(300),
    "seo_description" VARCHAR(500),
    "canonical_url" VARCHAR(2048),
    "robots" VARCHAR(100),
    "og_title" VARCHAR(300),
    "og_description" VARCHAR(500),
    "author_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "post_revisions_post_id_created_at_idx" ON "post_revisions"("post_id", "created_at");

-- CreateTable: media_items — media library metadata (Phase 6). Raster images
-- only; SVG and non-image types are rejected at the upload boundary (T-12).
CREATE TABLE "media_items" (
    "id" UUID NOT NULL,
    "file_name" VARCHAR(120) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt_text" VARCHAR(500) NOT NULL DEFAULT '',
    "caption" VARCHAR(2000) NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "storage_path" VARCHAR(300) NOT NULL,
    "derivatives" JSONB,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "media_items_created_at_idx" ON "media_items"("created_at");
CREATE INDEX "media_items_mime_type_idx" ON "media_items"("mime_type");

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
