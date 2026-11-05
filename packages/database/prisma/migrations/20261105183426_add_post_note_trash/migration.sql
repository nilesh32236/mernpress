-- AlterTable
ALTER TABLE "post_notes" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "deleted_by_id" UUID;

-- CreateIndex
CREATE INDEX "post_notes_post_id_deleted_at_idx" ON "post_notes"("post_id", "deleted_at");
