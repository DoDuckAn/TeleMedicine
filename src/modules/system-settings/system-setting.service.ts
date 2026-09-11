import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Prisma } from "../../../generated/prisma/client.js";
import { ApiError } from "../../common/api-error.js";
import { config } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import type { WeeklySchedule } from "../doctors/doctor.schema.js";
import type { TimeRange } from "../appointments/appointment-time.js";
import type { UpdateScheduleSettingsInput } from "./system-setting.schema.js";

const SETTING_ID = "system";
const DEFAULT_START = 8 * 60;
const DEFAULT_END = 17 * 60;

export type ScheduleSettings = {
  workdayStartMinutes: number;
  workdayEndMinutes: number;
  version: number;
};

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function serialize(setting: ScheduleSettings) {
  return {
    workdayStartTime: minutesToTime(setting.workdayStartMinutes),
    workdayEndTime: minutesToTime(setting.workdayEndMinutes),
    slotDurationMinutes: config.schedule.slotDurationMinutes,
    timezone: config.schedule.timezone,
    version: setting.version,
  };
}

export async function getScheduleSettings(
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const setting = await db.systemSetting.findUnique({ where: { id: SETTING_ID } });
  return setting ?? {
    workdayStartMinutes: DEFAULT_START,
    workdayEndMinutes: DEFAULT_END,
    version: 0,
  };
}

export async function getPublicScheduleSettings() {
  return serialize(await getScheduleSettings());
}

export async function updateScheduleSettings(input: UpdateScheduleSettingsInput) {
  const setting = await prisma.$transaction(async (tx) => {
    const updated = await tx.systemSetting.updateMany({
      where: { id: SETTING_ID, version: input.version },
      data: {
        workdayStartMinutes: input.workdayStartMinutes,
        workdayEndMinutes: input.workdayEndMinutes,
        version: { increment: 1 },
      },
    });
    if (!updated.count) throw new ApiError("SETTINGS_VERSION_CONFLICT");
    return tx.systemSetting.findUniqueOrThrow({ where: { id: SETTING_ID } });
  });
  return serialize(setting);
}

export function assertWeeklyScheduleWithinWorkday(
  schedule: WeeklySchedule,
  setting: ScheduleSettings,
) {
  const outside = Object.values(schedule).some((ranges) =>
    ranges.some((range) => {
      const [startHour, startMinute] = range.startTime.split(":").map(Number);
      const [endHour, endMinute] = range.endTime.split(":").map(Number);
      const start = startHour! * 60 + startMinute!;
      const end = endHour! * 60 + endMinute!;
      return start < setting.workdayStartMinutes || end > setting.workdayEndMinutes;
    }),
  );
  if (outside) throw new ApiError("SCHEDULE_OUTSIDE_WORKING_HOURS");
}

export function getWorkdayWindow(
  date: string,
  setting: ScheduleSettings,
): TimeRange {
  return {
    startAt: fromZonedTime(
      `${date}T${minutesToTime(setting.workdayStartMinutes)}:00`,
      config.schedule.timezone,
    ),
    endAt: fromZonedTime(
      `${date}T${minutesToTime(setting.workdayEndMinutes)}:00`,
      config.schedule.timezone,
    ),
  };
}

export function assertAvailableRangeWithinWorkday(
  range: TimeRange,
  setting: ScheduleSettings,
) {
  const startDate = formatInTimeZone(range.startAt, config.schedule.timezone, "yyyy-MM-dd");
  const endDate = formatInTimeZone(range.endAt, config.schedule.timezone, "yyyy-MM-dd");
  const window = getWorkdayWindow(startDate, setting);
  if (startDate !== endDate || range.startAt < window.startAt || range.endAt > window.endAt) {
    throw new ApiError("SCHEDULE_OUTSIDE_WORKING_HOURS");
  }
}
