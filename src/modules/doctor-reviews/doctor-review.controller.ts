import type { Request,Response } from "express";
import { ok } from "../../common/response.js";
import { doctorIdParamSchema } from "../doctors/doctor.schema.js";
import {
  adminDoctorReviewsQuerySchema,
  ownDoctorReviewsQuerySchema,
  publicDoctorReviewsQuerySchema,
  reviewIdParamSchema,
  type CreateDoctorReviewInput,
  type ModerateDoctorReviewInput,
  type ReplyDoctorReviewInput,
} from "./doctor-review.schema.js";
import * as DoctorReviewService from "./doctor-review.service.js";

export async function getReviewEligibility(req:Request,res:Response){
  const {doctorId}=doctorIdParamSchema.parse(req.params);
  return ok(res,await DoctorReviewService.getReviewEligibility(req.user!.id,doctorId));
}

export async function createDoctorReview(req:Request,res:Response){
  const {doctorId}=doctorIdParamSchema.parse(req.params);
  const input=req.body as CreateDoctorReviewInput;
  return ok(
    res,
    await DoctorReviewService.createDoctorReview(req.user!.id,doctorId,input),
    201,
  );
}

export async function listPublicDoctorReviews(req:Request,res:Response){
  const {doctorId}=doctorIdParamSchema.parse(req.params);
  const query=publicDoctorReviewsQuerySchema.parse(req.query);
  return ok(res,await DoctorReviewService.listPublicDoctorReviews(doctorId,query));
}

export async function listOwnDoctorReviews(req:Request,res:Response){
  const query=ownDoctorReviewsQuerySchema.parse(req.query);
  return ok(res,await DoctorReviewService.listOwnDoctorReviews(req.user!.id,query));
}

export async function replyDoctorReview(req:Request,res:Response){
  const {reviewId}=reviewIdParamSchema.parse(req.params);
  const input=req.body as ReplyDoctorReviewInput;
  return ok(res,await DoctorReviewService.replyDoctorReview(req.user!.id,reviewId,input));
}

export async function listAdminDoctorReviews(req:Request,res:Response){
  const query=adminDoctorReviewsQuerySchema.parse(req.query);
  return ok(res,await DoctorReviewService.listAdminDoctorReviews(query));
}

export async function moderateDoctorReview(req:Request,res:Response){
  const {reviewId}=reviewIdParamSchema.parse(req.params);
  const input=req.body as ModerateDoctorReviewInput;
  return ok(
    res,
    await DoctorReviewService.moderateDoctorReview(req.user!.id,reviewId,input),
  );
}
