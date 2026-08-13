import { Router } from "express";
import { validateBody } from "../../middleware/validate.middleware.js";
import * as AuthSchema from "./auth.schema.js";
import { asyncHandler } from "../../common/async-handler.js";
import * as AuthController from "./auth.controller.js";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post(
  "/register/request-otp",
  validateBody(AuthSchema.requestRegisterOtpSchema),
  asyncHandler(AuthController.requestRegisterOtp),
);

authRouter.post(
  "/register/verify",
  validateBody(AuthSchema.verifyRegisterOtpSchema),
  asyncHandler(AuthController.verifyRegisterOtp),
);

authRouter.post(
  "/login/patient/request-otp",
  validateBody(AuthSchema.requestPatientLoginOtpSchema),
  asyncHandler(AuthController.requestPatientLoginOtp),
);

authRouter.post(
  "/login/patient/verify",
  validateBody(AuthSchema.loginPatientSchema),
  asyncHandler(AuthController.loginPatient),
);

authRouter.post(
  "/login/staff",
  validateBody(AuthSchema.loginStaffSchema),
  asyncHandler(AuthController.loginStaff),
);

authRouter.post(
  "/doctors",
  requireAuth,
  requireRole("ADMIN"),
  validateBody(AuthSchema.createDoctorSchema),
  asyncHandler(AuthController.createDoctor),
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
