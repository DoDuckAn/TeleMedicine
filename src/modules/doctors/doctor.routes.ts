import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import {
  validateParams,
  validateQuery,
} from "../../middleware/validate.middleware.js";
import * as DoctorController from "./doctor.controller.js";
import * as DoctorSchema from "./doctor.schema.js";
import * as AppointmentController from "../appointments/appointment.controller.js";
import * as AppointmentSchema from "../appointments/appointment.schema.js";

export const doctorRouter = Router();

doctorRouter.get(
  "/",
  validateQuery(DoctorSchema.listDoctorsQuerySchema),
  asyncHandler(DoctorController.list),
);

doctorRouter.get(
  "/:doctorId/schedule",
  validateParams(AppointmentSchema.doctorAvailabilityParamSchema),
  asyncHandler(AppointmentController.availability),
);

// doctorRouter.get(
//   "/:doctorId/schedule",
//   validateParams(DoctorSchema.doctorIdParamSchema),
//   asyncHandler(DoctorController.schedule),
// );

doctorRouter.get(
  "/:doctorId",
  validateParams(DoctorSchema.doctorIdParamSchema),
  asyncHandler(DoctorController.detail),
);
