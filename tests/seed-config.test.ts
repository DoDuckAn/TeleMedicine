import assert from "node:assert/strict";
import { test } from "node:test";
import { readSeedOptions } from "../prisma/seed-data.js";

const environment = {
  NODE_ENV: "test", SEED_DEMO: "true", SEED_ADMIN_EMAIL: "admin@seed.example",
  SEED_PASSWORD: "TestOnlyPassword123!",
};

test("initial seed requires opt-in and preserves the production guard", () => {
  assert.throws(() => readSeedOptions({ ...environment, SEED_DEMO: "false" }));
  assert.throws(() => readSeedOptions({ ...environment, NODE_ENV: "production" }));
});

test("initial seed requires an explicit email and a bounded password", () => {
  for (const email of [undefined, "", "invalid"]) {
    assert.throws(() => readSeedOptions({ ...environment, SEED_ADMIN_EMAIL: email }));
  }
  for (const password of ["short", "x".repeat(73), "é".repeat(40)]) {
    assert.throws(() => readSeedOptions({ ...environment, SEED_PASSWORD: password }));
  }
  assert.equal(readSeedOptions({ ...environment, SEED_ADMIN_EMAIL: " admin@seed.example " }).SEED_ADMIN_EMAIL, "admin@seed.example");
  assert.equal(readSeedOptions({ ...environment, SEED_ADMIN_EMAIL: " Admin@Seed.Example " }).SEED_ADMIN_EMAIL, "admin@seed.example");
});
