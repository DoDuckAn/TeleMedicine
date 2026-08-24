import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validate.middleware.js";
import * as ScheduleController from "./schedule-override.controller.js";
import {
  createScheduleOverrideSchema,
  doctorCalendarQuerySchema,
  listScheduleOverridesQuerySchema,
  restoreScheduleOverridesSchema,
  scheduleOverrideIdParamSchema,
  updateWeeklyScheduleSchema,
} from "./schedule-override.schema.js";

export const doctorScheduleRouter=Router();

doctorScheduleRouter.use(requireAuth, requireRole("DOCTOR"));

doctorScheduleRouter.get("/weekly",
  asyncHandler(ScheduleController.getWeeklySchedule),
);

doctorScheduleRouter.put("/weekly",
  validateBody(updateWeeklyScheduleSchema),
  asyncHandler(ScheduleController.updateWeeklySchedule),
);

doctorScheduleRouter.get("/overrides",
  validateQuery(listScheduleOverridesQuerySchema),
  asyncHandler(ScheduleController.listOverrides),
);

doctorScheduleRouter.post(
  "/overrides",
  validateBody(createScheduleOverrideSchema),
  asyncHandler(ScheduleController.createOverride),
);

doctorScheduleRouter.post(
  "/overrides/restore",
  validateBody(restoreScheduleOverridesSchema),
  asyncHandler(ScheduleController.restoreOverrides),
);

doctorScheduleRouter.delete(
  "/overrides/:overrideId",
  validateParams(scheduleOverrideIdParamSchema),
  asyncHandler(ScheduleController.deleteOverride),
);

doctorScheduleRouter.get(
  "/calendar",
  validateQuery(doctorCalendarQuerySchema),
  asyncHandler(ScheduleController.getCalendar),
);
