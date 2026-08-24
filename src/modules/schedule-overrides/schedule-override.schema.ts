import { z } from "zod";
import { DoctorScheduleOverrideType } from "../../../generated/prisma/enums.js";
import { config } from "../../config/env.js";
import { weeklyScheduleSchema } from "../doctors/doctor.schema.js";

const isoDateTimeSchema=z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const dateOnlySchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const [year, month, day]=value.split("-").map(Number);
    const date=new Date(Date.UTC(year!, month! - 1, day!));
    return (
      date.getUTCFullYear()===year &&
      date.getUTCMonth()===month! - 1 &&
      date.getUTCDate()===day
    );
  },
  "Ngay khong hop le",
);

function isSlotBoundary(date: Date) {
  return (
    date.getUTCSeconds()===0 &&
    date.getUTCMilliseconds()===0 &&
    date.getUTCMinutes() % config.schedule.slotDurationMinutes===0
  );
}

export const updateWeeklyScheduleSchema=z.object({
  weeklySchedule: weeklyScheduleSchema,
});

export const listScheduleOverridesQuerySchema=z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    type: z
      .enum([
        DoctorScheduleOverrideType.AVAILABLE,
        DoctorScheduleOverrideType.UNAVAILABLE,
      ])
      .optional(),
  })
  .superRefine((query, context) => {
    if (query.from && query.to && query.from>=query.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "to phai lon hon from",
      });
    }
  });

const overrideRangeSchema=z
  .object({
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
  })
  .superRefine((range, context) => {
    if (range.endAt<=range.startAt) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "endAt phai lon hon startAt",
      });
    }

    if (!isSlotBoundary(range.startAt) || !isSlotBoundary(range.endAt)) {
      context.addIssue({
        code: "custom",
        message: `Thoi gian phai thang theo slot ${config.schedule.slotDurationMinutes} phut`,
      });
    }

    if (range.endAt.getTime() - range.startAt.getTime()>31 * 24 * 60 * 60 * 1000) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Mot override khong duoc dai qua 31 ngay",
      });
    }
  });

const overrideRangesSchema=z
  .array(overrideRangeSchema)
  .min(1)
  .max(100)
  .superRefine((ranges, context) => {
    const sorted=[...ranges].sort(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    );

    for (let index=1; index<sorted.length; index+=1) {
      const previous=sorted[index - 1]!;
      const current=sorted[index]!;
      if (current.startAt<previous.endAt) {
        context.addIssue({
          code: "custom",
          message: "Cac khoang trong cung request khong duoc chong nhau",
        });
      }
    }
  })
  .transform((ranges) => {
    const sorted=[...ranges].sort(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    );
    return sorted.reduce<typeof sorted>((merged, current) => {
      const previous=merged.at(-1);
      if (previous && previous.endAt.getTime()===current.startAt.getTime()) {
        previous.endAt=current.endAt;
      } else {
        merged.push({ ...current });
      }
      return merged;
    }, []);
  });

export const createScheduleOverrideSchema=z
  .object({
    type: z.enum([
      DoctorScheduleOverrideType.AVAILABLE,
      DoctorScheduleOverrideType.UNAVAILABLE,
    ]),
    ranges: overrideRangesSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((input, context) => {

    if (
      input.type===DoctorScheduleOverrideType.UNAVAILABLE &&
      !input.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Phai cung cap ly do nghi dot xuat",
      });
    }
  });

export const restoreScheduleOverridesSchema=z.object({
  ranges: overrideRangesSchema,
});

export const scheduleOverrideIdParamSchema=z.object({
  overrideId: z.string().trim().min(1),
});

export const doctorCalendarQuerySchema=z.object({
  weekStart: dateOnlySchema.optional(),
});

export type UpdateWeeklyScheduleInput=z.infer<
  typeof updateWeeklyScheduleSchema
>;
export type ListScheduleOverridesQuery=z.infer<
  typeof listScheduleOverridesQuerySchema
>;
export type CreateScheduleOverrideInput=z.infer<
  typeof createScheduleOverrideSchema
>;
export type RestoreScheduleOverridesInput=z.infer<
  typeof restoreScheduleOverridesSchema
>;
export type DoctorCalendarQuery=z.infer<typeof doctorCalendarQuerySchema>;
