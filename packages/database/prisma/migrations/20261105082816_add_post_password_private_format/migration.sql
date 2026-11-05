-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "format" VARCHAR(20) NOT NULL DEFAULT 'standard',
ADD COLUMN     "is_private" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_hash" VARCHAR(255);
