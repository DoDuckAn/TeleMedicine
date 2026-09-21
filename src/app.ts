import express from "express";
import cors from "cors";
import {allowedOrigins} from "./config/cors.js";
import helmet from "helmet";
import morgan from "morgan";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { specialtyRouter } from "./modules/specialties/specialty.routes.js";
import { doctorRouter } from "./modules/doctors/doctor.routes.js";
import { appointmentRouter } from "./modules/appointments/appointment.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { doctorScheduleRouter } from "./modules/schedule-overrides/schedule-override.routes.js";
import { doctorReviewRouter } from "./modules/doctor-reviews/doctor-review.routes.js";
import {patientProfileRouter} from "./modules/profiles/patient-profile.routes.js";
import {adminRouter} from "./modules/admin/admin.routes.js";
import {menuRouter,adminMenuRouter} from "./modules/menus/menu.routes.js";
import {adminSystemSettingRouter,systemSettingRouter} from "./modules/system-settings/system-setting.routes.js";

export const app = express();

import { randomUUID } from "node:crypto";
import { httpConfig } from "./config/http.js";
import { apiLimiter, authLimiter, sensitiveLimiter, writeLimiter } from "./middleware/rate-limit.middleware.js";

app.set("trust proxy", httpConfig.TRUST_PROXY_HOPS);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Request-Id", randomUUID());
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/v1/health", (_req, res) => {
  res.status(app.locals.draining ? 503 : 200).json({
    success: !app.locals.draining,
    data: { status: app.locals.draining ? "draining" : "ok" },
  });
});

app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  exposedHeaders: ["Retry-After", "RateLimit", "RateLimit-Policy", "X-Request-Id"],
}));
app.use(morgan(":method :url :status :response-time ms :res[x-request-id]"));
app.use("/api/v1", apiLimiter);
app.use("/api/v1", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  return writeLimiter(req, res, next);
});
app.use(["/api/v1/auth/login", "/api/v1/auth/register"], authLimiter);
app.use([
  "/api/v1/auth/doctors/password", "/api/v1/doctors/me/password",
  "/api/v1/admin/settings",
], (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  return sensitiveLimiter(req, res, next);
});
app.use(express.json({ limit: "64kb" }));

app.use("/api/v1/auth",authRouter);
app.use("/api/v1/admin",adminRouter);
app.use("/api/v1/menus",menuRouter);
app.use("/api/v1/admin/menus",adminMenuRouter);
app.use("/api/v1/settings",systemSettingRouter);
app.use("/api/v1/admin/settings",adminSystemSettingRouter);
app.use("/api/v1/specialties", specialtyRouter);
app.use("/api/v1/doctors", doctorRouter);
app.use("/api/v1/patients",patientProfileRouter);
app.use("/api/v1/appointments", appointmentRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/doctor-schedule", doctorScheduleRouter);
app.use("/api/v1/doctor-reviews",doctorReviewRouter);

app.use(errorMiddleware);
