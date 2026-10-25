import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { config } from "../config/env.js";
import type { UserRole } from "../../generated/prisma/enums.js";

type AccessTokenPayload = {
  sub: string;
  role: UserRole;
  tokenVersion: number;
};

type RefreshTokenPayload = {
  sub: string;
  tokenVersion: number;
  jti: string;
};

type AccessTokenVerifiedPayload = AccessTokenPayload;
type RefreshTokenVerifiedPayload = RefreshTokenPayload;

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn as NonNullable<SignOptions["expiresIn"]>,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload) {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as NonNullable<SignOptions["expiresIn"]>,
  });
}

export function verifyAccessToken(token: string): AccessTokenVerifiedPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret);

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.sub !== "string" ||
    typeof payload.role !== "string" ||
    typeof payload.tokenVersion !== "number"
  ) {
    throw new Error("Invalid access token payload");
  }

  return {
    sub: payload.sub,
    role: payload.role as UserRole,
    tokenVersion: payload.tokenVersion,
  };
}

export function verifyRefreshToken(token: string): RefreshTokenVerifiedPayload {
  return readRefreshToken(token, false);
}

// Logout can revoke a live descendant of an expired, rotated token.
export function verifyRefreshTokenForLogout(token: string): RefreshTokenVerifiedPayload {
  return readRefreshToken(token, true);
}

function readRefreshToken(token: string, ignoreExpiration: boolean): RefreshTokenVerifiedPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret, { ignoreExpiration });

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.sub !== "string" ||
    typeof payload.tokenVersion !== "number" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Invalid refresh token payload");
  }

  return {
    sub: payload.sub,
    tokenVersion: payload.tokenVersion,
    jti: payload.jti,
  };
}
