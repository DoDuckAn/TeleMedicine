import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth,requireRole } from "../../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validate.middleware.js";
import * as DoctorReviewController from "./doctor-review.controller.js";
import * as DoctorReviewSchema from "./doctor-review.schema.js";

export const doctorReviewRouter=Router();

doctorReviewRouter.get(
  "/me",
  requireAuth,
  requireRole("DOCTOR"),
  validateQuery(DoctorReviewSchema.ownDoctorReviewsQuerySchema),
  asyncHandler(DoctorReviewController.listOwnDoctorReviews),
);

doctorReviewRouter.get(
  "/admin",
  requireAuth,
  requireRole("ADMIN"),
  validateQuery(DoctorReviewSchema.adminDoctorReviewsQuerySchema),
  asyncHandler(DoctorReviewController.listAdminDoctorReviews),
);

doctorReviewRouter.get(
  "/:doctorId/eligibility",
  requireAuth,
  requireRole("PATIENT"),
  validateParams(DoctorReviewSchema.doctorIdParamSchema),
  asyncHandler(DoctorReviewController.getReviewEligibility),
);

doctorReviewRouter.post(
  "/:reviewId/reply",
  requireAuth,
  requireRole("DOCTOR"),
  validateParams(DoctorReviewSchema.reviewIdParamSchema),
  validateBody(DoctorReviewSchema.replyDoctorReviewSchema),
  asyncHandler(DoctorReviewController.replyDoctorReview),
);

doctorReviewRouter.patch(
  "/:reviewId/moderation",
  requireAuth,
  requireRole("ADMIN"),
  validateParams(DoctorReviewSchema.reviewIdParamSchema),
  validateBody(DoctorReviewSchema.moderateDoctorReviewSchema),
  asyncHandler(DoctorReviewController.moderateDoctorReview),
);

doctorReviewRouter.post(
  "/:doctorId",
  requireAuth,
  requireRole("PATIENT"),
  validateParams(DoctorReviewSchema.doctorIdParamSchema),
  validateBody(DoctorReviewSchema.createDoctorReviewSchema),
  asyncHandler(DoctorReviewController.createDoctorReview),
);
