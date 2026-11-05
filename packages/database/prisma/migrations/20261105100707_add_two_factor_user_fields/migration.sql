-- AlterTable
ALTER TABLE "users" ADD COLUMN     "two_factor_confirmed_at" TIMESTAMPTZ(6),
ADD COLUMN     "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "two_factor_last_counter" INTEGER,
ADD COLUMN     "two_factor_secret" TEXT;
