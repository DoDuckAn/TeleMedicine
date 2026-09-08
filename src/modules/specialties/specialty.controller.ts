import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import * as SpecialtyService from "./specialty.service.js";

export async function updateDoctors(req:Request,res:Response){
  const {specialtyId}=specialtyIdParamSchema.parse(req.params);
  return ok(res,await SpecialtyService.updateSpecialtyDoctors(specialtyId,req.body));
}
import {
  doctorSpecialtyParamSchema,
  specialtyIdParamSchema,
} from "./specialty.schema.js";

export async function list(_req: Request, res: Response) {
  return ok(res, await SpecialtyService.listSpecialties());
}

export async function adminList(_req: Request, res: Response) {
  return ok(res, await SpecialtyService.listAllSpecialties());
}

export async function detail(req: Request, res: Response) {
  const { specialtyId } = specialtyIdParamSchema.parse(req.params);
  return ok(res, await SpecialtyService.getSpecialty(specialtyId));
}

export async function doctors(req: Request, res: Response) {
  const { specialtyId } = specialtyIdParamSchema.parse(req.params);
  const specialty = await SpecialtyService.getSpecialty(specialtyId);
  return ok(res, specialty.doctors);
}

export async function create(req: Request, res: Response) {
  return ok(res, await SpecialtyService.createSpecialty(req.body), 201);
}

export async function update(req: Request, res: Response) {
  const { specialtyId } = specialtyIdParamSchema.parse(req.params);
  return ok(
    res,
    await SpecialtyService.updateSpecialty(specialtyId, req.body),
  );
}

export async function remove(req: Request, res: Response) {
  const { specialtyId } = specialtyIdParamSchema.parse(req.params);
  return ok(res, await SpecialtyService.deleteSpecialty(specialtyId));
}

export async function addDoctor(req: Request, res: Response) {
  const { specialtyId, doctorId } = doctorSpecialtyParamSchema.parse(req.params);
  return ok(
    res,
    await SpecialtyService.addDoctorToSpecialty(specialtyId, doctorId),
  );
}

export async function removeDoctor(req: Request, res: Response) {
  const { specialtyId, doctorId } = doctorSpecialtyParamSchema.parse(req.params);
  return ok(
    res,
    await SpecialtyService.removeDoctorFromSpecialty(specialtyId, doctorId),
  );
}
