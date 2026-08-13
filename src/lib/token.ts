import crypto from "node:crypto";

export function createTokenId() {
  return crypto.randomUUID();
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}