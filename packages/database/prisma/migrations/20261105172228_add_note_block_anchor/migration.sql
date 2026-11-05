-- AlterTable
ALTER TABLE "post_notes" ADD COLUMN     "block_hash" VARCHAR(32),
ADD COLUMN     "block_name" VARCHAR(100),
ADD COLUMN     "block_path" VARCHAR(100);
