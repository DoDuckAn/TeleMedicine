import express from "express";
import cors from "cors";
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

export const app = express();

app.use(helmet());
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://192.168.1.7:3000",
  ],
  credentials: true,
}));
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/v1/auth",authRouter);
app.use("/api/v1/admin",adminRouter);
app.use("/api/v1/specialties", specialtyRouter);
app.use("/api/v1/doctors", doctorRouter);
app.use("/api/v1/patients",patientProfileRouter);
app.use("/api/v1/appointments", appointmentRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/doctor-schedule", doctorScheduleRouter);
app.use("/api/v1/doctor-reviews",doctorReviewRouter);

app.get("/api/v1/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
    },
  });
});

app.use(errorMiddleware);
