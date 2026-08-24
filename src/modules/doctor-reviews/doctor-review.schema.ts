import { z } from "zod";
import { DoctorReviewStatus } from "../../../generated/prisma/enums.js";

export const createDoctorReviewSchema=z.object({
  rating:z.number().int().min(1).max(5),
  comment:z.string().trim().min(1).max(1000).optional(),
});

export const replyDoctorReviewSchema=z.object({
  content:z.string().trim().min(1).max(1000),
});

export const moderateDoctorReviewSchema=z
  .object({
    status:z.enum([
      DoctorReviewStatus.PUBLISHED,
      DoctorReviewStatus.HIDDEN,
    ]),
    reason:z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((input,context)=>{
    if(input.status===DoctorReviewStatus.HIDDEN&&!input.reason){
      context.addIssue({
        code:"custom",
        path:["reason"],
        message:"Phai cung cap ly do an danh gia",
      });
    }
  });

export const reviewIdParamSchema=z.object({
  reviewId:z.string().trim().min(1),
});

export const doctorIdParamSchema=z.object({
  doctorId:z.string().trim().min(1),
});

const paginationFields={
  page:z.coerce.number().int().positive().default(1),
  limit:z.coerce.number().int().positive().max(100).default(20),
};

export const publicDoctorReviewsQuerySchema=z.object({
  ...paginationFields,
  rating:z.coerce.number().int().min(1).max(5).optional(),
  sortBy:z.enum(["createdAt","rating"]).default("createdAt"),
  order:z.enum(["asc","desc"]).default("desc"),
});

export const ownDoctorReviewsQuerySchema=z.object({
  ...paginationFields,
  rating:z.coerce.number().int().min(1).max(5).optional(),
  status:z.enum([
    DoctorReviewStatus.PUBLISHED,
    DoctorReviewStatus.HIDDEN,
  ]).optional(),
  replied:z.enum(["true","false"])
    .transform((value)=>value==="true")
    .optional(),
});

export const adminDoctorReviewsQuerySchema=z.object({
  ...paginationFields,
  q:z.string().trim().min(1).max(100).optional(),
  doctorId:z.string().trim().min(1).optional(),
  patientId:z.string().trim().min(1).optional(),
  rating:z.coerce.number().int().min(1).max(5).optional(),
  status:z.enum([
    DoctorReviewStatus.PUBLISHED,
    DoctorReviewStatus.HIDDEN,
  ]).optional(),
  sortBy:z.enum(["createdAt","rating"]).default("createdAt"),
  order:z.enum(["asc","desc"]).default("desc"),
});

export type CreateDoctorReviewInput=z.infer<typeof createDoctorReviewSchema>;
export type ReplyDoctorReviewInput=z.infer<typeof replyDoctorReviewSchema>;
export type ModerateDoctorReviewInput=z.infer<typeof moderateDoctorReviewSchema>;
export type PublicDoctorReviewsQuery=z.infer<typeof publicDoctorReviewsQuerySchema>;
export type OwnDoctorReviewsQuery=z.infer<typeof ownDoctorReviewsQuerySchema>;
export type AdminDoctorReviewsQuery=z.infer<typeof adminDoctorReviewsQuerySchema>;
