-- AlterTable: post_revisions — 'revision' vs 'autosave' kinds (P8-02).
-- Existing rows are immutable snapshots → kind 'revision' by default.
ALTER TABLE "post_revisions" ADD COLUMN "kind" VARCHAR(16) NOT NULL DEFAULT 'revision';
CREATE INDEX "post_revisions_post_id_kind_idx" ON "post_revisions"("post_id", "kind");
