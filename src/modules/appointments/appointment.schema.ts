import { z } from "zod";
import { AppointmentStatus } from "../../../generated/prisma/enums.js";

const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const doctorAvailabilityParamSchema = z.object({
  doctorId: z.string().trim().min(1),
});

export const doctorAvailabilityInputSchema = doctorAvailabilityParamSchema;

export type DoctorAvailabilityInput = z.infer<
  typeof doctorAvailabilityInputSchema
>;

export const bookingAppointmentBodySchema = z.object({
  doctorId: z.string().trim().min(1),
  startAt: isoDateTimeSchema,
  visitReason: z.string().trim().min(10).max(2000),
});

export type CreateAppointmentBody = z.infer<
  typeof bookingAppointmentBodySchema
>;

export type CreateAppointmentInput = CreateAppointmentBody & {
  patientId: string;
};

export type checkSlotAvailableInput=DoctorAvailabilityInput&{
  startAt:Date,
};

export type checkOverlapAppointmentInput={
  startAt:Date;
  patientId:string;
}

export const doctorAppointmentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type DoctorAppointmentListQuery = z.infer<
  typeof doctorAppointmentListQuerySchema
>;

const appointmentListQueryShape = {
  status: z
    .enum([
      AppointmentStatus.PENDING_CONFIRMATION,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.REJECTED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.EXPIRED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.NO_SHOW,
    ])
    .optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};

function validateAppointmentDateRange(
  query: { from?: Date | undefined; to?: Date | undefined },
  context: z.RefinementCtx,
) {
  if (query.from && query.to && query.from.getTime() > query.to.getTime()) {
    context.addIssue({
      code: "custom",
      message: "from khong duoc lon hon to",
      path: ["from"],
    });
  }
}

export const appointmentHistoryQuerySchema = z
  .object(appointmentListQueryShape)
  .superRefine(validateAppointmentDateRange);

export type AppointmentHistoryQuery = z.infer<
  typeof appointmentHistoryQuerySchema
>;

export const adminAppointmentListQuerySchema = z
  .object({
    ...appointmentListQueryShape,
    patientId: z.string().trim().min(1).optional(),
    doctorId: z.string().trim().min(1).optional(),
  })
  .superRefine(validateAppointmentDateRange);

export type AdminAppointmentListQuery = z.infer<
  typeof adminAppointmentListQuerySchema
>;

export const appointmentIdParamSchema = z.object({
  appointmentId: z.string().trim().min(1),
});


export const rejectAppointmentSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export type RejectAppointmentInput = z.infer<typeof rejectAppointmentSchema>;

export const cancelAppointmentSchema = rejectAppointmentSchema;

export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
