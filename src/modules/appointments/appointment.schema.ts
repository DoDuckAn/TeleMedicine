import { z } from "zod";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const doctorAvailabilityParamSchema = z.object({
  doctorId: z.string().trim().min(1),
});

export const doctorAvailabilityInputSchema = doctorAvailabilityParamSchema;

export type DoctorAvailabilityInput = z.infer<
  typeof doctorAvailabilityInputSchema
>;

export const createAppointmentSchema = z.object({
  doctorId: z.string().trim().min(1),
  startAt: isoDateTimeSchema,
  visitReason: z.string().trim().min(10).max(2000),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const rejectAppointmentSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export type RejectAppointmentInput = z.infer<typeof rejectAppointmentSchema>;
