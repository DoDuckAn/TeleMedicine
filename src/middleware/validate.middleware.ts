import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";
import { ApiError } from "../common/api-error.js";

export function validateBody(schema: ZodSchema): RequestHandler{
    return (req,_res,next)=>{
        const result=schema.safeParse(req.body);

        if(!result.success){
            return next(
                new ApiError(
                    400,
                    "VALIDATION_ERROR",
                    "Du lieu khong hop le",
                    result.error.issues,
                ),
            );
        }

        req.body=result.data;
        return next();
    }
}