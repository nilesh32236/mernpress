-- AlterTable: posts — featured image (Phase 6 follow-up). SetNull on media delete.
ALTER TABLE "posts" ADD COLUMN "featured_media_id" UUID;
ALTER TABLE "posts" ADD CONSTRAINT "posts_featured_media_id_fkey"
  FOREIGN KEY ("featured_media_id") REFERENCES "media_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "posts_featured_media_id_idx" ON "posts"("featured_media_id");
