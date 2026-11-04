-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" VARCHAR(20) NOT NULL DEFAULT 'en_US',
ADD COLUMN     "syntax_highlighting" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "application_passwords" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "last_used_ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_passwords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_passwords_user_id_idx" ON "application_passwords"("user_id");

-- AddForeignKey
ALTER TABLE "application_passwords" ADD CONSTRAINT "application_passwords_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
