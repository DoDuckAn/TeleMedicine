import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import * as ScheduleService from "./schedule-override.service.js";
import {
  doctorCalendarQuerySchema,
  listScheduleOverridesQuerySchema,
  scheduleOverrideIdParamSchema,
  type CreateScheduleOverrideInput,
  type RestoreScheduleOverridesInput,
  type UpdateWeeklyScheduleInput,
} from "./schedule-override.schema.js";

export async function getWeeklySchedule(req: Request, res: Response) {
  return ok(res, await ScheduleService.getWeeklySchedule(req.user!.id));
}

export async function updateWeeklySchedule(req: Request, res: Response) {
  const input=req.body as UpdateWeeklyScheduleInput;
  return ok(res, await ScheduleService.updateWeeklySchedule(req.user!.id, input));
}

export async function listOverrides(req: Request, res: Response) {
  const query=listScheduleOverridesQuerySchema.parse(req.query);
  return ok(res, await ScheduleService.listOverrides(req.user!.id, query));
}

export async function createOverride(req: Request, res: Response) {
  const input=req.body as CreateScheduleOverrideInput;
  return ok(
    res,
    await ScheduleService.createOverride(req.user!.id, input),
    201,
  );
}

export async function restoreOverrides(req: Request, res: Response) {
  const input=req.body as RestoreScheduleOverridesInput;
  return ok(
    res,
    await ScheduleService.restoreOverrides(req.user!.id, input),
  );
}

export async function deleteOverride(req: Request, res: Response) {
  const { overrideId }=scheduleOverrideIdParamSchema.parse(req.params);
  await ScheduleService.deleteOverride(req.user!.id, overrideId);
  return ok(res, { removed: true });
}

export async function getCalendar(req: Request, res: Response) {
  const query=doctorCalendarQuerySchema.parse(req.query);
  return ok(
    res,
    await ScheduleService.getDoctorCalendar(req.user!.id, query),
  );
}
