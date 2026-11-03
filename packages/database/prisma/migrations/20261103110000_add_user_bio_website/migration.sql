-- Additive: WordPress-style profile fields.
ALTER TABLE "users" ADD COLUMN "bio" TEXT;
ALTER TABLE "users" ADD COLUMN "website" VARCHAR(2048);
