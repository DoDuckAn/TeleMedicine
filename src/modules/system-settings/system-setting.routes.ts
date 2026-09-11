import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { validateBody } from "../../middleware/validate.middleware.js";
import * as controller from "./system-setting.controller.js";
import { saveSystemSettingsSchema } from "./system-setting.schema.js";

export const systemSettingRouter = Router();
export const adminSystemSettingRouter = Router();

systemSettingRouter.get("/schedule", asyncHandler(controller.getScheduleSettings));

adminSystemSettingRouter.use(requireAuth, requireRole("ADMIN"));
adminSystemSettingRouter.get("/", asyncHandler(controller.getAdminSystemSettings));
adminSystemSettingRouter.put(
  "/",
  validateBody(saveSystemSettingsSchema),
  asyncHandler(controller.saveSystemSettings),
);
