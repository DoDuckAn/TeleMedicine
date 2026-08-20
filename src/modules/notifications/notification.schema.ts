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

export type RegisterPushDeviceInput = z.infer<
    typeof registerPushDeviceSchema
>;
export type UnregisterPushDeviceInput = z.infer<
    typeof unregisterPushDeviceSchema
>;
