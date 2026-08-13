import { Router } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../middleware/validate.middleware.js";
import * as SpecialtyController from "./specialty.controller.js";
import * as SpecialtySchema from "./specialty.schema.js";

export const specialtyRouter = Router();

specialtyRouter.get("/", asyncHandler(SpecialtyController.list));

specialtyRouter.get(
  "/:specialtyId",
  validateParams(SpecialtySchema.specialtyIdParamSchema),
  asyncHandler(SpecialtyController.detail),
);

specialtyRouter.get(
  "/:specialtyId/doctors",
  validateParams(SpecialtySchema.specialtyIdParamSchema),
  asyncHandler(SpecialtyController.doctors),
);

specialtyRouter.use(requireAuth, requireRole("ADMIN"));

specialtyRouter.post(
  "/",
  validateBody(SpecialtySchema.createSpecialtySchema),
  asyncHandler(SpecialtyController.create),
);

specialtyRouter.patch(
  "/:specialtyId",
  validateParams(SpecialtySchema.specialtyIdParamSchema),
  validateBody(SpecialtySchema.updateSpecialtySchema),
  asyncHandler(SpecialtyController.update),
);

specialtyRouter.delete(
  "/:specialtyId",
  validateParams(SpecialtySchema.specialtyIdParamSchema),
  asyncHandler(SpecialtyController.remove),
);

specialtyRouter.post(
  "/:specialtyId/doctors/:doctorId",
  validateParams(SpecialtySchema.doctorSpecialtyParamSchema),
  asyncHandler(SpecialtyController.addDoctor),
);

specialtyRouter.delete(
  "/:specialtyId/doctors/:doctorId",
  validateParams(SpecialtySchema.doctorSpecialtyParamSchema),
  asyncHandler(SpecialtyController.removeDoctor),
);
