import bcrypt from "bcrypt";
import {
    DoctorPasswordOtpPurpose,
    UserRole,
    UserStatus,
} from "../../../generated/prisma/enums.js";
import {ApiError} from "../../common/api-error.js";
import {config} from "../../config/env.js";
import {sendEmail,type EmailMessage} from "../../lib/email.js";
import {
    createEmailOtp,
    createEmailOtpExpiresAt,
    hashEmailOtp,
} from "../../lib/email-otp.js";
import {prisma} from "../../lib/prisma.js";
import type {
    ChangeDoctorPasswordInput,
    ResetDoctorPasswordInput,
} from "./auth.schema.js";

const SALT_BCRYPT=10;
type EmailSender=(message:EmailMessage)=>Promise<void>;

async function createAndSendOtp(
    userId:string,
    email:string,
    purpose:typeof DoctorPasswordOtpPurpose.CHANGE_PASSWORD|typeof DoctorPasswordOtpPurpose.RESET_PASSWORD,
    emailSender:EmailSender,
){
    const currentOtp=await prisma.doctorPasswordOtp.findUnique({
        where:{userID_purpose:{userID:userId,purpose}},
        select:{updatedAt:true,consumedAt:true},
    });
    const resendAt=currentOtp
        ?new Date(currentOtp.updatedAt.getTime()+config.doctorPasswordOtp.resendSeconds*1000)
        :null;
    if(currentOtp&&!currentOtp.consumedAt&&resendAt&&resendAt>new Date()){
        throw new ApiError(429,"PASSWORD_OTP_RESEND_TOO_SOON","Vui long cho truoc khi gui lai OTP");
    }
    const code=createEmailOtp();
    const codeHash=hashEmailOtp(code);
    await prisma.doctorPasswordOtp.upsert({
        where:{userID_purpose:{userID:userId,purpose}},
        create:{
            userID:userId,
            purpose,
            codeHash,
            expiresAt:createEmailOtpExpiresAt(),
        },
        update:{
            codeHash,
            expiresAt:createEmailOtpExpiresAt(),
            attempts:0,
            consumedAt:null,
        },
    });
    const action=purpose===DoctorPasswordOtpPurpose.CHANGE_PASSWORD
        ?"doi mat khau"
        :"dat lai mat khau";
    try{
        await emailSender({
            to:email,
            subject:`Ma OTP ${action} TeleMedicine`,
            text:`Ma OTP de ${action} la ${code}. Ma co hieu luc trong ${config.doctorPasswordOtp.expiresMinutes} phut.`,
        });
    }catch{
        await prisma.doctorPasswordOtp.deleteMany({where:{userID:userId,purpose,codeHash}});
        throw new ApiError(502,"EMAIL_SEND_FAILED","Khong the gui OTP qua email");
    }
}

async function verifyOtp(
    userId:string,
    purpose:typeof DoctorPasswordOtpPurpose.CHANGE_PASSWORD|typeof DoctorPasswordOtpPurpose.RESET_PASSWORD,
    code:string,
){
    const otp=await prisma.doctorPasswordOtp.findUnique({
        where:{userID_purpose:{userID:userId,purpose}},
    });
    if(!otp||otp.consumedAt){
        throw new ApiError(400,"PASSWORD_OTP_NOT_FOUND","Khong tim thay OTP hop le");
    }
    if(otp.expiresAt<new Date()){
        throw new ApiError(400,"PASSWORD_OTP_EXPIRED","OTP da het han");
    }
    if(otp.attempts>=config.doctorPasswordOtp.maxAttempts){
        throw new ApiError(429,"PASSWORD_OTP_MAX_ATTEMPTS","Da vuot qua so lan nhap OTP cho phep");
    }
    if(hashEmailOtp(code)!==otp.codeHash){
        await prisma.doctorPasswordOtp.updateMany({
            where:{id:otp.id,consumedAt:null},
            data:{attempts:{increment:1}},
        });
        throw new ApiError(400,"INVALID_PASSWORD_OTP","OTP khong hop le");
    }
    return otp.id;
}

async function saveNewPassword(userId:string,otpId:string,newPassword:string){
    const passwordHash=await bcrypt.hash(newPassword,SALT_BCRYPT);
    await prisma.$transaction(async(tx)=>{
        const consumed=await tx.doctorPasswordOtp.updateMany({
            where:{id:otpId,consumedAt:null},
            data:{consumedAt:new Date()},
        });
        if(consumed.count!==1){
            throw new ApiError(400,"PASSWORD_OTP_ALREADY_USED","OTP da duoc su dung");
        }
        await tx.user.update({
            where:{id:userId},
            data:{passwordHash,tokenVersion:{increment:1}},
        });
        await tx.refreshToken.updateMany({
            where:{userId,revokedAt:null},
            data:{revokedAt:new Date()},
        });
    });
    return {passwordChanged:true,sessionsRevoked:true};
}

export async function requestDoctorPasswordChangeOtp(
    userId:string,
    emailSender:EmailSender=sendEmail,
){
    const doctor=await prisma.user.findFirst({
        where:{id:userId,role:UserRole.DOCTOR,status:UserStatus.ACTIVE},
        select:{email:true},
    });
    if(!doctor?.email){
        throw new ApiError(400,"DOCTOR_EMAIL_REQUIRED","Bac si chua co email hop le");
    }
    await createAndSendOtp(
        userId,
        doctor.email,
        DoctorPasswordOtpPurpose.CHANGE_PASSWORD,
        emailSender,
    );
    return {message:"Da gui OTP doi mat khau qua email"};
}

export async function changeDoctorPassword(userId:string,input:ChangeDoctorPasswordInput){
    const doctor=await prisma.user.findFirst({
        where:{id:userId,role:UserRole.DOCTOR,status:UserStatus.ACTIVE},
        select:{passwordHash:true},
    });
    if(!doctor?.passwordHash){
        throw new ApiError(404,"DOCTOR_NOT_FOUND","Khong tim thay tai khoan bac si");
    }
    if(!await bcrypt.compare(input.currentPassword,doctor.passwordHash)){
        throw new ApiError(400,"INVALID_CURRENT_PASSWORD","Mat khau hien tai khong dung");
    }
    if(await bcrypt.compare(input.newPassword,doctor.passwordHash)){
        throw new ApiError(400,"PASSWORD_UNCHANGED","Mat khau moi phai khac mat khau hien tai");
    }
    const otpId=await verifyOtp(
        userId,
        DoctorPasswordOtpPurpose.CHANGE_PASSWORD,
        input.otp,
    );
    return saveNewPassword(userId,otpId,input.newPassword);
}

export async function requestDoctorPasswordResetOtp(
    email:string,
    emailSender:EmailSender=sendEmail,
){
    const doctor=await prisma.user.findFirst({
        where:{email,role:UserRole.DOCTOR,status:UserStatus.ACTIVE},
        select:{id:true,email:true},
    });
    if(doctor?.email){
        try{
            await createAndSendOtp(
                doctor.id,
                doctor.email,
                DoctorPasswordOtpPurpose.RESET_PASSWORD,
                emailSender,
            );
        }catch(error){
            if(!(error instanceof ApiError)||error.code!=="PASSWORD_OTP_RESEND_TOO_SOON"){
                throw error;
            }
        }
    }
    return {message:"Neu email thuoc tai khoan bac si, OTP dat lai mat khau da duoc gui"};
}

export async function resetDoctorPassword(input:ResetDoctorPasswordInput){
    const doctor=await prisma.user.findFirst({
        where:{email:input.email,role:UserRole.DOCTOR,status:UserStatus.ACTIVE},
        select:{id:true,passwordHash:true},
    });
    if(!doctor){
        throw new ApiError(400,"INVALID_PASSWORD_OTP","Email hoac OTP khong hop le");
    }
    if(doctor.passwordHash&&await bcrypt.compare(input.newPassword,doctor.passwordHash)){
        throw new ApiError(400,"PASSWORD_UNCHANGED","Mat khau moi phai khac mat khau hien tai");
    }
    const otpId=await verifyOtp(
        doctor.id,
        DoctorPasswordOtpPurpose.RESET_PASSWORD,
        input.otp,
    );
    return saveNewPassword(doctor.id,otpId,input.newPassword);
}
