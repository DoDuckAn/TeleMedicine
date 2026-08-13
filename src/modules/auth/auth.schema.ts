import { z } from "zod";
import { Gender } from "../../../generated/prisma/enums.js";

export const requestRegisterOtpSchema = z.object({
  phone: z.string().trim().min(10).max(11),
  fullName: z.string().trim().min(2).max(72),
  dateOfBirth: z.coerce.date(),
  gender: z
    .enum([Gender.FEMALE, Gender.MALE, Gender.OTHER, Gender.UNSPECIFIED])
    .default(Gender.UNSPECIFIED),
});

export type RequestRegisterOtpInput = z.infer<typeof requestRegisterOtpSchema>;

export const registerOtpPayloadSchema = requestRegisterOtpSchema;
export type RegisterOtpPayloadInput = z.infer<typeof registerOtpPayloadSchema>;

export const verifyRegisterOtpSchema = z.object({
  phone: z.string().trim().min(10).max(11),
  otp: z.string().trim().length(6),
});

export type VerifyRegisterOtpInput = z.infer<typeof verifyRegisterOtpSchema>;

export const requestPatientLoginOtpSchema = z.object({
  phone: z.string().trim().min(10).max(11),
});

export type RequestPatientLoginOtpInput = z.infer<typeof requestPatientLoginOtpSchema>;

export const loginPatientSchema = z.object({
  phone: z.string().trim().min(10).max(11),
  otp: z.string().trim().length(6),
});

export type LoginPatientInput = z.infer<typeof loginPatientSchema>;

export const loginStaffSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

export type LoginStaffInput = z.infer<typeof loginStaffSchema>;

export const createDoctorSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
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

export const testCodexUpdateSchema = z.object({
  refreshToken: z.string().min(1),
});

export const testCodexDeleteSchema = z.object({
  refreshToken: z.string().min(1),
});

