import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { createLimiter } from "../src/middleware/rate-limit.middleware.js";
import { errorMiddleware } from "../src/middleware/error.middleware.js";

test("rate limit returns the API envelope and Retry-After, separating proxy IPs", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(createLimiter(1, 60_000));
  app.get("/", (_req, res) => res.json({ success: true }));
  await request(app).get("/").set("X-Forwarded-For", "192.0.2.1").expect(200);
  const blocked = await request(app).get("/").set("X-Forwarded-For", "192.0.2.1").expect(429);
  assert.equal(blocked.body.error.code, "RATE_LIMITED");
  assert.ok(Number(blocked.headers["retry-after"]) > 0);
  await request(app).get("/").set("X-Forwarded-For", "192.0.2.2").expect(200);
});

test("malformed and oversized JSON produce client errors without echoing the body", async () => {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.post("/", (_req, res) => res.sendStatus(204));
  app.use(errorMiddleware);
  const invalid = await request(app).post("/").set("Content-Type", "application/json")
    .send('{"secret":"private",').expect(400);
  assert.equal(JSON.stringify(invalid.body).includes("private"), false);
  await request(app).post("/").send({ secret: "x".repeat(2000) }).expect(413);
});

test("mounted auth and settings routes are limited while health remains available", async () => {
  process.env.SETTINGS_ENCRYPTION_KEY = "test-http-only-no-credentials-are-written";
  const { app } = await import("../src/app.js");
  for (let i = 0; i < 20; i++) {
    await request(app).post("/api/v1/auth/login/staff").send({}).expect(400);
  }
  await request(app).post("/api/v1/auth/login/staff").send({}).expect(429);
  for (let i = 0; i < 5; i++) {
    await request(app).put("/api/v1/admin/settings").send({}).expect(401);
  }
  await request(app).put("/api/v1/admin/settings").send({}).expect(429);
  await request(app).get("/api/v1/health").expect(200);
});
