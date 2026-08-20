import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validateBody } from "../../middleware/validate.middleware.js";
import * as NotificationController from "./notification.controller.js";
import {
    registerPushDeviceSchema,
    unregisterPushDeviceSchema,
} from "./notification.schema.js";

export const notificationRouter = Router();

notificationRouter.post(
    "/devices",
    requireAuth,
    validateBody(registerPushDeviceSchema),
    asyncHandler(NotificationController.registerPushDevice),
);

notificationRouter.delete(
    "/devices",
    requireAuth,
    validateBody(unregisterPushDeviceSchema),
    asyncHandler(NotificationController.unregisterPushDevice),
);
