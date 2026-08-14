import { z } from "zod";
import { config } from "../../config/env.js";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

const weeklyTimeRangeSchema = z
  .object({
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .superRefine((range, context) => {
    const start = toMinutes(range.startTime);
    const end = toMinutes(range.endTime);
    const slotDuration = config.schedule.slotDurationMinutes;

    if (end <= start) {
      context.addIssue({
        code: "custom",
        message: "endTime phai lon hon startTime",
        path: ["endTime"],
      });
    }

    if (start % slotDuration !== 0 || end % slotDuration !== 0) {
      context.addIssue({
        code: "custom",
        message: `Thoi gian phai thang theo buoc ${slotDuration} phut`,
      });
    }
  });

const dailyScheduleSchema = z
  .array(weeklyTimeRangeSchema)
  .max(48)
  .superRefine((ranges, context) => {
    const sortedRanges = [...ranges].sort(
      (left, right) => toMinutes(left.startTime) - toMinutes(right.startTime),
    );

    for (let index = 1; index < sortedRanges.length; index += 1) {
      const previous = sortedRanges[index - 1];
      const current = sortedRanges[index];

      if (
        previous &&
        current &&
        toMinutes(current.startTime) < toMinutes(previous.endTime)
      ) {
        context.addIssue({
          code: "custom",
          message: "Cac khoang gio trong cung mot ngay khong duoc chong nhau",
          path: [index],
        });
      }
    }
  })
  .transform((ranges) =>
    [...ranges].sort(
      (left, right) => toMinutes(left.startTime) - toMinutes(right.startTime),
    ),
  );

export const weeklyScheduleSchema = z.object({
  MONDAY: dailyScheduleSchema.default([]),
  TUESDAY: dailyScheduleSchema.default([]),
  WEDNESDAY: dailyScheduleSchema.default([]),
  THURSDAY: dailyScheduleSchema.default([]),
  FRIDAY: dailyScheduleSchema.default([]),
  SATURDAY: dailyScheduleSchema.default([]),
  SUNDAY: dailyScheduleSchema.default([]),
});

export const listDoctorsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  specialtyId: z.string().trim().min(1).optional(),
  sortBy: z.enum(["name", "rating"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const doctorIdParamSchema = z.object({
  doctorId: z.string().trim().min(1),
});

export type ListDoctorsQuery = z.infer<typeof listDoctorsQuerySchema>;
export type WeeklySchedule = z.infer<typeof weeklyScheduleSchema>;
