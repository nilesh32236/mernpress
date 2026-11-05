-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "notes_notify" BOOLEAN;

-- AddForeignKey
ALTER TABLE "post_notes" ADD CONSTRAINT "post_notes_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
