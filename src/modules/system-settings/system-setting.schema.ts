import { z } from "zod";
import { config } from "../../config/env.js";
import { integrationSecretKeys } from "./integration-secret.service.js";

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

const secretValueSchema = z.string().min(1).max(10000).nullable().optional();
const integrationSecretsShape = Object.fromEntries(
  integrationSecretKeys.map((key) => [key, secretValueSchema]),
) as Record<(typeof integrationSecretKeys)[number], typeof secretValueSchema>;

export const saveSystemSettingsSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    version: z.number().int().nonnegative(),
    schedule: z
      .object({
        workdayStartTime: z.string().regex(timePattern),
        workdayEndTime: z.string().regex(timePattern),
      })
      .optional(),
    credentials: z.object(integrationSecretsShape).partial().optional(),
  })
  .superRefine((input, context) => {
    const credentialEntries = Object.entries(input.credentials ?? {}).filter(
      ([, value]) => value !== undefined,
    );
    if (!input.schedule && credentialEntries.length === 0) {
      context.addIssue({ code: "custom", message: "Không có cài đặt cần cập nhật" });
      return;
    }
    const smtpPort = input.credentials?.SMTP_PORT;
    if (
      smtpPort !== undefined &&
      smtpPort !== null &&
      (!/^\d+$/.test(smtpPort) || Number(smtpPort) < 1 || Number(smtpPort) > 65535)
    ) {
      context.addIssue({
        code: "custom",
        path: ["credentials", "SMTP_PORT"],
        message: "Cổng SMTP không hợp lệ",
      });
    }
    const smtpSecure = input.credentials?.SMTP_SECURE;
    if (
      smtpSecure !== undefined &&
      smtpSecure !== null &&
      smtpSecure !== "true" &&
      smtpSecure !== "false"
    ) {
      context.addIssue({
        code: "custom",
        path: ["credentials", "SMTP_SECURE"],
        message: "Kết nối bảo mật SMTP phải là true hoặc false",
      });
    }
    if (!input.schedule) return;
    const start = toMinutes(input.schedule.workdayStartTime);
    const end = toMinutes(input.schedule.workdayEndTime);
    if (end <= start) {
      context.addIssue({
        code: "custom",
        path: ["schedule", "workdayEndTime"],
        message: "Giờ kết thúc phải lớn hơn giờ bắt đầu",
      });
    }
    if (
      start % config.schedule.slotDurationMinutes !== 0 ||
      end % config.schedule.slotDurationMinutes !== 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["schedule"],
        message: `Giờ làm việc phải chia theo slot ${config.schedule.slotDurationMinutes} phút`,
      });
    }
  })
  .transform((input) => ({
    currentPassword: input.currentPassword,
    version: input.version,
    ...(input.schedule
      ? {
          schedule: {
            workdayStartMinutes: toMinutes(input.schedule.workdayStartTime),
            workdayEndMinutes: toMinutes(input.schedule.workdayEndTime),
          },
        }
      : {}),
    credentials: input.credentials ?? {},
  }));

export type SaveSystemSettingsInput = z.infer<typeof saveSystemSettingsSchema>;
