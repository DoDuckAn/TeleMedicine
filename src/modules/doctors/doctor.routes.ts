import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validate.middleware.js";
import * as DoctorController from "./doctor.controller.js";
import * as DoctorSchema from "./doctor.schema.js";
import * as AppointmentController from "../appointments/appointment.controller.js";
import * as AppointmentSchema from "../appointments/appointment.schema.js";
import * as DoctorReviewController from "../doctor-reviews/doctor-review.controller.js";
import * as DoctorReviewSchema from "../doctor-reviews/doctor-review.schema.js";
import {requireAuth,requireRole} from "../../middleware/auth.middleware.js";
import {avatarUpload} from "../../middleware/avatar.middleware.js";
import * as ProfileController from "../profiles/profile.controller.js";
import * as ProfileSchema from "../profiles/profile.schema.js";
import * as AuthSchema from "../auth/auth.schema.js";
import * as AdminSchema from "../admin/admin.schema.js";
import * as StatisticsController from "../admin/statistics.controller.js";

export const doctorRouter = Router();

doctorRouter.get(
  "/me",
  requireAuth,
  requireRole("DOCTOR"),
  asyncHandler(ProfileController.getDoctorProfile),
);

doctorRouter.patch(
  "/me",
  requireAuth,
  requireRole("DOCTOR"),
  validateBody(ProfileSchema.updateDoctorProfileSchema),
  asyncHandler(ProfileController.updateDoctorProfile),
);

doctorRouter.patch(
  "/me/password",
  requireAuth,
  requireRole("DOCTOR"),
  validateBody(AuthSchema.changeDoctorPasswordSchema),
  asyncHandler(ProfileController.changeDoctorPassword),
);

doctorRouter.post(
  "/me/password/request-otp",
  requireAuth,
  requireRole("DOCTOR"),
  asyncHandler(ProfileController.requestDoctorPasswordChangeOtp),
);

doctorRouter.get(
  "/me/statistics",
  requireAuth,
  requireRole("DOCTOR"),
  validateQuery(AdminSchema.statisticsQuerySchema),
  asyncHandler(StatisticsController.ownDoctorStatistics),
);

doctorRouter.post(
  "/me/avatar",
  requireAuth,
  requireRole("DOCTOR"),
  avatarUpload.single("avatar"),
  asyncHandler(ProfileController.updateDoctorAvatar),
);

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

doctorRouter.get(
  "/:doctorId/reviews",
  validateParams(DoctorSchema.doctorIdParamSchema),
  validateQuery(DoctorReviewSchema.publicDoctorReviewsQuerySchema),
  asyncHandler(DoctorReviewController.listPublicDoctorReviews),
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
