-- Field Core Web Vitals aggregate (ADR 0057).
-- One row per UTC day, metric and bucket upper bound; values are milliseconds
-- or CLS scaled by 1000. No visitor identifiers, paths or IP addresses.
CREATE TABLE "web_vitals_daily" (
  "id" UUID NOT NULL,
  "day" DATE NOT NULL,
  "metric" VARCHAR(16) NOT NULL,
  "bucket" INTEGER NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "web_vitals_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "web_vitals_daily_day_metric_bucket_key"
  ON "web_vitals_daily"("day", "metric", "bucket");
CREATE INDEX "web_vitals_daily_day_idx" ON "web_vitals_daily"("day");
