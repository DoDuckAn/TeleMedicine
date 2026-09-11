import type {Prisma} from "../../../generated/prisma/client.js";
import {
    NotificationDeliveryStatus,
    SpecialtyStatus,
    UserRole,
    UserStatus,
} from "../../../generated/prisma/enums.js";
import {ApiError} from "../../common/api-error.js";
import {prisma} from "../../lib/prisma.js";
import type {
    AdminDoctorListQuery,
    AdminPatientListQuery,
    UpdateAdminDoctorInput,
    UpdateUserStatusInput,
} from "./admin.schema.js";
import {assertWeeklyScheduleWithinWorkday,getScheduleSettings} from "../system-settings/system-setting.service.js";

function pagination(page:number,limit:number,total:number){
    return {page,limit,total,totalPages:Math.ceil(total/limit)};
}

function isPrismaUniqueError(error:unknown){
    return typeof error==="object"&&error!==null&&"code" in error&&error.code==="P2002";
}

export async function listDoctors(query:AdminDoctorListQuery){
    const where:Prisma.DoctorProfileWhereInput={
        ...(query.q?{
            OR:[
                {fullName:{contains:query.q,mode:"insensitive"}},
                {user:{email:{contains:query.q,mode:"insensitive"}}},
            ],
        }:{}),
        ...(query.status?{user:{status:query.status}}:{}),
        ...(query.specialtyId?{specialties:{some:{id:query.specialtyId}}}:{}),
    };
    const skip=(query.page-1)*query.limit;
    const items=await prisma.doctorProfile.findMany({
            where,
            select:{
                userID:true,
                fullName:true,
                yearsOfExperience:true,
                qualifications:true,
                avatarUrl:true,
                bio:true,
                createdAt:true,
                user:{select:{email:true,status:true,lastLoginAt:true,createdAt:true}},
                specialties:{
                    select:{id:true,code:true,name:true,status:true,deletedAt:true},
                    orderBy:{name:"asc"},
                },
                _count:{select:{appointments:true,reviews:true}},
            },
            orderBy:query.sortBy==="fullName"
                ?[{fullName:query.order},{userID:"asc"}]
                :[{createdAt:query.order},{userID:"asc"}],
            skip,
            take:query.limit,
    });
    const total=await prisma.doctorProfile.count({where});
    const doctorIds=items.map((item)=>item.userID);
    const ratings=doctorIds.length===0?[]:await prisma.doctorReview.groupBy({
        by:["doctorID"],
        where:{doctorID:{in:doctorIds}},
        _avg:{rating:true},
    });
    const ratingByDoctor=new Map(ratings.map((item)=>[item.doctorID,item._avg.rating]));
    return {
        items:items.map((item)=>({
            ...item,
            averageRating:ratingByDoctor.get(item.userID)??null,
        })),
        pagination:pagination(query.page,query.limit,total),
    };
}

export async function getDoctorDetail(doctorId:string){
    const doctor=await prisma.doctorProfile.findUnique({
        where:{userID:doctorId},
        select:{
            userID:true,
            fullName:true,
            yearsOfExperience:true,
            qualifications:true,
            avatarUrl:true,
            bio:true,
            weeklySchedule:true,
            createdAt:true,
            updatedAt:true,
            user:{
                select:{
                    email:true,
                    status:true,
                    lastLoginAt:true,
                    createdAt:true,
                    updatedAt:true,
                    statusHistory:{
                        select:{
                            id:true,
                            fromStatus:true,
                            toStatus:true,
                            reason:true,
                            createdAt:true,
                            changedBy:{select:{id:true,email:true}},
                        },
                        orderBy:{createdAt:"desc"},
                    },
                },
            },
            specialties:{
                select:{id:true,code:true,name:true,status:true,deletedAt:true},
                orderBy:{name:"asc"},
            },
            _count:{select:{appointments:true,reviews:true,scheduleOverrides:true}},
        },
    });
    if(!doctor){
        throw new ApiError("DOCTOR_NOT_FOUND");
    }
    const rating=await prisma.doctorReview.aggregate({
        where:{doctorID:doctorId},
        _avg:{rating:true},
    });
    return {...doctor,averageRating:rating._avg.rating};
}

export async function updateDoctor(doctorId:string,input:UpdateAdminDoctorInput){
    const doctor=await prisma.doctorProfile.findUnique({
        where:{userID:doctorId},
        select:{userID:true},
    });
    if(!doctor){
        throw new ApiError("DOCTOR_NOT_FOUND");
    }
    if(input.weeklySchedule!==undefined){
        assertWeeklyScheduleWithinWorkday(input.weeklySchedule,await getScheduleSettings());
    }
    const specialtyIds=input.specialtyIds?[...new Set(input.specialtyIds)]:undefined;
    if(specialtyIds){
        const specialties=await prisma.specialty.findMany({
            where:{
                id:{in:specialtyIds},
                status:SpecialtyStatus.ACTIVE,
                deletedAt:null,
            },
            select:{id:true},
        });
        if(specialties.length!==specialtyIds.length){
            throw new ApiError("SPECIALTY_NOT_AVAILABLE");
        }
    }
    const profileData={
        ...(input.fullName!==undefined?{fullName:input.fullName}:{}),
        ...(input.yearsOfExperience!==undefined?{yearsOfExperience:input.yearsOfExperience}:{}),
        ...(input.qualifications!==undefined?{qualifications:input.qualifications}:{}),
        ...(input.avatarUrl!==undefined?{avatarUrl:input.avatarUrl}:{}),
        ...(input.bio!==undefined?{bio:input.bio}:{}),
        ...(input.weeklySchedule!==undefined?{weeklySchedule:input.weeklySchedule}:{}),
        ...(specialtyIds?{specialties:{set:specialtyIds.map((id)=>({id}))}}:{}),
    };
    try{
        await prisma.$transaction(async(tx)=>{
            if(input.email!==undefined){
                await tx.user.update({where:{id:doctorId},data:{email:input.email}});
            }
            await tx.doctorProfile.update({where:{userID:doctorId},data:profileData});
        });
    }catch(error){
        if(isPrismaUniqueError(error)){
            throw new ApiError("EMAIL_ALREADY_EXISTS");
        }
        throw error;
    }
    return getDoctorDetail(doctorId);
}

export async function listPatients(query:AdminPatientListQuery){
    const where:Prisma.PatientProfileWhereInput={
        ...(query.q?{
            OR:[
                {fullName:{contains:query.q,mode:"insensitive"}},
                {user:{phone:{contains:query.q}}},
                {user:{email:{contains:query.q,mode:"insensitive"}}},
            ],
        }:{}),
        ...(query.status?{user:{status:query.status}}:{}),
        ...(query.gender?{gender:query.gender}:{}),
    };
    const skip=(query.page-1)*query.limit;
    const items=await prisma.patientProfile.findMany({
            where,
            select:{
                userID:true,
                fullName:true,
                dateOfBirth:true,
                gender:true,
                address:true,
                avatar:true,
                createdAt:true,
                user:{select:{phone:true,email:true,status:true,lastLoginAt:true,createdAt:true}},
                _count:{select:{appointments:true,doctorReviews:true}},
            },
            orderBy:query.sortBy==="fullName"
                ?[{fullName:query.order},{userID:"asc"}]
                :[{createdAt:query.order},{userID:"asc"}],
            skip,
            take:query.limit,
    });
    const total=await prisma.patientProfile.count({where});
    return {items,pagination:pagination(query.page,query.limit,total)};
}

export async function getPatientDetail(patientId:string){
    const patient=await prisma.patientProfile.findUnique({
        where:{userID:patientId},
        select:{
            userID:true,
            fullName:true,
            dateOfBirth:true,
            gender:true,
            address:true,
            medicalHistory:true,
            drugAllergies:true,
            avatar:true,
            createdAt:true,
            updatedAt:true,
            user:{
                select:{
                    phone:true,
                    email:true,
                    status:true,
                    lastLoginAt:true,
                    createdAt:true,
                    updatedAt:true,
                    statusHistory:{
                        select:{
                            id:true,
                            fromStatus:true,
                            toStatus:true,
                            reason:true,
                            createdAt:true,
                            changedBy:{select:{id:true,email:true}},
                        },
                        orderBy:{createdAt:"desc"},
                    },
                },
            },
            _count:{select:{appointments:true,doctorReviews:true}},
        },
    });
    if(!patient){
        throw new ApiError("PATIENT_NOT_FOUND");
    }
    return patient;
}

export async function updateUserStatus(
    adminId:string,
    userId:string,
    expectedRole:typeof UserRole.DOCTOR|typeof UserRole.PATIENT,
    input:UpdateUserStatusInput,
){
    const user=await prisma.user.findFirst({
        where:{id:userId,role:expectedRole},
        select:{id:true,status:true},
    });
    if(!user){
        throw new ApiError(expectedRole===UserRole.DOCTOR?"DOCTOR_NOT_FOUND":"PATIENT_NOT_FOUND");
    }
    if(user.status===input.status){
        throw new ApiError("USER_STATUS_UNCHANGED");
    }
    await prisma.$transaction(async(tx)=>{
        const updated=await tx.user.updateMany({
            where:{id:userId,status:user.status},
            data:{
                status:input.status,
                ...(input.status===UserStatus.DISABLED?{tokenVersion:{increment:1}}:{}),
            },
        });
        if(updated.count!==1){
            throw new ApiError("USER_STATUS_CHANGED");
        }
        await tx.userStatusHistory.create({
            data:{
                userID:userId,
                changedByID:adminId,
                fromStatus:user.status,
                toStatus:input.status,
                reason:input.reason,
            },
        });
        if(input.status===UserStatus.DISABLED){
            await tx.refreshToken.updateMany({
                where:{userId,revokedAt:null},
                data:{revokedAt:new Date()},
            });
            await tx.pushDeviceToken.updateMany({
                where:{userID:userId,enabled:true},
                data:{enabled:false},
            });
            await tx.appointmentNotification.updateMany({
                where:{
                    recipientID:userId,
                    status:NotificationDeliveryStatus.PROCESSING,
                },
                data:{
                    status:NotificationDeliveryStatus.CANCELLED,
                    processingStartedAt:null,
                    nextAttemptAt:null,
                    failureReason:"Recipient account disabled",
                },
            });
        }
    });
    return expectedRole===UserRole.DOCTOR
        ?getDoctorDetail(userId)
        :getPatientDetail(userId);
}
