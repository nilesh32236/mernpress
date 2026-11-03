-- AlterTable: users — optional display name and contact email (admin Name/Email columns).
ALTER TABLE "users"
  ADD COLUMN "email" VARCHAR(254),
  ADD COLUMN "display_name" VARCHAR(100);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
