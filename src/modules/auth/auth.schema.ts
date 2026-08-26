import { z } from "zod";
import { Gender } from "../../../generated/prisma/enums.js";
import { weeklyScheduleSchema } from "../doctors/doctor.schema.js";

export const registerPatientSchema=z.object({
  firebaseIdToken:z.string().trim().min(100).max(4096),
  fullName: z.string().trim().min(2).max(72),
  dateOfBirth: z.coerce.date(),
  gender: z
    .enum([Gender.FEMALE, Gender.MALE, Gender.OTHER, Gender.UNSPECIFIED])
    .default(Gender.UNSPECIFIED),
});

export type RegisterPatientInput=z.infer<typeof registerPatientSchema>;

export const loginPatientSchema = z.object({
  firebaseIdToken:z.string().trim().min(100).max(4096),
});

export type LoginPatientInput = z.infer<typeof loginPatientSchema>;

export const loginStaffSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

export type LoginStaffInput = z.infer<typeof loginStaffSchema>;

const newPasswordFields={
  newPassword:z.string().min(8).max(72),
  confirmPassword:z.string().min(8).max(72),
};

export const requestDoctorPasswordResetOtpSchema=z.object({
  email:z.string().trim().email().toLowerCase(),
});

export const changeDoctorPasswordSchema=z.object({
  currentPassword:z.string().min(1).max(72),
  otp:z.string().trim().regex(/^\d{6}$/),
  ...newPasswordFields,
}).refine((input)=>input.newPassword===input.confirmPassword,{
  path:["confirmPassword"],
  message:"Mat khau xac nhan khong khop",
});

export const resetDoctorPasswordSchema=z.object({
  email:z.string().trim().email().toLowerCase(),
  otp:z.string().trim().regex(/^\d{6}$/),
  ...newPasswordFields,
}).refine((input)=>input.newPassword===input.confirmPassword,{
  path:["confirmPassword"],
  message:"Mat khau xac nhan khong khop",
});

export type ChangeDoctorPasswordInput=z.infer<typeof changeDoctorPasswordSchema>;
export type ResetDoctorPasswordInput=z.infer<typeof resetDoctorPasswordSchema>;

export const createDoctorSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  fullName: z.string().trim().min(2).max(72),
  yearsOfExperience: z.coerce.number().int().min(0).max(80),
  specialtyIds: z.array(z.string().trim().min(1)).min(1),
  qualifications: z.array(z.string().trim().min(2).max(120)).min(1),
  avatarUrl: z.string().trim().url(),
  bio: z.string().trim().min(10).max(1000),
  weeklySchedule: weeklyScheduleSchema,
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LogOutInput = z.infer<typeof logoutSchema>;
