ALTER TYPE "NotificationChannel" RENAME VALUE 'SMS' TO 'EMAIL';

ALTER TABLE "NotificationPreference"
RENAME COLUMN "smsEnabled" TO "emailEnabled";

ALTER TABLE "NotificationPreference"
ALTER COLUMN "emailEnabled" SET DEFAULT false;

UPDATE "NotificationPreference" SET "emailEnabled"=false;

DROP TABLE "OtpCode";
DROP TYPE "OtpPurpose";
