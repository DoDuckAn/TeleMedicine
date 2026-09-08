import { z } from "zod";
import { SpecialtyStatus } from "../../../generated/prisma/enums.js";

const specialtyFields = {
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_-]+$/)),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum([SpecialtyStatus.ACTIVE, SpecialtyStatus.DISABLED]),
};

export const createSpecialtySchema = z.object({
  code: specialtyFields.code,
  name: specialtyFields.name,
  description: specialtyFields.description,
});

export const updateSpecialtySchema = z
  .object(specialtyFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Can cung cap it nhat mot truong de cap nhat",
  });

export const specialtyIdParamSchema = z.object({
  specialtyId: z.string().trim().min(1),
});

export const doctorSpecialtyParamSchema = specialtyIdParamSchema.extend({
  doctorId: z.string().trim().min(1),
});

export type CreateSpecialtyInput = z.infer<typeof createSpecialtySchema>;
export type UpdateSpecialtyInput = z.infer<typeof updateSpecialtySchema>;
export const updateSpecialtyDoctorsSchema=z.object({
  addDoctorIds:z.array(z.string().trim().min(1)).max(500).default([]),
  removeDoctorIds:z.array(z.string().trim().min(1)).max(500).default([]),
}).refine(input=>!input.addDoctorIds.some(id=>input.removeDoctorIds.includes(id)),{
  message:"Khong the them va go cung mot bac si",
});
