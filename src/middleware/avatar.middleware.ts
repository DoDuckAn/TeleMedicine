import multer from "multer";
import {ApiError} from "../common/api-error.js";

const allowedMimeTypes=new Set(["image/jpeg","image/png","image/webp"]);

export const avatarUpload=multer({
    storage:multer.memoryStorage(),
    limits:{fileSize:5*1024*1024,files:1},
    fileFilter:(_req,file,callback)=>{
        if(!allowedMimeTypes.has(file.mimetype)){
            callback(new ApiError(400,"INVALID_AVATAR_TYPE","Anh dai dien chi ho tro JPEG, PNG hoac WebP"));
            return;
        }
        callback(null,true);
    },
});
