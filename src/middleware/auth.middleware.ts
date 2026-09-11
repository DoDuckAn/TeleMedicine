import type { RequestHandler } from "express";
import { ApiError } from "../common/api-error.js";
import { verifyAccessToken } from "../lib/jwt.js";
import type { UserRole } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return next(new ApiError("UNAUTHORIZED"));
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new ApiError("UNAUTHORIZED"));
  }

  try {
    const payload = verifyAccessToken(token);

    const user=await prisma.user.findUnique({
      where:{
        id:payload.sub
      },
      select:{
        id:true,
        status:true,
        role:true,
        tokenVersion:true
      }
    })

    if(!user){
      return next(
        new ApiError("UNAUTHORIZED")
      );
    }

    if(user.status!=="ACTIVE"){
      return next(
        new ApiError("USER_DISABLED")
      )
    }

    if(user.tokenVersion!==payload.tokenVersion){
      return next(
        new ApiError("TOKEN_REVOKED")
      );
    }

    req.user = {
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    return next();
  } catch {
    return next(new ApiError("UNAUTHORIZED"));
  }
};

export function requireRole(...roles:UserRole[]):RequestHandler{
    return (req,_res,next)=>{
        if(!req.user){
            return next(new ApiError("UNAUTHORIZED"));
        }

        if(!roles.includes(req.user.role)){
            return next(new ApiError("FORBIDDEN"));
        }

        return next();
    }
}