-- CreateTable
CREATE TABLE "post_notes" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_id" UUID,
    "parent_id" UUID,
    "content" TEXT NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "post_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_notes_post_id_created_at_idx" ON "post_notes"("post_id", "created_at");

-- AddForeignKey
ALTER TABLE "post_notes" ADD CONSTRAINT "post_notes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_notes" ADD CONSTRAINT "post_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_notes" ADD CONSTRAINT "post_notes_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_notes" ADD CONSTRAINT "post_notes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "post_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
