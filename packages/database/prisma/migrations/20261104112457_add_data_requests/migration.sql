-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('EXPORT', 'ERASE');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "data_requests" (
    "id" UUID NOT NULL,
    "type" "DataRequestType" NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "user_id" UUID,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_requests_type_status_idx" ON "data_requests"("type", "status");

-- CreateIndex
CREATE INDEX "data_requests_email_idx" ON "data_requests"("email");

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
