CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "workdayStartMinutes" INTEGER NOT NULL DEFAULT 480,
    "workdayEndMinutes" INTEGER NOT NULL DEFAULT 1020,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SystemSetting" ("id") VALUES ('system');

INSERT INTO "MenuItem" ("id", "role", "path", "label", "iconKey", "badgeKey", "enabled", "order", "createdAt", "updatedAt")
SELECT
    'admin-system-settings',
    'ADMIN'::"UserRole",
    '/admin/settings',
    'Cài đặt',
    'Settings',
    NULL,
    true,
    COALESCE(MAX("order"), -1) + 1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "MenuItem"
WHERE "role" = 'ADMIN'::"UserRole"
ON CONFLICT ("role", "path") DO NOTHING;
