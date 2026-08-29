import type {Request,Response} from "express";
import {ok} from "../../common/response.js";
import {
    adminDoctorIdParamSchema,
    statisticsQuerySchema,
} from "./admin.schema.js";
import * as StatisticsService from "./statistics.service.js";

export async function adminDashboard(req:Request,res:Response){
    const query=statisticsQuerySchema.parse(req.query);
    return ok(res,await StatisticsService.getAppointmentStatistics(query));
}

export async function adminDoctorStatistics(req:Request,res:Response){
    const query=statisticsQuerySchema.parse(req.query);
    const {doctorId}=adminDoctorIdParamSchema.parse(req.params);
    return ok(res,await StatisticsService.getAppointmentStatistics(query,doctorId));
}

export async function ownDoctorStatistics(req:Request,res:Response){
    const query=statisticsQuerySchema.parse(req.query);
    return ok(res,await StatisticsService.getAppointmentStatistics(query,req.user!.id));
}
