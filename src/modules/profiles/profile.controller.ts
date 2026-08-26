import type {Request,Response} from "express";
import {ok} from "../../common/response.js";
import * as ProfileService from "./profile.service.js";
import * as DoctorPasswordService from "../auth/doctor-password.service.js";

export async function getPatientProfile(req:Request,res:Response){
    return ok(res,await ProfileService.getPatientProfile(req.user!.id));
}

export async function updatePatientProfile(req:Request,res:Response){
    return ok(res,await ProfileService.updatePatientProfile(req.user!.id,req.body));
}

export async function updatePatientAvatar(req:Request,res:Response){
    return ok(res,await ProfileService.updatePatientAvatar(req.user!.id,req.file));
}

export async function getDoctorProfile(req:Request,res:Response){
    return ok(res,await ProfileService.getDoctorProfile(req.user!.id));
}

export async function updateDoctorProfile(req:Request,res:Response){
    return ok(res,await ProfileService.updateDoctorProfile(req.user!.id,req.body));
}

export async function requestDoctorPasswordChangeOtp(req:Request,res:Response){
    return ok(res,await DoctorPasswordService.requestDoctorPasswordChangeOtp(req.user!.id),201);
}

export async function changeDoctorPassword(req:Request,res:Response){
    return ok(res,await DoctorPasswordService.changeDoctorPassword(req.user!.id,req.body));
}

export async function updateDoctorAvatar(req:Request,res:Response){
    return ok(res,await ProfileService.updateDoctorAvatar(req.user!.id,req.file));
}
