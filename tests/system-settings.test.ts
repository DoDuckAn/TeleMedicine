import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ApiError } from "../src/common/api-error.js";
import { prisma } from "../src/lib/prisma.js";
import { weeklyScheduleSchema } from "../src/modules/doctors/doctor.schema.js";
import {
  assertWeeklyScheduleWithinWorkday,
  getPublicScheduleSettings,
  getScheduleSettings,
  getWorkdayWindow,
  updateScheduleSettings,
} from "../src/modules/system-settings/system-setting.service.js";

let original: Awaited<ReturnType<typeof getScheduleSettings>>;

before(async () => {
  original = await getScheduleSettings();
});

after(async () => {
  const current = await getScheduleSettings();
  await prisma.systemSetting.update({
    where: { id: "system" },
    data: {
      version: current.version + 1,
      workdayEndMinutes: original.workdayEndMinutes,
      workdayStartMinutes: original.workdayStartMinutes,
    },
  });
  await prisma.$disconnect();
});

test("admin settings update uses optimistic version and serializes work hours", async () => {
  const updated = await updateScheduleSettings({
    version: original.version,
    workdayStartMinutes: 9 * 60,
    workdayEndMinutes: 16 * 60,
  });

  assert.equal(updated.workdayStartTime, "09:00");
  assert.equal(updated.workdayEndTime, "16:00");

  await assert.rejects(
    () =>
      updateScheduleSettings({
        version: original.version,
        workdayStartMinutes: 8 * 60,
        workdayEndMinutes: 17 * 60,
      }),
    (error: unknown) =>
      error instanceof ApiError && error.code === "SETTINGS_VERSION_CONFLICT",
  );

  const current = await getPublicScheduleSettings();
  assert.equal(current.workdayStartTime, "09:00");
  assert.equal(current.workdayEndTime, "16:00");
});

test("weekly schedule and workday window follow the persisted limits", async () => {
  const setting = await getScheduleSettings();
  const valid = weeklyScheduleSchema.parse({
    MONDAY: [{ startTime: "09:00", endTime: "10:00" }],
  });
  assert.doesNotThrow(() => assertWeeklyScheduleWithinWorkday(valid, setting));

  const invalid = weeklyScheduleSchema.parse({
    MONDAY: [{ startTime: "08:30", endTime: "10:00" }],
  });
  assert.throws(
    () => assertWeeklyScheduleWithinWorkday(invalid, setting),
    (error: unknown) =>
      error instanceof ApiError && error.code === "SCHEDULE_OUTSIDE_WORKING_HOURS",
  );

  const window = getWorkdayWindow("2026-09-14", setting);
  assert.equal(window.startAt.toISOString(), "2026-09-14T02:00:00.000Z");
  assert.equal(window.endAt.toISOString(), "2026-09-14T09:00:00.000Z");
});
