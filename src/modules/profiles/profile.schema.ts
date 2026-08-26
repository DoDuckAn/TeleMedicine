import {z} from "zod";
import {Gender} from "../../../generated/prisma/enums.js";

const optionalEmail=z.string().trim().email().toLowerCase().nullable().optional();

export const updatePatientProfileSchema=z.object({
    email:optionalEmail,
    fullName:z.string().trim().min(2).max(72).optional(),
    dateOfBirth:z.coerce.date().max(new Date()).optional(),
    gender:z.enum([Gender.FEMALE,Gender.MALE,Gender.OTHER,Gender.UNSPECIFIED]).optional(),
    address:z.string().trim().max(255).nullable().optional(),
    medicalHistory:z.string().trim().max(2000).nullable().optional(),
    drugAllergies:z.string().trim().max(1000).nullable().optional(),
}).refine((input)=>Object.keys(input).length>0,"Can cung cap it nhat mot truong can cap nhat");

export const updateDoctorProfileSchema=z.object({
    email:z.string().trim().email().toLowerCase().optional(),
    fullName:z.string().trim().min(2).max(72).optional(),
    yearsOfExperience:z.coerce.number().int().min(0).max(80).optional(),
    qualifications:z.array(z.string().trim().min(2).max(120)).min(1).optional(),
    bio:z.string().trim().min(10).max(1000).optional(),
}).refine((input)=>Object.keys(input).length>0,"Can cung cap it nhat mot truong can cap nhat");

export type UpdatePatientProfileInput=z.infer<typeof updatePatientProfileSchema>;
export type UpdateDoctorProfileInput=z.infer<typeof updateDoctorProfileSchema>;
