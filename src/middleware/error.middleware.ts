import type { ErrorRequestHandler } from "express";
import { ApiError } from "../common/api-error.js";
import multer from "multer";

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
    return res.status(400).json({
      success:false,
      error:{
        code:"INVALID_AVATAR_UPLOAD",
        message:err.code==="LIMIT_FILE_SIZE"
          ?"Anh dai dien khong duoc vuot qua 5MB"
          :"File anh dai dien khong hop le",
      },
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Loi he thong",
    },
  });
};
