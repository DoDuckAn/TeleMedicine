import type { Request, Response } from "express";
import { ok } from "../../common/response.js";
import {
  adminAppointmentListQuerySchema,
  appointmentIdParamSchema,
  appointmentHistoryQuerySchema,
  doctorAppointmentListQuerySchema,
  doctorAvailabilityInputSchema,
  type CancelAppointmentInput,
  type CreateAppointmentBody,
  type RejectAppointmentInput,
} from "./appointment.schema.js";
import * as AvailabilityService from "./availability.service.js";
import * as AppointmentService from "./appointment.service.js";

export async function availability(req: Request, res: Response) {
  const input = doctorAvailabilityInputSchema.parse(req.params);
  return ok(res, await AvailabilityService.getDoctorAvailability(input));
}

export async function bookAppointment(req: Request, res: Response) {
  const body = req.body as CreateAppointmentBody;
  const appointment = await AppointmentService.createAppointment({
    ...body,
    patientId: req.user!.id,
  });

  return ok(res, appointment, 201);
}

export async function getDoctorPendingAppointments(
  req: Request,
  res: Response,
) {
  const query = doctorAppointmentListQuerySchema.parse(req.query);
  return ok(
    res,
    await AppointmentService.getDoctorPendingAppointments(req.user!.id, query),
  );
}

export async function getDoctorUpcomingAppointments(
  req: Request,
  res: Response,
) {
  const query = doctorAppointmentListQuerySchema.parse(req.query);
  return ok(
    res,
    await AppointmentService.getDoctorUpcomingAppointments(req.user!.id, query),
  );
}

export async function getPatientUpcomingAppointments(
  req: Request,
  res: Response,
) {
  const query = doctorAppointmentListQuerySchema.parse(req.query);
  return ok(
    res,
    await AppointmentService.getPatientUpcomingAppointments(req.user!.id, query),
  );
}

export async function getOwnAppointmentHistory(req: Request, res: Response) {
  const query = appointmentHistoryQuerySchema.parse(req.query);
  return ok(
    res,
    await AppointmentService.getOwnAppointmentHistory(req.user!, query),
  );
}

export async function getPatientMedicalHistory(req:Request,res:Response){
  const query=appointmentHistoryQuerySchema.parse(req.query);
  return ok(
    res,
    await AppointmentService.getPatientMedicalHistory(req.user!.id,query),
  );
}

export async function getDoctorConsultationHistory(req:Request,res:Response){
  const query=appointmentHistoryQuerySchema.parse(req.query);
  return ok(
    res,
    await AppointmentService.getDoctorConsultationHistory(req.user!.id,query),
  );
}

export async function getAllAppointments(req: Request, res: Response) {
  const query = adminAppointmentListQuerySchema.parse(req.query);
  return ok(res, await AppointmentService.getAllAppointments(query));
}

export async function getAppointmentDetail(req: Request, res: Response) {
  const { appointmentId } = appointmentIdParamSchema.parse(req.params);
  return ok(
    res,
    await AppointmentService.getAppointmentDetail(req.user!, appointmentId),
  );
}

export async function confirmAppointment(req: Request, res: Response) {
  const { appointmentId } = appointmentIdParamSchema.parse(req.params);
  return ok(
    res,
    await AppointmentService.confirmAppointment(req.user!.id, appointmentId),
  );
}

export async function completeAppointment(req: Request, res: Response) {
  const { appointmentId } = appointmentIdParamSchema.parse(req.params);
  return ok(
    res,
    await AppointmentService.completeAppointment(req.user!.id, appointmentId),
  );
}

export async function rejectAppointment(req: Request, res: Response) {
  const { appointmentId } = appointmentIdParamSchema.parse(req.params);
  const body = req.body as RejectAppointmentInput;
  return ok(
    res,
    await AppointmentService.rejectAppointment(
      req.user!.id,
      appointmentId,
      body.reason,
    ),
  );
}

export async function cancelAppointment(req: Request, res: Response) {
  const { appointmentId } = appointmentIdParamSchema.parse(req.params);
  const body = req.body as CancelAppointmentInput;
  return ok(
    res,
    await AppointmentService.cancelAppointment(
      req.user!,
      appointmentId,
      body.reason,
    ),
  );
}
