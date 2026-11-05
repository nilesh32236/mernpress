-- AlterTable
ALTER TABLE "media_items" ADD COLUMN     "folder_id" UUID;

-- CreateTable
CREATE TABLE "media_folders" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_folders_name_key" ON "media_folders"("name");

-- CreateIndex
CREATE INDEX "media_items_folder_id_idx" ON "media_items"("folder_id");

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "media_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
