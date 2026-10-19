import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { readSeedOptions, seedInitialData } from "./seed-data.js";

async function main() {
  const options = readSeedOptions(process.env);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const adapter = new PrismaPg({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  const prisma = new PrismaClient({ adapter });
  try {
    const result = await seedInitialData(prisma, options);
    console.log(`Initial seed complete: ${result.createdAdmins} admins, ${result.createdSpecialties} specialties created.`);
    console.log("New admin uses SEED_ADMIN_EMAIL and SEED_PASSWORD. Existing accounts and passwords are not reset.");
    console.log("No doctors, patients or clinical records are created.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  // Prisma connection/validation errors can contain credentials or query input.
  console.error("Initial seed failed. Verify opt-in, admin email, password, database, migrations and unique conflicts. No partial seed transaction is kept.");
  if (error && typeof error === "object" && "code" in error) console.error("Error code:", error.code);
  process.exitCode = 1;
});
