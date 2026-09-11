import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import type { SaveSystemSettingsInput } from "./system-setting.schema.js";
import * as service from "./system-setting.service.js";

export async function getScheduleSettings(_req: Request, res: Response) {
  return ok(res, await service.getPublicScheduleSettings());
}

export async function getAdminSystemSettings(_req: Request, res: Response) {
  return ok(res, await service.getAdminSystemSettings());
}

export async function saveSystemSettings(req: Request, res: Response) {
  return ok(res, await service.saveSystemSettings(req.user!.id, req.body as SaveSystemSettingsInput));
}
