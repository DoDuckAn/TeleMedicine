import { Router } from "express";
import { validateBody } from "../../middleware/validate.middleware.js";
import * as AuthSchema from "./auth.schema.js";
import { asyncHandler } from "../../common/async-handler.js";
import * as AuthController from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post(
  "/register/patient",
  validateBody(AuthSchema.registerPatientSchema),
  asyncHandler(AuthController.registerPatient),
);

authRouter.post(
  "/login/patient",
  validateBody(AuthSchema.loginPatientSchema),
  asyncHandler(AuthController.loginPatient),
);

authRouter.post(
  "/login/staff",
  validateBody(AuthSchema.loginStaffSchema),
  asyncHandler(AuthController.loginStaff),
);

authRouter.post(
  "/doctors/password/forgot/request-otp",
  validateBody(AuthSchema.requestDoctorPasswordResetOtpSchema),
  asyncHandler(AuthController.requestDoctorPasswordResetOtp),
);

authRouter.post(
  "/doctors/password/forgot/reset",
  validateBody(AuthSchema.resetDoctorPasswordSchema),
  asyncHandler(AuthController.resetDoctorPassword),
);

authRouter.get("/me", requireAuth, asyncHandler(AuthController.me));

authRouter.post(
  "/refresh",
  validateBody(AuthSchema.refreshSchema),
  asyncHandler(AuthController.refresh),
);

authRouter.post(
  "/logout",
  validateBody(AuthSchema.logoutSchema),
  asyncHandler(AuthController.logout),
);

authRouter.post(
  "/logout-all",
  requireAuth,
  asyncHandler(AuthController.logoutAll),
);
