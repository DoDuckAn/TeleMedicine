import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validate.middleware.js";
import {
  adminAppointmentListQuerySchema,
  appointmentIdParamSchema,
  appointmentHistoryQuerySchema,
  bookingAppointmentBodySchema,
  cancelAppointmentSchema,
  doctorAppointmentListQuerySchema,
  rejectAppointmentSchema,
} from "./appointment.schema.js";
import { asyncHandler } from "../../common/async-handler.js";
import * as AppointmentController from "./appointment.controller.js";

export const appointmentRouter = Router();

appointmentRouter.post(
  "/",
  requireAuth,
  requireRole("PATIENT"),
  validateBody(bookingAppointmentBodySchema),
  asyncHandler(AppointmentController.bookAppointment),
);

appointmentRouter.get(
  "/upcoming",
  requireAuth,
  requireRole("PATIENT"),
  validateQuery(doctorAppointmentListQuerySchema),
  asyncHandler(AppointmentController.getPatientUpcomingAppointments),
);

appointmentRouter.get(
  "/history",
  requireAuth,
  requireRole("PATIENT", "DOCTOR"),
  validateQuery(appointmentHistoryQuerySchema),
  asyncHandler(AppointmentController.getOwnAppointmentHistory),
);

appointmentRouter.get(
  "/admin/all",
  requireAuth,
  requireRole("ADMIN"),
  validateQuery(adminAppointmentListQuerySchema),
  asyncHandler(AppointmentController.getAllAppointments),
);

appointmentRouter.get(
  "/doctor/pending",
  requireAuth,
  requireRole("DOCTOR"),
  validateQuery(doctorAppointmentListQuerySchema),
  asyncHandler(AppointmentController.getDoctorPendingAppointments),
);

appointmentRouter.get(
  "/doctor/upcoming",
  requireAuth,
  requireRole("DOCTOR"),
  validateQuery(doctorAppointmentListQuerySchema),
  asyncHandler(AppointmentController.getDoctorUpcomingAppointments),
);

appointmentRouter.post(
  "/:appointmentId/confirm",
  requireAuth,
  requireRole("DOCTOR"),
  validateParams(appointmentIdParamSchema),
  asyncHandler(AppointmentController.confirmAppointment),
);

appointmentRouter.post(
  "/:appointmentId/reject",
  requireAuth,
  requireRole("DOCTOR"),
  validateParams(appointmentIdParamSchema),
  validateBody(rejectAppointmentSchema),
  asyncHandler(AppointmentController.rejectAppointment),
);

appointmentRouter.post(
  "/:appointmentId/cancel",
  requireAuth,
  requireRole("PATIENT", "DOCTOR", "ADMIN"),
  validateParams(appointmentIdParamSchema),
  validateBody(cancelAppointmentSchema),
  asyncHandler(AppointmentController.cancelAppointment),
);

appointmentRouter.get(
  "/:appointmentId",
  requireAuth,
  requireRole("PATIENT", "DOCTOR", "ADMIN"),
  validateParams(appointmentIdParamSchema),
  asyncHandler(AppointmentController.getAppointmentDetail),
);
