import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import {
  doctorIdParamSchema,
  listDoctorsQuerySchema,
} from "./doctor.schema.js";
import * as DoctorService from "./doctor.service.js";

export async function list(req: Request, res: Response) {
  const query = listDoctorsQuerySchema.parse(req.query);
  return ok(res, await DoctorService.listDoctors(query));
}

export async function detail(req: Request, res: Response) {
  const { doctorId } = doctorIdParamSchema.parse(req.params);
  return ok(res, await DoctorService.getDoctorDetail(doctorId));
}

export async function schedule(req: Request, res: Response) {
  const { doctorId } = doctorIdParamSchema.parse(req.params);
  return ok(res, await DoctorService.getDoctorSchedule(doctorId));
}
