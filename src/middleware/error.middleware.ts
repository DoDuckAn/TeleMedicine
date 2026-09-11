import type { ErrorRequestHandler } from "express";
import { ApiError } from "../common/api-error.js";
import multer from "multer";
import {errorCatalog} from "../common/error-catalog.js";

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  if(err instanceof multer.MulterError){
    const code=err.code==="LIMIT_FILE_SIZE"?"AVATAR_TOO_LARGE":"INVALID_AVATAR_UPLOAD";
    const definition=errorCatalog[code];
    return res.status(definition.statusCode).json({
      success:false,
      error:{
        code,
        message:definition.message,
      },
    });
  }

  console.error(err);

  const definition=errorCatalog.INTERNAL_SERVER_ERROR;
  return res.status(definition.statusCode).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: definition.message,
    },
  });
};
