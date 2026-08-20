import { prisma } from "../../lib/prisma.js";
import type {
    RegisterPushDeviceInput,
    UnregisterPushDeviceInput,
} from "./notification.schema.js";

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
