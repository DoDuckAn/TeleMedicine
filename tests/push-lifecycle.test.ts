import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/token.js";
import { loginStaff, logout, logoutAll, refresh } from "../src/modules/auth/auth.service.js";
import { registerPushDevice, getActivePushDevices, prunePushDevices } from "../src/modules/notifications/push-device.service.js";

const users: string[] = [];
const password = "PushLifecycleTest123!";

async function account() {
  const user = await prisma.user.create({ data: { role: "DOCTOR", email: `push-${randomUUID()}@example.test`, passwordHash: await bcrypt.hash(password, 4) } });
  users.push(user.id);
  return user;
}
const login = (user: { email: string | null }) => loginStaff({ email: user.email!, password });
const device = (refreshToken: string) => ({ token: `push-${randomUUID()}-registration`, platform: "WEB" as const, refreshToken, installationId: randomUUID(), receiptSecret: randomUUID() + randomUUID() });

after(async () => {
  await prisma.pushDeviceToken.deleteMany({ where: { userID: { in: users } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

test("rotation moves the same push binding to the new refresh atomically", async () => {
  const user = await account();
  const session = await login(user);
  const binding = await registerPushDevice(user.id, device(session.refreshToken));
  const rotated = await refresh({ refreshToken: session.refreshToken });
  const next = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(rotated.refreshToken) } });
  const stored = await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: binding.id } });
  assert.equal(stored.refreshTokenId, next.id);
  assert.equal(stored.enabled, true);
  assert.equal((await getActivePushDevices(user.id)).length, 1);
  await assert.rejects(refresh({ refreshToken: session.refreshToken }));
});

test("an ancestor logout revokes the rotated descendant, not another device", async () => {
  const user = await account();
  const first = await login(user);
  const second = await login(user);
  const a = await registerPushDevice(user.id, device(first.refreshToken));
  const b = await registerPushDevice(user.id, device(second.refreshToken));
  const next = await refresh({ refreshToken: first.refreshToken });
  await logout({ refreshToken: first.refreshToken });
  await logout({ refreshToken: first.refreshToken });
  assert.equal((await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: a.id } })).enabled, false);
  assert.equal((await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: b.id } })).enabled, true);
  await assert.rejects(refresh({ refreshToken: next.refreshToken }));
  assert.equal((await getActivePushDevices(user.id)).length, 1);
});

test("only one concurrent rotation wins and the push points to the winner", async () => {
  const user = await account();
  const session = await login(user);
  const binding = await registerPushDevice(user.id, device(session.refreshToken));
  const results = await Promise.allSettled([refresh({ refreshToken: session.refreshToken }), refresh({ refreshToken: session.refreshToken })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const active = await prisma.refreshToken.findMany({ where: { userId: user.id, revokedAt: null } });
  assert.equal(active.length, 1);
  assert.equal((await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: binding.id } })).refreshTokenId, active[0]!.id);
});

test("logout racing rotation leaves no usable refresh or push for that login", async () => {
  const user = await account();
  const session = await login(user);
  await registerPushDevice(user.id, device(session.refreshToken));
  const results = await Promise.allSettled([refresh({ refreshToken: session.refreshToken }), logout({ refreshToken: session.refreshToken })]);
  assert.equal(results[1]!.status, "fulfilled");
  assert.equal(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } }), 0);
  assert.equal((await getActivePushDevices(user.id)).length, 0);
});

test("logout-all disables every device and rejects registration with an old access/refresh pair", async () => {
  const user = await account();
  const session = await login(user);
  const payload = device(session.refreshToken);
  await registerPushDevice(user.id, payload);
  await registerPushDevice(user.id, device((await login(user)).refreshToken));
  await logoutAll(user.id);
  assert.equal(await prisma.pushDeviceToken.count({ where: { userID: user.id, enabled: true } }), 0);
  const response = await request(app).post("/api/v1/notifications/devices").set("Authorization", `Bearer ${session.accessToken}`).send(payload);
  assert.equal(response.status, 401);
});

test("registration verifies refresh ownership and rotates binding IDs on account switches", async () => {
  const a = await account();
  const b = await account();
  const first = await login(a);
  const second = await login(b);
  const payload = device(first.refreshToken);
  const original = await registerPushDevice(a.id, payload);
  await assert.rejects(registerPushDevice(b.id, payload));
  const rebound = await registerPushDevice(b.id, { ...payload, refreshToken: second.refreshToken });
  assert.notEqual(original.id, rebound.id);
  assert.equal((await getActivePushDevices(a.id)).length, 0);
  assert.equal((await getActivePushDevices(b.id)).length, 1);
});

test("expired, idle, legacy and version-invalid registrations cannot receive push", async () => {
  const user = await account();
  const session = await login(user);
  const binding = await registerPushDevice(user.id, device(session.refreshToken));
  const expiredSession = await login(user);
  const expiredBinding = await registerPushDevice(user.id, device(expiredSession.refreshToken));
  const expired = await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: expiredBinding.id } });
  await prisma.refreshToken.update({ where: { id: expired.refreshTokenId! }, data: { expiresAt: new Date(0) } });
  const legacy = await prisma.pushDeviceToken.create({ data: { userID: user.id, token: `legacy-${randomUUID()}`, platform: "WEB" } });
  assert.deepEqual((await getActivePushDevices(user.id)).map(entry => entry.id), [binding.id]);
  await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
  assert.equal((await getActivePushDevices(user.id)).length, 0);
  await prisma.pushDeviceToken.update({ where: { id: binding.id }, data: { lastRegisteredAt: new Date("2020-01-01") } });
  await prunePushDevices();
  assert.equal((await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: binding.id } })).enabled, false);
  assert.equal((await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: expiredBinding.id } })).enabled, false);
  assert.equal((await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: legacy.id } })).enabled, false);
});
