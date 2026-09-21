import { rateLimit } from "express-rate-limit";
import { httpConfig } from "../config/http.js";
import { errorCatalog } from "../common/error-catalog.js";

export function createLimiter(limit: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: "RATE_LIMITED", message: errorCatalog.RATE_LIMITED.message },
    },
  });
}

export const apiLimiter = createLimiter(httpConfig.API_RATE_LIMIT, 60_000);
export const authLimiter = createLimiter(httpConfig.AUTH_RATE_LIMIT, 15 * 60_000);
export const sensitiveLimiter = createLimiter(httpConfig.SENSITIVE_RATE_LIMIT, 15 * 60_000);
export const writeLimiter = createLimiter(60, 60_000);
