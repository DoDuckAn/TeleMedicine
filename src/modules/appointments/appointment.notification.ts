import { formatInTimeZone } from "date-fns-tz";
import {
    AppointmentNotificationType,
    NotificationChannel,
    NotificationDeliveryStatus,
} from "../../../generated/prisma/enums.js";
import { config } from "../../config/env.js";
import { sendFirebasePush } from "../../lib/firebase.js";
import { prisma } from "../../lib/prisma.js";

const notificationSelect = {
    id: true,
    appointmentID: true,
    recipientID: true,
    type: true,
    channel: true,
    attempts: true,
    appointment: {
        select: {
            startAt: true,
            doctor: { select: { fullName: true } },
            patient: { select: { fullName: true } },
        },
    },
    recipient: { select: { phone: true } },
} as const;

type DeliveryNotification = Awaited<
    ReturnType<typeof findDueNotifications>
>[number];

function formatAppointmentTime(date: Date) {
    return formatInTimeZone(
        date,
        config.schedule.timezone,
        "HH:mm dd/MM/yyyy",
    );
}

function buildNotificationMessage(notification: DeliveryNotification) {
    const time = formatAppointmentTime(notification.appointment.startAt);
    const doctorName = notification.appointment.doctor.fullName;
    const patientName = notification.appointment.patient.fullName;

    switch (notification.type) {
        case AppointmentNotificationType.REQUEST_CREATED:
            return {
                title: "Yeu cau dat lich moi",
                body: `${patientName} da gui yeu cau dat lich luc ${time}.`,
            };
        case AppointmentNotificationType.REQUEST_CONFIRMED:
            return {
                title: "Lich hen da duoc xac nhan",
                body: `Bac si ${doctorName} da xac nhan lich hen luc ${time}.`,
            };
        case AppointmentNotificationType.REQUEST_REJECTED:
            return {
                title: "Lich hen bi tu choi",
                body: `Bac si ${doctorName} da tu choi lich hen luc ${time}.`,
            };
        case AppointmentNotificationType.REQUEST_EXPIRED:
            return {
                title: "Yeu cau dat lich het han",
                body: `Yeu cau dat lich voi bac si ${doctorName} luc ${time} da het han.`,
            };
        case AppointmentNotificationType.APPOINTMENT_CANCELLED:
            return {
                title: "Lich hen da bi huy",
                body: `Lich hen luc ${time} da bi huy.`,
            };
        case AppointmentNotificationType.REMINDER_1_HOUR:
            return {
                title: "Sap den gio kham",
                body: `Lich hen cua ban se bat dau luc ${time}, con 1 gio nua.`,
            };
        case AppointmentNotificationType.REMINDER_15_MINUTES:
            return {
                title: "Sap den gio kham",
                body: `Lich hen cua ban se bat dau luc ${time}, con 15 phut nua.`,
            };
        case AppointmentNotificationType.APPOINTMENT_COMPLETED:
        case AppointmentNotificationType.DOCTOR_NO_SHOW:
            throw new Error(`Unsupported notification type: ${notification.type}`);
    }
}

async function deliverPush(notification: DeliveryNotification) {
    const devices = await prisma.pushDeviceToken.findMany({
        where: {
            userID: notification.recipientID,
            enabled: true,
        },
        select: { token: true },
        orderBy: { lastRegisteredAt: "desc" },
        take: 500,
    });
    const message = buildNotificationMessage(notification);
    const result = await sendFirebasePush(
        devices.map((device) => device.token),
        {
            ...message,
            data: {
                appointmentId: notification.appointmentID,
                type: notification.type,
            },
        },
    );

    if (result.invalidTokens.length > 0) {
        await prisma.pushDeviceToken.updateMany({
            where: { token: { in: result.invalidTokens } },
            data: { enabled: false },
        });
    }

    if (result.successCount === 0) {
        throw new Error(
            result.failureMessages.join(", ") || "Firebase push delivery failed",
        );
    }
}

async function deliverSms(notification: DeliveryNotification) {
    if (!notification.recipient.phone) {
        throw new Error("Recipient has no phone number");
    }

    const message = buildNotificationMessage(notification);
    console.info("[SMS_LOG]", {
        notificationId: notification.id,
        to: notification.recipient.phone,
        content: message.body,
    });
}

async function deliverNotification(notification: DeliveryNotification) {
    if (notification.channel === NotificationChannel.PUSH) {
        await deliverPush(notification);
        return;
    }

    await deliverSms(notification);
}

function findDueNotifications(now: Date) {
    const channels: NotificationChannel[] = [NotificationChannel.SMS];
    if (config.firebase.pushEnabled) {
        channels.push(NotificationChannel.PUSH);
    }

    return prisma.appointmentNotification.findMany({
        where: {
            status: NotificationDeliveryStatus.PENDING,
            channel: { in: channels },
            scheduledAt: { lte: now },
            OR: [
                { nextAttemptAt: null },
                { nextAttemptAt: { lte: now } },
            ],
        },
        select: notificationSelect,
        orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
        take: config.notification.batchSize,
    });
}

async function recoverStaleNotifications(now: Date) {
    const staleBefore = new Date(
        now.getTime() -
            config.notification.processingTimeoutMinutes * 60 * 1000,
    );

    await prisma.appointmentNotification.updateMany({
        where: {
            status: NotificationDeliveryStatus.PROCESSING,
            processingStartedAt: { lte: staleBefore },
        },
        data: {
            status: NotificationDeliveryStatus.PENDING,
            processingStartedAt: null,
            nextAttemptAt: now,
            failureReason: "Recovered stale notification delivery",
        },
    });
}

async function cancelExpiredNotifications(now: Date) {
    const expiredBefore = new Date(
        now.getTime() - config.notification.maxAgeHours * 60 * 60 * 1000,
    );

    await prisma.appointmentNotification.updateMany({
        where: {
            status: NotificationDeliveryStatus.PENDING,
            scheduledAt: { lt: expiredBefore },
        },
        data: {
            status: NotificationDeliveryStatus.CANCELLED,
            nextAttemptAt: null,
            failureReason: "Notification delivery window expired",
        },
    });
}

export async function sendDueAppointmentNotifications(now = new Date()) {
    await recoverStaleNotifications(now);
    await cancelExpiredNotifications(now);
    const notifications = await findDueNotifications(now);
    let sentCount = 0;
    let failedCount = 0;

    for (const notification of notifications) {
        const claimed = await prisma.appointmentNotification.updateMany({
            where: {
                id: notification.id,
                status: NotificationDeliveryStatus.PENDING,
            },
            data: {
                status: NotificationDeliveryStatus.PROCESSING,
                processingStartedAt: now,
                attempts: { increment: 1 },
            },
        });

        if (claimed.count !== 1) {
            continue;
        }

        try {
            await deliverNotification(notification);
            await prisma.appointmentNotification.updateMany({
                where: {
                    id: notification.id,
                    status: NotificationDeliveryStatus.PROCESSING,
                },
                data: {
                    status: NotificationDeliveryStatus.SENT,
                    sentAt: new Date(),
                    processingStartedAt: null,
                    nextAttemptAt: null,
                    failureReason: null,
                },
            });
            sentCount += 1;
        } catch (error) {
            const attempts = notification.attempts + 1;
            const permanentlyFailed =
                attempts >= config.notification.maxAttempts;
            const message = error instanceof Error
                ? error.message.slice(0, 1000)
                : "Unknown notification delivery error";

            await prisma.appointmentNotification.updateMany({
                where: {
                    id: notification.id,
                    status: NotificationDeliveryStatus.PROCESSING,
                },
                data: {
                    status: permanentlyFailed
                        ? NotificationDeliveryStatus.FAILED
                        : NotificationDeliveryStatus.PENDING,
                    processingStartedAt: null,
                    nextAttemptAt: permanentlyFailed
                        ? null
                        : new Date(
                              now.getTime() +
                                  config.notification.retryMinutes * 60 * 1000,
                          ),
                    failureReason: message,
                },
            });
            failedCount += 1;
        }
    }

    return { sentCount, failedCount };
}
