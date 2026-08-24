-- AlterEnum
ALTER TYPE "AppointmentNotificationType" ADD VALUE 'BOOKING_CREATED';

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "appointmentID" TEXT NOT NULL,
    "recipientID" TEXT NOT NULL,
    "type" "AppointmentNotificationType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userID" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bookingCreatedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requestCreatedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requestConfirmedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requestRejectedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requestExpiredEnabled" BOOLEAN NOT NULL DEFAULT true,
    "appointmentCancelledEnabled" BOOLEAN NOT NULL DEFAULT true,
    "appointmentCompletedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder1HourEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder15MinutesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "doctorNoShowEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userID")
);

-- CreateIndex
CREATE INDEX "UserNotification_recipientID_scheduledAt_idx" ON "UserNotification"("recipientID", "scheduledAt");

-- CreateIndex
CREATE INDEX "UserNotification_recipientID_readAt_scheduledAt_idx" ON "UserNotification"("recipientID", "readAt", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotification_appointmentID_recipientID_type_key" ON "UserNotification"("appointmentID", "recipientID", "type");

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_appointmentID_fkey" FOREIGN KEY ("appointmentID") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_recipientID_fkey" FOREIGN KEY ("recipientID") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userID_fkey" FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
