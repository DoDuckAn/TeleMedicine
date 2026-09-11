import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../common/api-error.js";
import {
    buildAppointmentNotificationMessage,
    getEnabledAppointmentNotificationTypes,
} from "../appointments/appointment.notification.js";
import type {
    ListNotificationsQuery,
    RegisterPushDeviceInput,
    UnregisterPushDeviceInput,
    UpdateNotificationPreferenceInput,
} from "./notification.schema.js";

const defaultPreference={
    pushEnabled:true,
    emailEnabled:false,
    bookingCreatedEnabled:true,
    requestCreatedEnabled:true,
    requestConfirmedEnabled:true,
    requestRejectedEnabled:true,
    requestExpiredEnabled:true,
    appointmentCancelledEnabled:true,
    appointmentCompletedEnabled:true,
    reminder1HourEnabled:true,
    reminder15MinutesEnabled:true,
    doctorNoShowEnabled:true,
};

function preferenceResponse(preference:typeof defaultPreference){
    return {
        channels:{
            push:preference.pushEnabled,
            email:preference.emailEnabled,
        },
        events:{
            bookingCreated:preference.bookingCreatedEnabled,
            requestCreated:preference.requestCreatedEnabled,
            requestConfirmed:preference.requestConfirmedEnabled,
            requestRejected:preference.requestRejectedEnabled,
            requestExpired:preference.requestExpiredEnabled,
            appointmentCancelled:preference.appointmentCancelledEnabled,
            appointmentCompleted:preference.appointmentCompletedEnabled,
            reminder1Hour:preference.reminder1HourEnabled,
            reminder15Minutes:preference.reminder15MinutesEnabled,
            doctorNoShow:preference.doctorNoShowEnabled,
        },
    };
}

export function registerPushDevice(
    userId: string,
    input: RegisterPushDeviceInput,
) {
    return prisma.pushDeviceToken.upsert({
        where: { token: input.token },
        create: {
            userID: userId,
            token: input.token,
            platform: input.platform,
        },
        update: {
            userID: userId,
            platform: input.platform,
            enabled: true,
            lastRegisteredAt: new Date(),
        },
        select: {
            id: true,
            platform: true,
            lastRegisteredAt: true,
        },
    });
}

export async function unregisterPushDevice(
    userId: string,
    input: UnregisterPushDeviceInput,
) {
    await prisma.pushDeviceToken.deleteMany({
        where: {
            userID: userId,
            token: input.token,
        },
    });
}

export async function getNotificationPreference(userId:string){
    const preference=await prisma.notificationPreference.findUnique({
        where:{userID:userId},
    });
    return preferenceResponse(preference??defaultPreference);
}

export async function updateNotificationPreference(
    userId:string,
    input:UpdateNotificationPreferenceInput,
){
    const data={
        ...(input.channels?.push!==undefined?{pushEnabled:input.channels.push}:{}),
        ...(input.channels?.email!==undefined?{emailEnabled:input.channels.email}:{}),
        ...(input.events?.bookingCreated!==undefined?{bookingCreatedEnabled:input.events.bookingCreated}:{}),
        ...(input.events?.requestCreated!==undefined?{requestCreatedEnabled:input.events.requestCreated}:{}),
        ...(input.events?.requestConfirmed!==undefined?{requestConfirmedEnabled:input.events.requestConfirmed}:{}),
        ...(input.events?.requestRejected!==undefined?{requestRejectedEnabled:input.events.requestRejected}:{}),
        ...(input.events?.requestExpired!==undefined?{requestExpiredEnabled:input.events.requestExpired}:{}),
        ...(input.events?.appointmentCancelled!==undefined?{appointmentCancelledEnabled:input.events.appointmentCancelled}:{}),
        ...(input.events?.appointmentCompleted!==undefined?{appointmentCompletedEnabled:input.events.appointmentCompleted}:{}),
        ...(input.events?.reminder1Hour!==undefined?{reminder1HourEnabled:input.events.reminder1Hour}:{}),
        ...(input.events?.reminder15Minutes!==undefined?{reminder15MinutesEnabled:input.events.reminder15Minutes}:{}),
        ...(input.events?.doctorNoShow!==undefined?{doctorNoShowEnabled:input.events.doctorNoShow}:{}),
    };
    if(input.channels?.email===true){
        const user=await prisma.user.findUnique({where:{id:userId},select:{email:true}});
        if(!user?.email){
            throw new ApiError("EMAIL_REQUIRED");
        }
    }
    const preference=await prisma.notificationPreference.upsert({
        where:{userID:userId},
        create:{userID:userId,...data},
        update:data,
    });
    return preferenceResponse(preference);
}

async function getEnabledTypes(userId:string){
    const preference=await prisma.notificationPreference.findUnique({
        where:{userID:userId},
    });
    return getEnabledAppointmentNotificationTypes(preference);
}

export async function listNotifications(userId:string,query:ListNotificationsQuery){
    const enabledTypes=await getEnabledTypes(userId);
    const now=new Date();
    const where={
        recipientID:userId,
        type:{in:enabledTypes},
        scheduledAt:{lte:now},
        ...(query.unreadOnly?{readAt:null}:{}),
    };
    const skip=(query.page-1)*query.limit;
    const [items,total]=await prisma.$transaction([
        prisma.userNotification.findMany({
            where,
            select:{
                id:true,
                type:true,
                scheduledAt:true,
                readAt:true,
                createdAt:true,
                appointment:{select:{
                    id:true,
                    startAt:true,
                    status:true,
                    doctor:{select:{userID:true,fullName:true}},
                    patient:{select:{userID:true,fullName:true}},
                }},
            },
            orderBy:[{scheduledAt:"desc"},{id:"desc"}],
            skip,
            take:query.limit,
        }),
        prisma.userNotification.count({where}),
    ]);
    return {
        items:items.map((item)=>({
            ...item,
            ...buildAppointmentNotificationMessage(item),
        })),
        pagination:{
            page:query.page,
            limit:query.limit,
            total,
            totalPages:Math.ceil(total/query.limit),
        },
    };
}

export async function getUnreadNotificationCount(userId:string){
    const enabledTypes=await getEnabledTypes(userId);
    const count=await prisma.userNotification.count({
        where:{
            recipientID:userId,
            type:{in:enabledTypes},
            scheduledAt:{lte:new Date()},
            readAt:null,
        },
    });
    return {count};
}

export async function markNotificationRead(userId:string,notificationId:string){
    const updated=await prisma.userNotification.updateMany({
        where:{id:notificationId,recipientID:userId},
        data:{readAt:new Date()},
    });
    if(updated.count!==1){
        throw new ApiError("NOTIFICATION_NOT_FOUND");
    }
    return prisma.userNotification.findUniqueOrThrow({where:{id:notificationId}});
}

export async function markAllNotificationsRead(userId:string){
    const enabledTypes=await getEnabledTypes(userId);
    const result=await prisma.userNotification.updateMany({
        where:{
            recipientID:userId,
            type:{in:enabledTypes},
            scheduledAt:{lte:new Date()},
            readAt:null,
        },
        data:{readAt:new Date()},
    });
    return {updatedCount:result.count};
}
