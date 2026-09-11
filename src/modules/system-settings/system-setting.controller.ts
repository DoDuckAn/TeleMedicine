import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import type { UpdateScheduleSettingsInput } from "./system-setting.schema.js";
import * as service from "./system-setting.service.js";

export async function getScheduleSettings(_req: Request, res: Response) {
  return ok(res, await service.getPublicScheduleSettings());
}

export async function updateScheduleSettings(req: Request, res: Response) {
  return ok(
    res,
    await service.updateScheduleSettings(req.body as UpdateScheduleSettingsInput),
  );
}
