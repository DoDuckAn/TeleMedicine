import type { UserRole } from "../../generated/prisma/enums.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        tokenVersion: number;
      };
    }
  }
}

export {};