ALTER TABLE "PushDeviceToken"
  ADD COLUMN "refreshTokenId" TEXT,
  ADD COLUMN "authVersion" INTEGER,
  ADD COLUMN "installationId" TEXT,
  ADD COLUMN "receiptSecretHash" TEXT;

-- Existing registrations have no verifiable login association. Clients must register again.
UPDATE "PushDeviceToken" SET "enabled" = false;

CREATE UNIQUE INDEX "PushDeviceToken_installationId_key" ON "PushDeviceToken"("installationId");
CREATE INDEX "PushDeviceToken_refreshTokenId_idx" ON "PushDeviceToken"("refreshTokenId");
CREATE INDEX "PushDeviceToken_enabled_lastRegisteredAt_idx" ON "PushDeviceToken"("enabled", "lastRegisteredAt");
ALTER TABLE "PushDeviceToken" ADD CONSTRAINT "PushDeviceToken_refreshTokenId_fkey"
  FOREIGN KEY ("refreshTokenId") REFERENCES "RefreshToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
