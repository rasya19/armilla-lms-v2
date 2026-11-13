CREATE TABLE "LoginRateLimit" (
  "key" TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX "LoginRateLimit_expiresAt_idx" ON "LoginRateLimit" ("expiresAt");
