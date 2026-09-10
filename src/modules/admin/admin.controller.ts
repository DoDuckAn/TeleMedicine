import type {Request,Response} from "express";
import {UserRole} from "../../../generated/prisma/enums.js";
import {ok} from "../../common/response.js";
import {publishScheduleChanged} from "../../lib/realtime.js";
import * as AuthService from "../auth/auth.service.js";
import {
    adminDoctorIdParamSchema,
    adminDoctorListQuerySchema,
    adminPatientListQuerySchema,
    adminUserIdParamSchema,
} from "./admin.schema.js";
import * as AdminService from "./admin.service.js";
import {listOverrides} from "../schedule-overrides/schedule-override.service.js";
import {listScheduleOverridesQuerySchema} from "../schedule-overrides/schedule-override.schema.js";

export async function listDoctorOverrides(req:Request,res:Response){
    const {doctorId}=adminDoctorIdParamSchema.parse(req.params);
    return ok(res,await listOverrides(doctorId,listScheduleOverridesQuerySchema.parse(req.query),true));
}

export async function createDoctor(req:Request,res:Response){
    return ok(res,await AuthService.createDoctor(req.body),201);
}

export async function listDoctors(req:Request,res:Response){
    const query=adminDoctorListQuerySchema.parse(req.query);
    return ok(res,await AdminService.listDoctors(query));
}

export async function getDoctorDetail(req:Request,res:Response){
    const {doctorId}=adminDoctorIdParamSchema.parse(req.params);
    return ok(res,await AdminService.getDoctorDetail(doctorId));
}

export async function updateDoctor(req:Request,res:Response){
    const {doctorId}=adminDoctorIdParamSchema.parse(req.params);
    const result=await AdminService.updateDoctor(doctorId,req.body);
    await publishScheduleChanged(doctorId);
    return ok(res,result);
}

export async function updateDoctorStatus(req:Request,res:Response){
    const {doctorId}=adminDoctorIdParamSchema.parse(req.params);
    return ok(res,await AdminService.updateUserStatus(
        req.user!.id,
        doctorId,
        UserRole.DOCTOR,
        req.body,
    ));
}

export async function listPatients(req:Request,res:Response){
    const query=adminPatientListQuerySchema.parse(req.query);
    return ok(res,await AdminService.listPatients(query));
}

export async function getPatientDetail(req:Request,res:Response){
    const {userId}=adminUserIdParamSchema.parse(req.params);
    return ok(res,await AdminService.getPatientDetail(userId));
}

export async function updatePatientStatus(req:Request,res:Response){
    const {userId}=adminUserIdParamSchema.parse(req.params);
    return ok(res,await AdminService.updateUserStatus(
        req.user!.id,
        userId,
        UserRole.PATIENT,
        req.body,
    ));
}
