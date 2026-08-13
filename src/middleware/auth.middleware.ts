import type { RequestHandler } from "express";
import { ApiError } from "../common/api-error.js";
import { verifyAccessToken } from "../lib/jwt.js";
import type { UserRole } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return next(new ApiError(401, "UNAUTHORIZED", "Chua dang nhap"));
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new ApiError(401, "UNAUTHORIZED", "Token khong hop le"));
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
        new ApiError(401, "UNAUTHORIZED", "Tai khoan khong ton tai")
      );
    }

    if(user.status!=="ACTIVE"){
      return next(
        new ApiError(403, "USER_DISABLED", "Tai khoan da bi khoa")
      )
    }

    if(user.tokenVersion!==payload.tokenVersion){
      return next(
        new ApiError(401,"TOKEN_REVOKED","Phien dang nhap khong con hop le")
      );
    }

    req.user = {
      id: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    return next();
  } catch {
    return next(new ApiError(401, "UNAUTHORIZED", "Token khong hop le hoac da het han"));
  }
};

export function requireRole(...roles:UserRole[]):RequestHandler{
    return (req,_res,next)=>{
        if(!req.user){
            return next(new ApiError(401, "UNAUTHORIZED", "Chua dang nhap"));
        }

        if(!roles.includes(req.user.role)){
            return next(new ApiError(403, "FORBIDDEN", "Khong co quyen truy cap"));
        }

        return next();
    }
}