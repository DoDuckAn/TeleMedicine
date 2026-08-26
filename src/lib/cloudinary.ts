import {v2 as cloudinary} from "cloudinary";
import {config} from "../config/env.js";

export type AvatarUploadResult={
    url:string;
    publicId:string;
};

export async function uploadAvatar(
    buffer:Buffer,
    userId:string,
    role:"patient"|"doctor",
):Promise<AvatarUploadResult>{
    const {cloudName,apiKey,apiSecret}=config.cloudinary;
    if(!cloudName||!apiKey||!apiSecret){
        throw new Error("Cloudinary is not configured");
    }
    cloudinary.config({cloud_name:cloudName,api_key:apiKey,api_secret:apiSecret});
    return new Promise((resolve,reject)=>{
        const stream=cloudinary.uploader.upload_stream({
            folder:"telemedicine/avatars",
            public_id:`${role}-${userId}`,
            overwrite:true,
            resource_type:"image",
            transformation:[{
                width:800,
                height:800,
                crop:"fill",
                gravity:"face",
                quality:"auto",
                fetch_format:"auto",
            }],
        },(error,result)=>{
            if(error||!result){
                reject(error??new Error("Cloudinary did not return an upload result"));
                return;
            }
            resolve({url:result.secure_url,publicId:result.public_id});
        });
        stream.end(buffer);
    });
}
