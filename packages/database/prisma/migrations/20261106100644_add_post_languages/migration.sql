
-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "language" VARCHAR(10) NOT NULL DEFAULT 'en',
ADD COLUMN     "translation_group" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex
CREATE INDEX "posts_language_status_idx" ON "posts"("language", "status");

-- CreateIndex
CREATE UNIQUE INDEX "posts_translation_group_language_key" ON "posts"("translation_group", "language");

