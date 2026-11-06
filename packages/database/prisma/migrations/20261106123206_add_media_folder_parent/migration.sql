-- AlterTable
ALTER TABLE "media_folders" ADD COLUMN     "parent_id" UUID;

-- CreateIndex
CREATE INDEX "media_folders_parent_id_idx" ON "media_folders"("parent_id");

-- AddForeignKey
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "media_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

