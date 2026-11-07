-- Per-template field vitals (ADR 0057 amendment). The template is a route kind
-- (home/post/page/archive/search/other), never a full path, cookie or IP.
-- Existing aggregated rows move to 'other' so totals keep working.
ALTER TABLE "web_vitals_daily" ADD COLUMN "template" VARCHAR(16) NOT NULL DEFAULT 'other';

DROP INDEX "web_vitals_daily_day_metric_bucket_key";
CREATE UNIQUE INDEX "web_vitals_daily_day_template_metric_bucket_key"
  ON "web_vitals_daily"("day", "template", "metric", "bucket");
CREATE INDEX "web_vitals_daily_template_idx" ON "web_vitals_daily"("template");
