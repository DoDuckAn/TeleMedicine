import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcrypt";
import { UserRole } from "../generated/prisma/enums.js";
import { ApiError } from "../src/common/api-error.js";
import { prisma } from "../src/lib/prisma.js";
import { weeklyScheduleSchema } from "../src/modules/doctors/doctor.schema.js";
import {
  assertWeeklyScheduleWithinWorkday,
  getPublicScheduleSettings,
  getScheduleSettings,
  getWorkdayWindow,
  saveSystemSettings,
  updateScheduleSettings,
} from "../src/modules/system-settings/system-setting.service.js";
import { resolveIntegrationSecrets } from "../src/modules/system-settings/integration-secret.service.js";

let original: Awaited<ReturnType<typeof getScheduleSettings>>;
let originalCloudinaryApiKey: Awaited<ReturnType<typeof prisma.integrationSecret.findUnique>>;
let testAdminId = "";

before(async () => {
  original = await getScheduleSettings();
  originalCloudinaryApiKey = await prisma.integrationSecret.findUnique({
    where: { key: "CLOUDINARY_API_KEY" },
  });
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
  if (originalCloudinaryApiKey) {
    await prisma.integrationSecret.upsert({
      where: { key: originalCloudinaryApiKey.key },
      create: originalCloudinaryApiKey,
      update: { encryptedValue: originalCloudinaryApiKey.encryptedValue },
    });
  } else {
    await prisma.integrationSecret.deleteMany({
      where: { key: "CLOUDINARY_API_KEY" },
    });
  }
  if (testAdminId) await prisma.user.deleteMany({ where: { id: testAdminId } });
  await prisma.$disconnect();
});

test("saving secrets requires the admin password and never returns plaintext", async () => {
  const password = "SettingsAdminPass123";
  const admin = await prisma.user.create({
    data: {
      email: `settings-admin-${Date.now()}@example.com`,
      passwordHash: await bcrypt.hash(password, 4),
      role: UserRole.ADMIN,
    },
  });
  testAdminId = admin.id;
  const current = await getScheduleSettings();

  await assert.rejects(
    () =>
      saveSystemSettings(admin.id, {
        currentPassword: "wrong-password",
        credentials: { CLOUDINARY_API_KEY: "must-not-be-saved" },
        version: current.version,
      }),
    (error: unknown) =>
      error instanceof ApiError && error.code === "INVALID_CURRENT_PASSWORD",
  );

  const plaintext = `cloudinary-test-${Date.now()}`;
  const result = await saveSystemSettings(admin.id, {
    currentPassword: password,
    credentials: { CLOUDINARY_API_KEY: plaintext },
    version: current.version,
  });
  const stored = await prisma.integrationSecret.findUniqueOrThrow({
    where: { key: "CLOUDINARY_API_KEY" },
  });
  const resolved = await resolveIntegrationSecrets(["CLOUDINARY_API_KEY"]);

  assert.notEqual(stored.encryptedValue, plaintext);
  assert.equal(stored.encryptedValue.startsWith("v1:"), true);
  assert.equal(resolved.CLOUDINARY_API_KEY, plaintext);
  assert.equal(JSON.stringify(result).includes(plaintext), false);
  assert.equal(result.integrations.CLOUDINARY_API_KEY.source, "DATABASE");
});

test("admin settings update uses optimistic version and serializes work hours", async () => {
  const currentVersion = (await getScheduleSettings()).version;
  const updated = await updateScheduleSettings({
    version: currentVersion,
    workdayStartMinutes: 9 * 60,
    workdayEndMinutes: 16 * 60,
  });

  assert.equal(updated.workdayStartTime, "09:00");
  assert.equal(updated.workdayEndTime, "16:00");

  await assert.rejects(
    () =>
      updateScheduleSettings({
        version: currentVersion,
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
