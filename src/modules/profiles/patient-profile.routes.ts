import {Router} from "express";
import {asyncHandler} from "../../common/async-handler.js";
import {requireAuth,requireRole} from "../../middleware/auth.middleware.js";
import {avatarUpload} from "../../middleware/avatar.middleware.js";
import {validateBody} from "../../middleware/validate.middleware.js";
import * as ProfileController from "./profile.controller.js";
import * as ProfileSchema from "./profile.schema.js";

export const patientProfileRouter=Router();

patientProfileRouter.use(requireAuth,requireRole("PATIENT"));
patientProfileRouter.get("/me",asyncHandler(ProfileController.getPatientProfile));
patientProfileRouter.patch(
    "/me",
    validateBody(ProfileSchema.updatePatientProfileSchema),
    asyncHandler(ProfileController.updatePatientProfile),
);
patientProfileRouter.post(
    "/me/avatar",
    avatarUpload.single("avatar"),
    asyncHandler(ProfileController.updatePatientAvatar),
);
