import {UserRole} from "../../../generated/prisma/enums.js";
import {ApiError} from "../../common/api-error.js";
import {uploadAvatar,type AvatarUploadResult} from "../../lib/cloudinary.js";
import {prisma} from "../../lib/prisma.js";
import type {
    UpdateDoctorProfileInput,
    UpdatePatientProfileInput,
} from "./profile.schema.js";

function isPrismaUniqueError(error:unknown){
    return typeof error==="object"&&error!==null&&"code" in error&&error.code==="P2002";
}

async function ensureEmailAvailable(userId:string,email:string|null|undefined){
    if(!email)return;
    const existed=await prisma.user.findFirst({
        where:{email,id:{not:userId}},
        select:{id:true},
    });
    if(existed){
        throw new ApiError("EMAIL_ALREADY_EXISTS");
    }
}

export async function getPatientProfile(userId:string){
    const user=await prisma.user.findFirst({
        where:{id:userId,role:UserRole.PATIENT},
        select:{
            id:true,
            phone:true,
            email:true,
            patientProfile:{
                select:{
                    fullName:true,
                    dateOfBirth:true,
                    gender:true,
                    address:true,
                    medicalHistory:true,
                    drugAllergies:true,
                    avatar:true,
                },
            },
        },
    });
    if(!user?.patientProfile){
        throw new ApiError("PATIENT_PROFILE_NOT_FOUND");
    }
    return user;
}

export async function updatePatientProfile(userId:string,input:UpdatePatientProfileInput){
    await ensureEmailAvailable(userId,input.email);
    const {email}=input;
    const profileData={
        ...(input.fullName!==undefined?{fullName:input.fullName}:{}),
        ...(input.dateOfBirth!==undefined?{dateOfBirth:input.dateOfBirth}:{}),
        ...(input.gender!==undefined?{gender:input.gender}:{}),
        ...(input.address!==undefined?{address:input.address}:{}),
        ...(input.medicalHistory!==undefined?{medicalHistory:input.medicalHistory}:{}),
        ...(input.drugAllergies!==undefined?{drugAllergies:input.drugAllergies}:{}),
    };
    let result;
    try{
        result=await prisma.$transaction(async(tx)=>{
            const patient=await tx.patientProfile.updateMany({
                where:{userID:userId,user:{role:UserRole.PATIENT}},
                data:profileData,
            });
            if(patient.count!==1){
                throw new ApiError("PATIENT_PROFILE_NOT_FOUND");
            }
            if(email!==undefined){
                await tx.user.update({where:{id:userId},data:{email}});
                if(email===null){
                    await tx.notificationPreference.updateMany({
                        where:{userID:userId},
                        data:{emailEnabled:false},
                    });
                }
            }
            return tx.user.findUniqueOrThrow({
                where:{id:userId},
                select:{email:true,patientProfile:true},
            });
        });
    }catch(error){
        if(isPrismaUniqueError(error)){
            throw new ApiError("EMAIL_ALREADY_EXISTS");
        }
        throw error;
    }
    return result;
}

export async function getDoctorProfile(userId:string){
    const user=await prisma.user.findFirst({
        where:{id:userId,role:UserRole.DOCTOR},
        select:{
            id:true,
            email:true,
            doctorProfile:{
                include:{
                    specialties:{
                        select:{id:true,code:true,name:true,status:true},
                        orderBy:{name:"asc"},
                    },
                },
            },
        },
    });
    if(!user?.doctorProfile){
        throw new ApiError("DOCTOR_PROFILE_NOT_FOUND");
    }
    return user;
}

export async function updateDoctorProfile(userId:string,input:UpdateDoctorProfileInput){
    await ensureEmailAvailable(userId,input.email);
    const {email}=input;
    const profileData={
        ...(input.fullName!==undefined?{fullName:input.fullName}:{}),
        ...(input.yearsOfExperience!==undefined?{yearsOfExperience:input.yearsOfExperience}:{}),
        ...(input.qualifications!==undefined?{qualifications:input.qualifications}:{}),
        ...(input.bio!==undefined?{bio:input.bio}:{}),
    };
    try{
        return await prisma.$transaction(async(tx)=>{
            const doctor=await tx.doctorProfile.updateMany({
                where:{userID:userId,user:{role:UserRole.DOCTOR}},
                data:profileData,
            });
            if(doctor.count!==1){
                throw new ApiError("DOCTOR_PROFILE_NOT_FOUND");
            }
            if(email!==undefined){
                await tx.user.update({where:{id:userId},data:{email}});
            }
            return tx.user.findUniqueOrThrow({
                where:{id:userId},
                select:{email:true,doctorProfile:true},
            });
        });
    }catch(error){
        if(isPrismaUniqueError(error)){
            throw new ApiError("EMAIL_ALREADY_EXISTS");
        }
        throw error;
    }
}

type AvatarUploader=(buffer:Buffer,userId:string,role:"patient"|"doctor")=>Promise<AvatarUploadResult>;

async function uploadProfileAvatar(
    userId:string,
    role:"patient"|"doctor",
    file:Express.Multer.File|undefined,
    uploader:AvatarUploader,
){
    if(!file){
        throw new ApiError("AVATAR_REQUIRED");
    }
    let uploaded:AvatarUploadResult;
    try{
        uploaded=await uploader(file.buffer,userId,role);
    }catch{
        throw new ApiError("AVATAR_UPLOAD_FAILED");
    }
    if(role==="patient"){
        const result=await prisma.patientProfile.updateMany({
            where:{userID:userId,user:{role:UserRole.PATIENT}},
            data:{avatar:uploaded.url},
        });
        if(result.count!==1)throw new ApiError("PATIENT_PROFILE_NOT_FOUND");
    }else{
        const result=await prisma.doctorProfile.updateMany({
            where:{userID:userId,user:{role:UserRole.DOCTOR}},
            data:{avatarUrl:uploaded.url},
        });
        if(result.count!==1)throw new ApiError("DOCTOR_PROFILE_NOT_FOUND");
    }
    return {avatarUrl:uploaded.url};
}

export function updatePatientAvatar(
    userId:string,
    file:Express.Multer.File|undefined,
    uploader:AvatarUploader=uploadAvatar,
){
    return uploadProfileAvatar(userId,"patient",file,uploader);
}

export function updateDoctorAvatar(
    userId:string,
    file:Express.Multer.File|undefined,
    uploader:AvatarUploader=uploadAvatar,
){
    return uploadProfileAvatar(userId,"doctor",file,uploader);
}
