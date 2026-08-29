import {z} from "zod";
import {
    Gender,
    UserStatus,
} from "../../../generated/prisma/enums.js";
import {weeklyScheduleSchema} from "../doctors/doctor.schema.js";

const paginationFields={
    page:z.coerce.number().int().positive().default(1),
    limit:z.coerce.number().int().positive().max(100).default(20),
};

export const adminDoctorListQuerySchema=z.object({
    ...paginationFields,
    q:z.string().trim().min(1).max(100).optional(),
    status:z.enum([UserStatus.ACTIVE,UserStatus.DISABLED]).optional(),
    specialtyId:z.string().trim().min(1).optional(),
    sortBy:z.enum(["fullName","createdAt"]).default("createdAt"),
    order:z.enum(["asc","desc"]).default("desc"),
});

export const adminPatientListQuerySchema=z.object({
    ...paginationFields,
    q:z.string().trim().min(1).max(100).optional(),
    status:z.enum([UserStatus.ACTIVE,UserStatus.DISABLED]).optional(),
    gender:z.enum([Gender.FEMALE,Gender.MALE,Gender.OTHER,Gender.UNSPECIFIED]).optional(),
    sortBy:z.enum(["fullName","createdAt"]).default("createdAt"),
    order:z.enum(["asc","desc"]).default("desc"),
});

export const adminUserIdParamSchema=z.object({
    userId:z.string().trim().min(1),
});

export const adminDoctorIdParamSchema=z.object({
    doctorId:z.string().trim().min(1),
});

export const updateAdminDoctorSchema=z.object({
    email:z.string().trim().email().toLowerCase().optional(),
    fullName:z.string().trim().min(2).max(72).optional(),
    yearsOfExperience:z.coerce.number().int().min(0).max(80).optional(),
    qualifications:z.array(z.string().trim().min(2).max(120)).min(1).optional(),
    avatarUrl:z.string().trim().url().optional(),
    bio:z.string().trim().min(10).max(1000).optional(),
    specialtyIds:z.array(z.string().trim().min(1)).min(1).optional(),
    weeklySchedule:weeklyScheduleSchema.optional(),
}).refine((input)=>Object.keys(input).length>0,"Can cung cap it nhat mot truong can cap nhat");

export const updateUserStatusSchema=z.object({
    status:z.enum([UserStatus.ACTIVE,UserStatus.DISABLED]),
    reason:z.string().trim().min(3).max(500),
});

const isoDateTimeSchema=z
    .string()
    .datetime({offset:true})
    .transform((value)=>new Date(value));

export const statisticsQuerySchema=z.object({
    from:isoDateTimeSchema.optional(),
    to:isoDateTimeSchema.optional(),
    groupBy:z.enum(["day","week","month"]).default("day"),
}).superRefine((query,context)=>{
    if(query.from&&query.to&&query.from>=query.to){
        context.addIssue({
            code:"custom",
            path:["to"],
            message:"to phai lon hon from",
        });
    }
    if(query.from&&query.to&&query.to.getTime()-query.from.getTime()>366*24*60*60*1000){
        context.addIssue({
            code:"custom",
            path:["to"],
            message:"Khoang thong ke khong duoc vuot qua 366 ngay",
        });
    }
});

export type AdminDoctorListQuery=z.infer<typeof adminDoctorListQuerySchema>;
export type AdminPatientListQuery=z.infer<typeof adminPatientListQuerySchema>;
export type UpdateAdminDoctorInput=z.infer<typeof updateAdminDoctorSchema>;
export type UpdateUserStatusInput=z.infer<typeof updateUserStatusSchema>;
export type StatisticsQuery=z.infer<typeof statisticsQuerySchema>;
