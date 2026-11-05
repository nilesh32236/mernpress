-- CreateTable
CREATE TABLE "analytics_daily" (
    "id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "path" VARCHAR(2048) NOT NULL,
    "referrer_host" VARCHAR(255) NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_daily_day_idx" ON "analytics_daily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_day_path_referrer_host_key" ON "analytics_daily"("day", "path", "referrer_host");
