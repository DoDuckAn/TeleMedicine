import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import * as AuthService from "./auth.service.js";
import * as DoctorPasswordService from "./doctor-password.service.js";

export async function registerPatient(req:Request,res:Response){
  return ok(res,await AuthService.registerPatient(req.body),201);
}

export async function loginPatient(req: Request, res: Response) {
  const result = await AuthService.loginPatient(req.body);
  return ok(res, result);
}

export async function loginStaff(req: Request, res: Response) {
  const result = await AuthService.loginStaff(req.body);
  return ok(res, result);
}

export async function requestDoctorPasswordResetOtp(req:Request,res:Response){
  return ok(res,await DoctorPasswordService.requestDoctorPasswordResetOtp(req.body.email),201);
}

export async function resetDoctorPassword(req:Request,res:Response){
  return ok(res,await DoctorPasswordService.resetDoctorPassword(req.body));
}

export async function createDoctor(req: Request, res: Response) {
  const doctor = await AuthService.createDoctor(req.body);
  return ok(res, doctor, 201);
}

export async function me(req: Request, res: Response) {
  const user = await AuthService.getMe(req.user!.id);
  return ok(res, user);
}

export async function refresh(req: Request, res: Response) {
  const result = await AuthService.refresh(req.body);
  return ok(res, result);
}

export async function logout(req: Request, res: Response) {
  await AuthService.logout(req.body);
  return ok(res, {
    message: "Da dang xuat khoi thiet bi",
  });
}

export async function logoutAll(req: Request, res: Response) {
  await AuthService.logoutAll(req.user!.id);
  return ok(res, {
    message: "Da dang xuat khoi cac thiet bi",
  });
}
