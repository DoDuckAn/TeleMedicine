import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import {publishAppointmentChanged,publishScheduleChanged} from "../../lib/realtime.js";
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
  const result=await ScheduleService.updateWeeklySchedule(req.user!.id, input);
  await publishScheduleChanged(req.user!.id);
  return ok(res,result);
}

export async function listOverrides(req: Request, res: Response) {
  const query=listScheduleOverridesQuerySchema.parse(req.query);
  return ok(res, await ScheduleService.listOverrides(req.user!.id, query));
}

export async function createOverride(req: Request, res: Response) {
  const input=req.body as CreateScheduleOverrideInput;
  const result=await ScheduleService.createOverride(req.user!.id, input);
  for(const id of result.cancelledAppointmentIds)await publishAppointmentChanged(id);
  await publishScheduleChanged(req.user!.id);
  return ok(res,result,201);
}

export async function restoreOverrides(req: Request, res: Response) {
  const input=req.body as RestoreScheduleOverridesInput;
  const result=await ScheduleService.restoreOverrides(req.user!.id, input);
  await publishScheduleChanged(req.user!.id);
  return ok(res,result);
}

export async function deleteOverride(req: Request, res: Response) {
  const { overrideId }=scheduleOverrideIdParamSchema.parse(req.params);
  await ScheduleService.deleteOverride(req.user!.id, overrideId);
  await publishScheduleChanged(req.user!.id);
  return ok(res, { removed: true });
}

export async function getCalendar(req: Request, res: Response) {
  const query=doctorCalendarQuerySchema.parse(req.query);
  return ok(
    res,
    await ScheduleService.getDoctorCalendar(req.user!.id, query),
  );
}
