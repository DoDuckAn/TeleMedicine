import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";
import { ApiError } from "../common/api-error.js";

export function validateBody(schema: ZodSchema): RequestHandler{
    return (req,_res,next)=>{
        const result=schema.safeParse(req.body);

        if(!result.success){
            return next(
                new ApiError("VALIDATION_ERROR", result.error.issues),
            );
        }

        req.body=result.data;
        return next();
    }
}

export function validateParams(schema: ZodSchema): RequestHandler {
    return (req, _res, next) => {
        const result = schema.safeParse(req.params);

        if (!result.success) {
            return next(
                new ApiError("VALIDATION_ERROR", result.error.issues),
            );
        }

        req.params = result.data as typeof req.params;
        return next();
    };
}

export function validateQuery(schema: ZodSchema): RequestHandler {
    return (req, _res, next) => {
        const result = schema.safeParse(req.query);

        if (!result.success) {
            return next(
                new ApiError("VALIDATION_ERROR", result.error.issues),
            );
        }
        return next();
    };
}
