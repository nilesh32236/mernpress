-- CreateTable
CREATE TABLE "mail_log_entries" (
    "id" UUID NOT NULL,
    "recipient" VARCHAR(320) NOT NULL DEFAULT '',
    "subject" VARCHAR(500) NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mail_log_entries_created_at_idx" ON "mail_log_entries"("created_at");
