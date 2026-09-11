import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.js";
import { config } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

export const integrationSecretKeys = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
] as const;

export type IntegrationSecretKey = (typeof integrationSecretKeys)[number];
export type IntegrationSecretUpdates = Partial<
  Record<IntegrationSecretKey, string | null | undefined>
>;

const fallbackValues: Record<IntegrationSecretKey, () => string | undefined> = {
  CLOUDINARY_CLOUD_NAME: () => config.cloudinary.cloudName,
  CLOUDINARY_API_KEY: () => config.cloudinary.apiKey,
  CLOUDINARY_API_SECRET: () => config.cloudinary.apiSecret,
  FIREBASE_PROJECT_ID: () => config.firebase.projectId,
  FIREBASE_CLIENT_EMAIL: () => config.firebase.clientEmail,
  FIREBASE_PRIVATE_KEY: () => config.firebase.privateKey,
  GOOGLE_CLIENT_ID: () => config.googleMeet.clientId,
  GOOGLE_CLIENT_SECRET: () => config.googleMeet.clientSecret,
  GOOGLE_REFRESH_TOKEN: () => config.googleMeet.refreshToken,
  SMTP_HOST: () => config.email.host,
  SMTP_PORT: () => String(config.email.port),
  SMTP_SECURE: () => String(config.email.secure),
  SMTP_USER: () => config.email.user,
  SMTP_PASSWORD: () => config.email.password,
  EMAIL_FROM: () => config.email.from,
};

function encryptionKey() {
  return createHash("sha256")
    .update(`system-settings:v1:${config.settingsEncryptionKey}`)
    .digest();
}

export function encryptIntegrationSecret(key: IntegrationSecretKey, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(key));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptIntegrationSecret(key: IntegrationSecretKey, payload: string) {
  const [version, ivValue, tagValue, encryptedValue] = payload.split(":");
  if (version !== "v1" || !ivValue || !tagValue || encryptedValue === undefined) {
    throw new Error(`Invalid encrypted integration setting: ${key}`);
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64"),
  );
  decipher.setAAD(Buffer.from(key));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function resolveIntegrationSecrets<K extends IntegrationSecretKey>(
  keys: readonly K[],
) {
  const stored = await prisma.integrationSecret.findMany({
    where: { key: { in: [...keys] } },
  });
  const storedByKey = new Map(stored.map((item) => [item.key, item.encryptedValue]));
  return Object.fromEntries(
    keys.map((key) => {
      const encrypted = storedByKey.get(key);
      return [
        key,
        encrypted ? decryptIntegrationSecret(key, encrypted) : fallbackValues[key](),
      ];
    }),
  ) as Record<K, string | undefined>;
}

export async function getIntegrationSecretStatuses() {
  const stored = new Set(
    (
      await prisma.integrationSecret.findMany({
        select: { key: true },
      })
    ).map((item) => item.key),
  );
  return Object.fromEntries(
    integrationSecretKeys.map((key) => {
      const fromDatabase = stored.has(key);
      const fromEnvironment = Boolean(fallbackValues[key]());
      return [
        key,
        {
          configured: fromDatabase || fromEnvironment,
          environmentConfigured: fromEnvironment,
          source: fromDatabase ? "DATABASE" : fromEnvironment ? "ENVIRONMENT" : "NONE",
        },
      ];
    }),
  ) as Record<
    IntegrationSecretKey,
    {
      configured: boolean;
      environmentConfigured: boolean;
      source: "DATABASE" | "ENVIRONMENT" | "NONE";
    }
  >;
}

export async function applyIntegrationSecretUpdates(
  tx: Prisma.TransactionClient,
  updates: IntegrationSecretUpdates,
) {
  for (const key of integrationSecretKeys) {
    const value = updates[key];
    if (value === undefined) continue;
    if (value === null) {
      await tx.integrationSecret.deleteMany({ where: { key } });
      continue;
    }
    await tx.integrationSecret.upsert({
      where: { key },
      create: { key, encryptedValue: encryptIntegrationSecret(key, value) },
      update: { encryptedValue: encryptIntegrationSecret(key, value) },
    });
  }
}

export function hasIntegrationSecretUpdates(updates: IntegrationSecretUpdates) {
  return integrationSecretKeys.some((key) => updates[key] !== undefined);
}
