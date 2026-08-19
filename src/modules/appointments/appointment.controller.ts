import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import { doctorAvailabilityInputSchema } from "./appointment.schema.js";
import * as AvailabilityService from "./availability.service.js";

export async function availability(req: Request, res: Response) {
  const input = doctorAvailabilityInputSchema.parse(req.params);
  return ok(res, await AvailabilityService.getDoctorAvailability(input));
}
