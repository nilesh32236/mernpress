-- AlterTable
ALTER TABLE "media_items" ADD COLUMN     "edited_at" TIMESTAMPTZ(6),
ADD COLUMN     "original_path" VARCHAR(400);
