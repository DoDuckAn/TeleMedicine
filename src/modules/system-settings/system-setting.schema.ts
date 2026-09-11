import { z } from "zod";
import { config } from "../../config/env.js";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}

export const updateScheduleSettingsSchema = z
  .object({
    workdayStartTime: z.string().regex(timePattern),
    workdayEndTime: z.string().regex(timePattern),
    version: z.number().int().nonnegative(),
  })
  .superRefine((input, context) => {
    const start = toMinutes(input.workdayStartTime);
    const end = toMinutes(input.workdayEndTime);

    if (end <= start) {
      context.addIssue({
        code: "custom",
        path: ["workdayEndTime"],
        message: "Giờ kết thúc phải lớn hơn giờ bắt đầu",
      });
    }

    if (
      start % config.schedule.slotDurationMinutes !== 0 ||
      end % config.schedule.slotDurationMinutes !== 0
    ) {
      context.addIssue({
        code: "custom",
        message: `Giờ làm việc phải chia theo slot ${config.schedule.slotDurationMinutes} phút`,
      });
    }
  })
  .transform((input) => ({
    workdayStartMinutes: toMinutes(input.workdayStartTime),
    workdayEndMinutes: toMinutes(input.workdayEndTime),
    version: input.version,
  }));

export type UpdateScheduleSettingsInput = z.infer<
  typeof updateScheduleSettingsSchema
>;
