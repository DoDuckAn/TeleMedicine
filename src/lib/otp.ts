import crypto from "node:crypto";
import { config } from "../config/env.js";

export function createOtpCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOtp(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function createOtpExpiresAt() {
  return new Date(Date.now() + config.otp.expiresMinutes * 60 * 1000);
}