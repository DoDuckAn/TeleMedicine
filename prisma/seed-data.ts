import bcrypt from "bcrypt";
import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client.js";
import { UserRole } from "../generated/prisma/enums.js";
import { menuCatalog } from "../src/modules/menus/menu.catalog.js";

const seedEnvironment = z.object({
  NODE_ENV: z.enum(["development", "test"]).default("development"),
  SEED_DEMO: z.literal("true"),
  SEED_ADMIN_EMAIL: z.string().trim().email().toLowerCase(),
  SEED_PASSWORD: z.string().min(12).refine(value => Buffer.byteLength(value, "utf8") <= 72),
});

export function readSeedOptions(environment: NodeJS.ProcessEnv) {
  const parsed = seedEnvironment.safeParse(environment);
  if (!parsed.success) {
    throw new Error("Seed requires development/test, SEED_DEMO=true, SEED_ADMIN_EMAIL and SEED_PASSWORD (12+ characters, at most 72 UTF-8 bytes).");
  }
  return parsed.data;
}

const specialties = [
  { code: "GENERAL_MEDICINE", name: "Nội tổng quát" },
  { code: "DERMATOLOGY", name: "Da liễu" },
  { code: "PEDIATRICS", name: "Nhi khoa" },
  { code: "CARDIOLOGY", name: "Tim mạch" },
];

export async function seedInitialData(prisma: PrismaClient, options: ReturnType<typeof readSeedOptions>) {
  const passwordHash = await bcrypt.hash(options.SEED_PASSWORD, 10);
  return prisma.$transaction(async tx => {
    await tx.systemSetting.upsert({
      where: { id: "system" }, update: {}, create: { id: "system" },
    });
    for (const role of Object.values(UserRole)) {
      await tx.roleMenu.upsert({
        where: { role }, update: {},
        create: { role, items: { create: menuCatalog[role].map((page, order) => ({
          label: page.label, path: page.path, iconKey: page.iconKey,
          badgeKey: page.badgeKey ?? null, order,
        })) } },
      });
    }
    let createdSpecialties = 0;
    for (const specialty of specialties) {
      const existing = await tx.specialty.findFirst({
        where: { OR: [{ code: specialty.code }, { name: specialty.name }] }, select: { id: true },
      });
      // Preserve existing names, status, memberships and soft-deleted records.
      if (existing) continue;
      await tx.specialty.create({ data: specialty });
      createdSpecialties++;
    }
    const admin = await tx.user.findUnique({ where: { email: options.SEED_ADMIN_EMAIL } });
    if (admin && admin.role !== UserRole.ADMIN) {
      throw new Error("SEED_ADMIN_EMAIL belongs to a non-admin account. Seed will not change its role.");
    }
    if (!admin) {
      await tx.user.create({ data: {
        email: options.SEED_ADMIN_EMAIL, role: UserRole.ADMIN, passwordHash,
      } });
    }
    return { createdAdmins: admin ? 0 : 1, createdSpecialties };
  }, { maxWait: 10_000, timeout: 30_000 });
}
