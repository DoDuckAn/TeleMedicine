import { prisma } from "../../lib/prisma.js";
import { verifyRefreshToken } from "../../lib/jwt.js";
import { hashToken } from "../../lib/token.js";
import { ApiError } from "../../common/api-error.js";
import type { RegisterPushDeviceInput, UnregisterPushDeviceInput } from "./notification.schema.js";

export const PUSH_DEVICE_MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

function readRefresh(token: string, userId: string) {
  try {
    const payload = verifyRefreshToken(token);
    if (payload.sub !== userId) throw new Error("Wrong owner");
    return payload;
  } catch { throw new ApiError("INVALID_REFRESH_TOKEN"); }
}

export async function registerPushDevice(userId: string, input: RegisterPushDeviceInput) {
  const payload = readRefresh(input.refreshToken, userId);
  const now = new Date();
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true, tokenVersion: true } });
    if (!user || user.status !== "ACTIVE" || user.tokenVersion !== payload.tokenVersion) throw new ApiError("INVALID_REFRESH_TOKEN");
    const refresh = await tx.refreshToken.findUnique({ where: { jti: payload.jti } });
    if (!refresh) throw new ApiError("INVALID_REFRESH_TOKEN");
    // Lock the current refresh row against concurrent rotation/logout before binding the device.
    const locked = await tx.refreshToken.updateMany({
      where: { id: refresh.id, userId, tokenHash: hashToken(input.refreshToken), revokedAt: null, replacedByID: null, expiresAt: { gt: now } },
      data: { deviceInfo: refresh.deviceInfo },
    });
    if (locked.count !== 1) throw new ApiError("INVALID_REFRESH_TOKEN");
    const existing = await tx.pushDeviceToken.findFirst({
      where: { OR: [{ token: input.token }, ...(input.installationId ? [{ installationId: input.installationId }] : [])] },
    });
    const data = {
      userID: userId, token: input.token, platform: input.platform, enabled: true,
      refreshTokenId: refresh.id, authVersion: user.tokenVersion, lastRegisteredAt: now,
      installationId: input.installationId ?? null,
      receiptSecretHash: input.receiptSecret ? hashToken(input.receiptSecret) : null,
    };
    // A new login gets a new binding ID, so delayed messages for the previous login are rejected.
    const reuse = existing?.refreshTokenId === refresh.id && existing.userID === userId && existing.enabled;
    if (reuse) return tx.pushDeviceToken.update({ where: { id: existing.id }, data, select: { id: true, platform: true, lastRegisteredAt: true } });
    await tx.pushDeviceToken.deleteMany({ where: { OR: [{ token: input.token }, ...(input.installationId ? [{ installationId: input.installationId }] : [])] } });
    return tx.pushDeviceToken.create({ data, select: { id: true, platform: true, lastRegisteredAt: true } });
  });
}

export async function unregisterPushDevice(userId: string, input: UnregisterPushDeviceInput) {
  const payload = readRefresh(input.refreshToken, userId);
  const refresh = await prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
  if (!refresh || refresh.userId !== userId || refresh.tokenHash !== hashToken(input.refreshToken)) throw new ApiError("INVALID_REFRESH_TOKEN");
  await prisma.pushDeviceToken.updateMany({ where: { userID: userId, token: input.token, refreshTokenId: refresh.id }, data: { enabled: false } });
}

export async function prunePushDevices(now = new Date()) {
  await prisma.pushDeviceToken.updateMany({
    where: { enabled: true, OR: [
      { refreshTokenId: null }, { refreshToken: { revokedAt: { not: null } } },
      { refreshToken: { expiresAt: { lte: now } } },
      { lastRegisteredAt: { lte: new Date(now.getTime() - PUSH_DEVICE_MAX_IDLE_MS) } },
      { user: { status: "DISABLED" } },
    ] },
    data: { enabled: false },
  });
}

export async function getActivePushDevices(userId: string, now = new Date()) {
  const devices = await prisma.pushDeviceToken.findMany({
    where: { userID: userId, enabled: true, lastRegisteredAt: { gt: new Date(now.getTime() - PUSH_DEVICE_MAX_IDLE_MS) },
      user: { status: "ACTIVE" }, refreshToken: { userId, revokedAt: null, replacedByID: null, expiresAt: { gt: now } } },
    include: { user: { select: { tokenVersion: true } } },
    orderBy: { lastRegisteredAt: "desc" }, take: 500,
  });
  return devices.filter(device => device.authVersion === device.user.tokenVersion);
}
