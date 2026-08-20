import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import type {
    RegisterPushDeviceInput,
    UnregisterPushDeviceInput,
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
