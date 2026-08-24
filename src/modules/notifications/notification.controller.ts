import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import type {
    ListNotificationsQuery,
    RegisterPushDeviceInput,
    UnregisterPushDeviceInput,
    UpdateNotificationPreferenceInput,
} from "./notification.schema.js";
import {
    listNotificationsQuerySchema,
    notificationIdParamSchema,
} from "./notification.schema.js";
import * as NotificationService from "./notification.service.js";

export async function registerPushDevice(req: Request, res: Response) {
    const input = req.body as RegisterPushDeviceInput;
    return ok(
        res,
        await NotificationService.registerPushDevice(req.user!.id, input),
        201,
    );
}

export async function unregisterPushDevice(req: Request, res: Response) {
    const input = req.body as UnregisterPushDeviceInput;
    await NotificationService.unregisterPushDevice(req.user!.id, input);
    return ok(res, { removed: true });
}

export async function listNotifications(req:Request,res:Response){
    const query=listNotificationsQuerySchema.parse(req.query) as ListNotificationsQuery;
    return ok(res,await NotificationService.listNotifications(req.user!.id,query));
}

export async function unreadCount(req:Request,res:Response){
    return ok(res,await NotificationService.getUnreadNotificationCount(req.user!.id));
}

export async function markRead(req:Request,res:Response){
    const {notificationId}=notificationIdParamSchema.parse(req.params);
    return ok(res,await NotificationService.markNotificationRead(req.user!.id,notificationId));
}

export async function markAllRead(req:Request,res:Response){
    return ok(res,await NotificationService.markAllNotificationsRead(req.user!.id));
}

export async function getPreference(req:Request,res:Response){
    return ok(res,await NotificationService.getNotificationPreference(req.user!.id));
}

export async function updatePreference(req:Request,res:Response){
    const input=req.body as UpdateNotificationPreferenceInput;
    return ok(res,await NotificationService.updateNotificationPreference(req.user!.id,input));
}
