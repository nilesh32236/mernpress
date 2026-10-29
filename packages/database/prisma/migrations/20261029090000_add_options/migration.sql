-- CreateTable
CREATE TABLE "options" (
    "key" VARCHAR(191) NOT NULL,
    "value" TEXT NOT NULL,
    "group" VARCHAR(50) NOT NULL DEFAULT 'general',
    "autoload" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "options_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "options_group_idx" ON "options"("group");
