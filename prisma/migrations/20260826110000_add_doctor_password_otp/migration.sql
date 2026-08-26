CREATE TYPE "DoctorPasswordOtpPurpose" AS ENUM ('CHANGE_PASSWORD', 'RESET_PASSWORD');

CREATE TABLE "DoctorPasswordOtp" (
    "id" TEXT NOT NULL,
    "userID" TEXT NOT NULL,
    "purpose" "DoctorPasswordOtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorPasswordOtp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DoctorPasswordOtp_userID_purpose_key"
ON "DoctorPasswordOtp"("userID", "purpose");

CREATE INDEX "DoctorPasswordOtp_expiresAt_idx"
ON "DoctorPasswordOtp"("expiresAt");

ALTER TABLE "DoctorPasswordOtp"
ADD CONSTRAINT "DoctorPasswordOtp_userID_fkey"
FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
