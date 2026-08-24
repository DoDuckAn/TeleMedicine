import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validateBody,validateParams,validateQuery } from "../../middleware/validate.middleware.js";
import * as NotificationController from "./notification.controller.js";
import {
    registerPushDeviceSchema,
    unregisterPushDeviceSchema,
    listNotificationsQuerySchema,
    notificationIdParamSchema,
    updateNotificationPreferenceSchema,
} from "./notification.schema.js";

export const notificationRouter = Router();

notificationRouter.get(
    "/",
    requireAuth,
    validateQuery(listNotificationsQuerySchema),
    asyncHandler(NotificationController.listNotifications),
);

notificationRouter.get(
    "/unread-count",
    requireAuth,
    asyncHandler(NotificationController.unreadCount),
);

notificationRouter.patch(
    "/read-all",
    requireAuth,
    asyncHandler(NotificationController.markAllRead),
);

notificationRouter.get(
    "/preferences",
    requireAuth,
    asyncHandler(NotificationController.getPreference),
);

notificationRouter.patch(
    "/preferences",
    requireAuth,
    validateBody(updateNotificationPreferenceSchema),
    asyncHandler(NotificationController.updatePreference),
);

notificationRouter.patch(
    "/:notificationId/read",
    requireAuth,
    validateParams(notificationIdParamSchema),
    asyncHandler(NotificationController.markRead),
);

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
