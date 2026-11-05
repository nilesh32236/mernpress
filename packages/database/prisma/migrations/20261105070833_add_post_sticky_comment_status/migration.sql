-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "comment_status" VARCHAR(20) NOT NULL DEFAULT 'open',
ADD COLUMN     "sticky" BOOLEAN NOT NULL DEFAULT false;
