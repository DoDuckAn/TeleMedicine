import "dotenv/config";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query("SELECT 1");
  console.log("Database connection OK");
} catch (error) {
  console.error("Database connection failed", {
    code: error.code,
    causes: error.errors?.map(cause => cause.code),
  });
  process.exitCode = 1;
} finally {
  await client.end();
}
