import cron from "node-cron";
import {publishAppointmentChanged,publishDueNotificationUpdates} from "../../lib/realtime.js";
import {
    AppointmentActor,
    AppointmentNotificationType,
    AppointmentStatus,
    NotificationDeliveryStatus,
} from "../../../generated/prisma/enums.js";
import { config } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { cleanupAppointmentMeeting } from "./appointment.service.js";
import {
    createAppointmentEvents,
    sendDueAppointmentNotifications,
} from "./appointment.notification.js";

const JOB_BATCH_SIZE = 20;
let maintenanceRunning = false;

async function expirePendingAppointments(now:Date){
    const pendingAppointments=await prisma.appointment.findMany({
        where:{
            status:AppointmentStatus.PENDING_CONFIRMATION,
            confirmationDueAt:{lte:now},
        },
        select:{id:true,patientID:true},
        orderBy:{confirmationDueAt:"asc"},
        take:JOB_BATCH_SIZE,
    });

    let expiredCount=0;
    for(const appointment of pendingAppointments){
        try{
            const expired=await prisma.$transaction(async(tx)=>{
                const updated=await tx.appointment.updateMany({
                    where:{
                        id:appointment.id,
                        status:AppointmentStatus.PENDING_CONFIRMATION,
                        confirmationDueAt:{lte:now},
                    },
                    data:{status:AppointmentStatus.EXPIRED},
                });
                if(updated.count!==1)return false;

                await tx.appointmentSlotReservation.deleteMany({
                    where:{appointmentID:appointment.id},
                });
                await tx.appointmentStatusHistory.create({
                    data:{
                        appointmentID:appointment.id,
                        fromStatus:AppointmentStatus.PENDING_CONFIRMATION,
                        toStatus:AppointmentStatus.EXPIRED,
                        actor:AppointmentActor.SYSTEM,
                        note:"Qua thoi gian cho bac si xac nhan",
                    },
                });
                await tx.appointmentNotification.updateMany({
                    where:{
                        appointmentID:appointment.id,
                        type:AppointmentNotificationType.REQUEST_CREATED,
                        status:{
                            in:[
                                NotificationDeliveryStatus.PENDING,
                                NotificationDeliveryStatus.PROCESSING,
                            ],
                        },
                    },
                    data:{
                        status:NotificationDeliveryStatus.CANCELLED,
                        processingStartedAt:null,
                        nextAttemptAt:null,
                    },
                });
                await createAppointmentEvents(tx,[{
                    appointmentID:appointment.id,
                    recipientID:appointment.patientID,
                    type:AppointmentNotificationType.REQUEST_EXPIRED,
                    scheduledAt:now,
                }]);
                return true;
            });

            if(expired){
                expiredCount+=1;
                await publishAppointmentChanged(appointment.id);
            }
        }catch(error){
            console.error("Could not expire pending appointment",{
                appointmentId:appointment.id,
                error:error instanceof Error?error.message:"Unknown error",
            });
        }
    }

    return expiredCount;
}

async function markOverdueAppointmentsNoShow(now: Date) {
    const cutoff = new Date(
        now.getTime() - config.schedule.noShowAfterMinutes * 60 * 1000,
    );
    const overdueAppointments = await prisma.appointment.findMany({
        where: {
            status: AppointmentStatus.CONFIRMED,
            endAt: { lte: cutoff },
        },
        select: {
            id: true,
            meetingSpaceName: true,
        },
        orderBy: { endAt: "asc" },
        take: JOB_BATCH_SIZE,
    });

    let updatedCount = 0;
    for (const appointment of overdueAppointments) {
        try {
            const updated = await prisma.$transaction(async (tx) => {
                const result = await tx.appointment.updateMany({
                    where: {
                        id: appointment.id,
                        status: AppointmentStatus.CONFIRMED,
                        endAt: { lte: cutoff },
                    },
                    data: {
                        status: AppointmentStatus.NO_SHOW,
                        noShowAt: now,
                        meetingCleanupPending:
                            appointment.meetingSpaceName !== null,
                    },
                });

                if (result.count !== 1) {
                    return false;
                }

                await tx.appointmentSlotReservation.deleteMany({
                    where: { appointmentID: appointment.id },
                });

                await tx.appointmentStatusHistory.create({
                    data: {
                        appointmentID: appointment.id,
                        fromStatus: AppointmentStatus.CONFIRMED,
                        toStatus: AppointmentStatus.NO_SHOW,
                        actor: AppointmentActor.SYSTEM,
                        note: `Bac si chua hoan thanh lich hen sau ${config.schedule.noShowAfterMinutes} phut`,
                    },
                });

                await tx.appointmentNotification.updateMany({
                    where: {
                        appointmentID: appointment.id,
                        status: NotificationDeliveryStatus.PENDING,
                    },
                    data: { status: NotificationDeliveryStatus.CANCELLED },
                });

                await tx.userNotification.deleteMany({
                    where:{appointmentID:appointment.id,scheduledAt:{gt:now}},
                });

                return true;
            });

            if (updated) {
                updatedCount += 1;
                await publishAppointmentChanged(appointment.id);
            }
        } catch (error) {
            console.error("Could not mark appointment as doctor no-show", {
                appointmentId: appointment.id,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    return updatedCount;
}

async function cleanupPendingMeetingSpaces() {
    const appointments = await prisma.appointment.findMany({
        where: {
            meetingCleanupPending: true,
            meetingSpaceName: { not: null },
            status: {
                in: [
                    AppointmentStatus.COMPLETED,
                    AppointmentStatus.NO_SHOW,
                    AppointmentStatus.CANCELLED,
                ],
            },
        },
        select: { id: true },
        orderBy: { updatedAt: "asc" },
        take: JOB_BATCH_SIZE,
    });

    let cleanedCount = 0;
    for (const appointment of appointments) {
        if (await cleanupAppointmentMeeting(appointment.id)) {
            cleanedCount += 1;
        }
    }

    return cleanedCount;
}

export async function runAppointmentMaintenance(now = new Date()) {
    if (maintenanceRunning) {
        return {
            skipped: true,
            expiredCount: 0,
            noShowCount: 0,
            cleanedCount: 0,
            notificationSentCount: 0,
            notificationFailedCount: 0,
        };
    }

    maintenanceRunning = true;
    try {
        const expiredCount=await expirePendingAppointments(now);
        const noShowCount = await markOverdueAppointmentsNoShow(now);
        const cleanedCount = await cleanupPendingMeetingSpaces();
        await publishDueNotificationUpdates(now);
        const notificationResult = await sendDueAppointmentNotifications(now);
        return {
            skipped: false,
            expiredCount,
            noShowCount,
            cleanedCount,
            notificationSentCount: notificationResult.sentCount,
            notificationFailedCount: notificationResult.failedCount,
        };
    } finally {
        maintenanceRunning = false;
    }
}

export function startAppointmentJobs() {
    let active:Promise<unknown>|undefined;
    const run=()=>{
        if(active)return;
        active=runAppointmentMaintenance()
            .catch(()=>console.error("Appointment maintenance job failed"))
            .finally(()=>{active=undefined;});
    };
    const task=cron.schedule("* * * * *",run);
    run();
    return async()=>{
        await task.stop();
        await active;
        await task.destroy();
    };
}
