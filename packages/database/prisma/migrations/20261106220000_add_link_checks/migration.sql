-- Broken-link detection results (ADR 0058). One row per source post + URL;
-- internal links are checked against published content without HTTP, external
-- links are stored unchecked (SSRF policy: never fetch authored URLs).
CREATE TABLE "link_checks" (
  "id" UUID NOT NULL,
  "source_post_id" UUID NOT NULL,
  "source_title" VARCHAR(300) NOT NULL,
  "source_slug" VARCHAR(200) NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "http_status" INTEGER,
  "redirect_to" VARCHAR(2048),
  "checked_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "link_checks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "link_checks_source_post_id_url_key"
  ON "link_checks"("source_post_id", "url");
CREATE INDEX "link_checks_status_idx" ON "link_checks"("status");
CREATE INDEX "link_checks_checked_at_idx" ON "link_checks"("checked_at");
