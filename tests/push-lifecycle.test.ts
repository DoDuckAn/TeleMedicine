import assert from "node:assert/strict";
import { after, test, type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import jwt from "jsonwebtoken";
import type { Prisma } from "../generated/prisma/client.js";
import { config } from "../src/config/env.js";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/token.js";
import { loginStaff, logout, logoutAll, refresh } from "../src/modules/auth/auth.service.js";
import { registerPushDevice, unregisterPushDevice, getActivePushDevices, prunePushDevices } from "../src/modules/notifications/push-device.service.js";

const users: string[] = [];
const password = "PushLifecycleTest123!";

async function account() {
  const user = await prisma.user.create({ data: { role: "DOCTOR", email: `push-${randomUUID()}@example.test`, passwordHash: await bcrypt.hash(password, 4) } });
  users.push(user.id);
  return user;
}
const login = (user: { email: string | null }) => loginStaff({ email: user.email!, password });
const device = (refreshToken: string) => ({ token: `push-${randomUUID()}-registration`, platform: "WEB" as const, refreshToken, installationId: randomUUID(), receiptSecret: randomUUID() + randomUUID() });

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// Prisma exposes methods through a proxy without ordinary method descriptors.
function mockPrismaMethod<F extends (...args: never[]) => unknown>(
  t: TestContext, target: object, key: string, implementation: F, options?: { times: number },
) {
  const original = Reflect.get(target, key) as F;
  const mocked = t.mock.fn(original.bind(target) as F, implementation, options);
  Object.assign(target, { [key]: mocked });
  t.after(() => { Object.assign(target, { [key]: original }); });
  return mocked;
}

test("concurrent cross-session registration retries the whole conflicting transaction", async t => {
  const a = await account();
  const b = await account();
  const first = await login(a);
  const second = await login(b);
  const input = device(first.refreshToken);
  const bothDeleted = signal();
  let deletions = 0;
  let transactions = 0;
  const transaction = prisma.$transaction.bind(prisma);
  mockPrismaMethod(t, prisma, "$transaction", (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    transactions++;
    return transaction(async tx => {
      const deleteMany = tx.pushDeviceToken.deleteMany.bind(tx.pushDeviceToken);
      mockPrismaMethod(t, tx.pushDeviceToken, "deleteMany", async (...args: Parameters<typeof deleteMany>) => {
        const result = await deleteMany(...args);
        if (++deletions === 2) bothDeleted.resolve();
        // Force both transactions past the empty lookup/delete before either inserts.
        await bothDeleted.promise;
        return result;
      });
      return callback(tx);
    });
  });
  const bindings = await Promise.all([
    registerPushDevice(a.id, input),
    registerPushDevice(b.id, { ...input, refreshToken: second.refreshToken }),
  ]);
  assert.notEqual(bindings[0].id, bindings[1].id);
  assert.equal(transactions, 3);
  const stored = await prisma.pushDeviceToken.findMany({ where: { token: input.token } });
  assert.equal(stored.length, 1);
  assert.equal(stored[0]!.enabled, true);
  assert.ok(bindings.some(binding => binding.id === stored[0]!.id));
});

test("registration retries P2002/P2034 only and has a bounded retry budget", async t => {
  const user = await account();
  const session = await login(user);
  const input = device(session.refreshToken);
  const transaction = prisma.$transaction.bind(prisma);
  let attempts = 0;
  const mocked = mockPrismaMethod(t, prisma, "$transaction", (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    attempts++;
    if (attempts <= 2) return Promise.reject({ code: attempts === 1 ? "P2002" : "P2034" });
    return transaction(callback);
  });
  await registerPushDevice(user.id, input);
  assert.equal(attempts, 3);
  attempts = 0;
  mocked.mock.mockImplementation(() => { attempts++; return Promise.reject({ code: "P2002" }); });
  await assert.rejects(registerPushDevice(user.id, input), { code: "P2002" });
  assert.equal(attempts, 4);
  attempts = 0;
  mocked.mock.mockImplementation(() => { attempts++; return Promise.reject({ code: "INVALID_REFRESH_TOKEN" }); });
  await assert.rejects(registerPushDevice(user.id, input), { code: "INVALID_REFRESH_TOKEN" });
  assert.equal(attempts, 1);
});

test("registration consolidates token and installation matches without a permanent unique conflict", async () => {
  const user = await account();
  const session = await login(user);
  const first = device(session.refreshToken);
  const second = device(session.refreshToken);
  await registerPushDevice(user.id, first);
  await registerPushDevice(user.id, second);
  const binding = await registerPushDevice(user.id, { ...first, installationId: second.installationId });
  const devices = await getActivePushDevices(user.id);
  assert.equal(devices.length, 1);
  assert.equal(devices[0]!.id, binding.id);
  assert.equal(devices[0]!.token, first.token);
  assert.equal(devices[0]!.installationId, second.installationId);
});

test("unregister follows a rotation committed after its chain lookup", async t => {
  const user = await account();
  const session = await login(user);
  const input = device(session.refreshToken);
  const binding = await registerPushDevice(user.id, input);
  const chainRead = signal();
  const rotated = signal();
  const transaction = prisma.$transaction.bind(prisma);
  mockPrismaMethod(t, prisma, "$transaction", (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => transaction(async tx => {
    const queryRaw = tx.$queryRaw.bind(tx);
    mockPrismaMethod(t, tx, "$queryRaw", async (...args: Parameters<typeof queryRaw>) => {
      const result = await queryRaw(...args);
      chainRead.resolve();
      await rotated.promise;
      return result;
    }, { times: 1 });
    return callback(tx);
  }), { times: 1 });
  const removing = unregisterPushDevice(user.id, input);
  await chainRead.promise;
  try { await refresh({ refreshToken: session.refreshToken }); }
  finally { rotated.resolve(); }
  await removing;
  assert.equal((await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: binding.id } })).enabled, false);
  assert.equal((await getActivePushDevices(user.id)).length, 0);
  assert.equal(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } }), 1);
});

test("ancestor unregister cannot disable a binding transferred to another login", async () => {
  const user = await account();
  const first = await login(user);
  const second = await login(user);
  const input = device(first.refreshToken);
  await registerPushDevice(user.id, input);
  await refresh({ refreshToken: first.refreshToken });
  const transferred = await registerPushDevice(user.id, { ...input, refreshToken: second.refreshToken });
  await unregisterPushDevice(user.id, input);
  assert.equal((await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: transferred.id } })).enabled, true);
});

test("logout accepts an expired ancestor but refresh/register and invalid logout credentials fail closed", async () => {
  const user = await account();
  const session = await login(user);
  const binding = await registerPushDevice(user.id, device(session.refreshToken));
  const live = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(session.refreshToken) } });
  const claims = { sub: user.id, tokenVersion: user.tokenVersion, jti: randomUUID() };
  const expired = jwt.sign(claims, config.jwt.refreshSecret, { expiresIn: -1 });
  const ancestor = await prisma.refreshToken.create({ data: {
    userId: user.id, jti: claims.jti, tokenHash: hashToken(expired),
    expiresAt: new Date(0), revokedAt: new Date(), replacedByID: live.id,
  } });
  await assert.rejects(refresh({ refreshToken: expired }));
  await assert.rejects(registerPushDevice(user.id, device(expired)));
  await assert.rejects(logout({ refreshToken: jwt.sign(claims, "wrong-signing-secret", { expiresIn: -1 }) }));
  await assert.rejects(logout({ refreshToken: jwt.sign(claims, config.jwt.refreshSecret, { expiresIn: -10 }) }));
  const wrongOwner = jwt.sign({ ...claims, sub: randomUUID() }, config.jwt.refreshSecret, { expiresIn: -1 });
  await prisma.refreshToken.update({ where: { id: ancestor.id }, data: { tokenHash: hashToken(wrongOwner) } });
  await assert.rejects(logout({ refreshToken: wrongOwner }));
  await prisma.refreshToken.update({ where: { id: ancestor.id }, data: { tokenHash: hashToken(expired) } });
  assert.equal((await getActivePushDevices(user.id)).length, 1);
  await logout({ refreshToken: expired });
  await logout({ refreshToken: expired });
  assert.equal((await prisma.pushDeviceToken.findUniqueOrThrow({ where: { id: binding.id } })).enabled, false);
  await assert.rejects(refresh({ refreshToken: session.refreshToken }));
});

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
