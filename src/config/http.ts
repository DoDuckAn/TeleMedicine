import "dotenv/config";
import { z } from "zod";

export const httpConfig = z.object({
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  SENSITIVE_RATE_LIMIT: z.coerce.number().int().positive().default(5),
}).parse(process.env);
