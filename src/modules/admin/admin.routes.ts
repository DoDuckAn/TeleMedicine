import {Router} from "express";
import {asyncHandler} from "../../common/async-handler.js";
import {requireAuth,requireRole} from "../../middleware/auth.middleware.js";
import {
    validateBody,
    validateParams,
    validateQuery,
} from "../../middleware/validate.middleware.js";
import {createDoctorSchema} from "../auth/auth.schema.js";
import * as AdminController from "./admin.controller.js";
import * as AdminSchema from "./admin.schema.js";
import * as StatisticsController from "./statistics.controller.js";

export const adminRouter=Router();

adminRouter.use(requireAuth,requireRole("ADMIN"));

adminRouter.get(
    "/dashboard",
    validateQuery(AdminSchema.statisticsQuerySchema),
    asyncHandler(StatisticsController.adminDashboard),
);

adminRouter.post(
    "/doctors",
    validateBody(createDoctorSchema),
    asyncHandler(AdminController.createDoctor),
);

adminRouter.get(
    "/doctors",
    validateQuery(AdminSchema.adminDoctorListQuerySchema),
    asyncHandler(AdminController.listDoctors),
);

adminRouter.get(
    "/doctors/:doctorId/statistics",
    validateParams(AdminSchema.adminDoctorIdParamSchema),
    validateQuery(AdminSchema.statisticsQuerySchema),
    asyncHandler(StatisticsController.adminDoctorStatistics),
);

adminRouter.get(
    "/doctors/:doctorId",
    validateParams(AdminSchema.adminDoctorIdParamSchema),
    asyncHandler(AdminController.getDoctorDetail),
);

adminRouter.patch(
    "/doctors/:doctorId",
    validateParams(AdminSchema.adminDoctorIdParamSchema),
    validateBody(AdminSchema.updateAdminDoctorSchema),
    asyncHandler(AdminController.updateDoctor),
);

adminRouter.patch(
    "/doctors/:doctorId/status",
    validateParams(AdminSchema.adminDoctorIdParamSchema),
    validateBody(AdminSchema.updateUserStatusSchema),
    asyncHandler(AdminController.updateDoctorStatus),
);

adminRouter.get(
    "/patients",
    validateQuery(AdminSchema.adminPatientListQuerySchema),
    asyncHandler(AdminController.listPatients),
);

adminRouter.get(
    "/patients/:userId",
    validateParams(AdminSchema.adminUserIdParamSchema),
    asyncHandler(AdminController.getPatientDetail),
);

adminRouter.patch(
    "/patients/:userId/status",
    validateParams(AdminSchema.adminUserIdParamSchema),
    validateBody(AdminSchema.updateUserStatusSchema),
    asyncHandler(AdminController.updatePatientStatus),
);
