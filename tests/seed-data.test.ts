import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { readSeedOptions, seedInitialData } from "../prisma/seed-data.js";

test("initial seed only creates admin/reference data, rolls back conflicts and preserves edits", {
  skip: !process.env.SEED_TEST_DATABASE_URL && "Requires a disposable database via SEED_TEST_DATABASE_URL",
}, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({
    connectionString: process.env.SEED_TEST_DATABASE_URL!, max: 1, connectionTimeoutMillis: 5_000,
  }) });
  const options = readSeedOptions({
    NODE_ENV: "test", SEED_DEMO: "true", SEED_ADMIN_EMAIL: "admin@seed.example",
    SEED_PASSWORD: "DisposableSeedPassword123!",
  });
  const clinicalCounts = async () => ({
    doctors: await prisma.doctorProfile.count(), patients: await prisma.patientProfile.count(),
    appointments: await prisma.appointment.count(), reservations: await prisma.appointmentSlotReservation.count(),
    reviews: await prisma.doctorReview.count(), inbox: await prisma.userNotification.count(),
    deliveries: await prisma.appointmentNotification.count(), secrets: await prisma.integrationSecret.count(),
    histories: await prisma.appointmentStatusHistory.count(), overrides: await prisma.doctorScheduleOverride.count(),
  });
  const originalSpecialties=await prisma.specialty.findMany();
  const originalMenus=await prisma.roleMenu.findMany();
  const originalSetting=await prisma.systemSetting.findUnique({where:{id:"system"}});
  let adminId="";
  let createdSpecialtyIds:string[]=[];
  try {
    assert.equal(await prisma.user.findUnique({ where: { email: options.SEED_ADMIN_EMAIL } }), null,
      "Use a disposable database without this seed admin.");
    const before = await clinicalCounts();
    const specialtyCount = await prisma.specialty.count();
    const conflict = await prisma.user.create({ data: { role: "DOCTOR", email: options.SEED_ADMIN_EMAIL } });
    try {
      await assert.rejects(() => seedInitialData(prisma, options));
      assert.equal(await prisma.specialty.count(), specialtyCount);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: conflict.id } })).role, "DOCTOR");
    } finally {
      await prisma.user.delete({ where: { id: conflict.id } });
    }
    const first = await seedInitialData(prisma, options);
    adminId=(await prisma.user.findUniqueOrThrow({where:{email:options.SEED_ADMIN_EMAIL}})).id;
    const existingIds=new Set(originalSpecialties.map(item=>item.id));
    createdSpecialtyIds=(await prisma.specialty.findMany()).filter(item=>!existingIds.has(item.id)).map(item=>item.id);
    assert.equal(first.createdAdmins, 1);
    assert.equal(await prisma.specialty.count(), specialtyCount + first.createdSpecialties);
    for (const code of ["GENERAL_MEDICINE", "DERMATOLOGY", "PEDIATRICS", "CARDIOLOGY"]) {
      assert.ok(await prisma.specialty.findUnique({ where: { code } }));
    }
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: options.SEED_ADMIN_EMAIL } });
    assert.equal(admin.role, "ADMIN");
    assert.equal(await bcrypt.compare(options.SEED_PASSWORD, admin.passwordHash!), true);
    assert.deepEqual(await clinicalCounts(), before);

    await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: "preserve-existing-hash", status: "DISABLED" } });
    await prisma.specialty.update({ where: { code: "DERMATOLOGY" }, data: { name: "Edited specialty", status: "DISABLED" } });
    const menu = await prisma.roleMenu.update({ where: { role: "ADMIN" }, data: { version: { increment: 1 } } });
    const setting = await prisma.systemSetting.update({ where: { id: "system" }, data: { version: { increment: 1 }, workdayStartMinutes: 540 } });
    assert.deepEqual(await seedInitialData(prisma, options), { createdAdmins: 0, createdSpecialties: 0 });
    const preserved = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert.equal(preserved.passwordHash, "preserve-existing-hash");
    assert.equal(preserved.status, "DISABLED");
    assert.equal((await prisma.specialty.findUniqueOrThrow({ where: { code: "DERMATOLOGY" } })).name, "Edited specialty");
    assert.equal((await prisma.roleMenu.findUniqueOrThrow({ where: { role: "ADMIN" } })).version, menu.version);
    assert.equal((await prisma.systemSetting.findUniqueOrThrow({ where: { id: "system" } })).version, setting.version);
    assert.equal((await prisma.systemSetting.findUniqueOrThrow({ where: { id: "system" } })).workdayStartMinutes, 540);
    assert.deepEqual(await clinicalCounts(), before);
  } finally {
    try{
      if(adminId)await prisma.user.delete({where:{id:adminId}});
      await prisma.specialty.deleteMany({where:{id:{in:createdSpecialtyIds}}});
      const originalDermatology=originalSpecialties.find(item=>item.code==="DERMATOLOGY");
      if(originalDermatology)await prisma.specialty.update({where:{id:originalDermatology.id},data:{
        name:originalDermatology.name,status:originalDermatology.status,updatedAt:originalDermatology.updatedAt,
      }});
      await prisma.roleMenu.deleteMany({where:{role:{notIn:originalMenus.map(item=>item.role)}}});
      const originalAdminMenu=originalMenus.find(item=>item.role==="ADMIN");
      if(originalAdminMenu)await prisma.roleMenu.update({where:{role:originalAdminMenu.role},data:{version:originalAdminMenu.version}});
      if(originalSetting)await prisma.systemSetting.update({where:{id:"system"},data:{
        version:originalSetting.version,workdayStartMinutes:originalSetting.workdayStartMinutes,updatedAt:originalSetting.updatedAt,
      }});
      else await prisma.systemSetting.deleteMany({where:{id:"system"}});
    }finally{
      await prisma.$disconnect();
    }
  }
});
