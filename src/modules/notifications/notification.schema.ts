import { z } from "zod";
import { PushDevicePlatform } from "../../../generated/prisma/enums.js";

export const registerPushDeviceSchema = z.object({
    token: z.string().trim().min(20).max(4096),
    platform: z.enum([
        PushDevicePlatform.WEB,
        PushDevicePlatform.ANDROID,
        PushDevicePlatform.IOS,
    ]),
});

export const unregisterPushDeviceSchema = z.object({
    token: z.string().trim().min(20).max(4096),
});

export const listNotificationsQuerySchema=z.object({
    unreadOnly:z.enum(["true","false"])
        .transform((value)=>value==="true")
        .default(false),
    page:z.coerce.number().int().positive().default(1),
    limit:z.coerce.number().int().positive().max(100).default(20),
});

const notificationEventSettingsSchema=z.object({
    bookingCreated:z.boolean(),
    requestCreated:z.boolean(),
    requestConfirmed:z.boolean(),
    requestRejected:z.boolean(),
    requestExpired:z.boolean(),
    appointmentCancelled:z.boolean(),
    appointmentCompleted:z.boolean(),
    reminder1Hour:z.boolean(),
    reminder15Minutes:z.boolean(),
    doctorNoShow:z.boolean(),
}).partial();

export const updateNotificationPreferenceSchema=z
    .object({
        channels:z.object({
            push:z.boolean(),
            email:z.boolean(),
        }).partial().optional(),
        events:notificationEventSettingsSchema.optional(),
    })
    .refine((input)=>(
        Object.keys(input.channels??{}).length>0||
        Object.keys(input.events??{}).length>0
    ),"Can cung cap it nhat mot cai dat");

export const notificationIdParamSchema=z.object({
    notificationId:z.string().trim().min(1),
});

export type RegisterPushDeviceInput = z.infer<
    typeof registerPushDeviceSchema
>;
export type UnregisterPushDeviceInput = z.infer<
    typeof unregisterPushDeviceSchema
>;
export type ListNotificationsQuery=z.infer<typeof listNotificationsQuerySchema>;
export type UpdateNotificationPreferenceInput=z.infer<typeof updateNotificationPreferenceSchema>;
