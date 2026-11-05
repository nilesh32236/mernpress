-- CreateTable
CREATE TABLE "two_factor_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "two_factor_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_recovery_codes_code_hash_key" ON "two_factor_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "two_factor_recovery_codes_user_id_idx" ON "two_factor_recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_challenges_token_hash_key" ON "two_factor_challenges"("token_hash");

-- CreateIndex
CREATE INDEX "two_factor_challenges_user_id_idx" ON "two_factor_challenges"("user_id");

-- CreateIndex
CREATE INDEX "two_factor_challenges_expires_at_idx" ON "two_factor_challenges"("expires_at");

-- AddForeignKey
ALTER TABLE "two_factor_recovery_codes" ADD CONSTRAINT "two_factor_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_challenges" ADD CONSTRAINT "two_factor_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
