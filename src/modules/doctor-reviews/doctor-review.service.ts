import { Prisma,type Prisma as PrismaTypes } from "../../../generated/prisma/client.js";
import {
  AppointmentStatus,
  DoctorReviewStatus,
  UserStatus,
} from "../../../generated/prisma/enums.js";
import { ApiError } from "../../common/api-error.js";
import { prisma } from "../../lib/prisma.js";
import type {
  AdminDoctorReviewsQuery,
  CreateDoctorReviewInput,
  ModerateDoctorReviewInput,
  OwnDoctorReviewsQuery,
  PublicDoctorReviewsQuery,
  ReplyDoctorReviewInput,
} from "./doctor-review.schema.js";

function maskPatientName(fullName:string){
  const parts=fullName.trim().split(/\s+/).filter(Boolean);
  if(parts.length===0)return "Benh nhan";
  if(parts.length===1)return `${parts[0]!.charAt(0)}***`;
  return `${parts[0]} ${parts.slice(1).map((part)=>`${part.charAt(0)}***`).join(" ")}`;
}

function roundRating(value:number|null){
  return value===null?null:Math.round(value*10)/10;
}

function pagination(page:number,limit:number,total:number){
  return {
    page,
    limit,
    total,
    totalPages:Math.ceil(total/limit),
  };
}

export async function getReviewEligibility(patientId:string,doctorId:string){
  const doctor=await prisma.doctorProfile.findFirst({
    where:{userID:doctorId,user:{status:UserStatus.ACTIVE}},
    select:{userID:true,fullName:true},
  });
  if(!doctor){
    throw new ApiError(404,"DOCTOR_NOT_FOUND","Khong tim thay bac si");
  }

  const [completedAppointment,review]=await Promise.all([
    prisma.appointment.findFirst({
      where:{
        doctorID:doctorId,
        patientID:patientId,
        status:AppointmentStatus.COMPLETED,
      },
      select:{id:true},
    }),
    prisma.doctorReview.findUnique({
      where:{doctorID_patientID:{doctorID:doctorId,patientID:patientId}},
      select:{
        id:true,
        rating:true,
        comment:true,
        doctorReply:true,
        repliedAt:true,
        status:true,
        createdAt:true,
        updatedAt:true,
      },
    }),
  ]);

  const hasCompletedAppointment=completedAppointment!==null;
  const canReview=hasCompletedAppointment&&!review;
  const reason=review
    ?"ALREADY_REVIEWED"
    :!hasCompletedAppointment
      ?"NO_COMPLETED_APPOINTMENT"
      :null;

  return {
    doctorId:doctor.userID,
    doctorName:doctor.fullName,
    hasCompletedAppointment,
    canReview,
    reason,
    review,
  };
}

export async function createDoctorReview(
  patientId:string,
  doctorId:string,
  input:CreateDoctorReviewInput,
){
  const doctor=await prisma.doctorProfile.findFirst({
    where:{userID:doctorId,user:{status:UserStatus.ACTIVE}},
    select:{userID:true},
  });
  if(!doctor){
    throw new ApiError(404,"DOCTOR_NOT_FOUND","Khong tim thay bac si");
  }

  const completedAppointment=await prisma.appointment.findFirst({
    where:{
      doctorID:doctorId,
      patientID:patientId,
      status:AppointmentStatus.COMPLETED,
    },
    select:{id:true},
  });
  if(!completedAppointment){
    throw new ApiError(
      409,
      "NO_COMPLETED_APPOINTMENT",
      "Can co it nhat mot buoi kham hoan thanh voi bac si",
    );
  }

  try{
    return await prisma.doctorReview.create({
      data:{
        doctorID:doctorId,
        patientID:patientId,
        rating:input.rating,
        comment:input.comment??null,
      },
      select:{
        id:true,
        doctorID:true,
        rating:true,
        comment:true,
        status:true,
        createdAt:true,
      },
    });
  }catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002"){
      throw new ApiError(
        409,
        "DOCTOR_ALREADY_REVIEWED",
        "Benh nhan da danh gia bac si nay",
      );
    }
    throw error;
  }
}

export async function listPublicDoctorReviews(
  doctorId:string,
  query:PublicDoctorReviewsQuery,
){
  const doctor=await prisma.doctorProfile.findFirst({
    where:{userID:doctorId,user:{status:UserStatus.ACTIVE}},
    select:{userID:true},
  });
  if(!doctor){
    throw new ApiError(404,"DOCTOR_NOT_FOUND","Khong tim thay bac si");
  }

  const where:PrismaTypes.DoctorReviewWhereInput={
    doctorID:doctorId,
    status:DoctorReviewStatus.PUBLISHED,
    ...(query.rating?{rating:query.rating}:{}),
  };
  const summaryWhere:PrismaTypes.DoctorReviewWhereInput={
    doctorID:doctorId,
    status:DoctorReviewStatus.PUBLISHED,
  };
  const skip=(query.page-1)*query.limit;
  const [items,total,summary]=await prisma.$transaction([
    prisma.doctorReview.findMany({
      where,
      select:{
        id:true,
        rating:true,
        comment:true,
        doctorReply:true,
        repliedAt:true,
        createdAt:true,
        patient:{select:{fullName:true}},
      },
      orderBy:[{[query.sortBy]:query.order},{id:"asc"}],
      skip,
      take:query.limit,
    }),
    prisma.doctorReview.count({where}),
    prisma.doctorReview.aggregate({
      where:summaryWhere,
      _avg:{rating:true},
      _count:{_all:true},
    }),
  ]);

  return {
    summary:{
      ratingAverage:roundRating(summary._avg.rating),
      reviewCount:summary._count._all,
    },
    items:items.map(({patient,...review})=>({
      ...review,
      patientDisplayName:maskPatientName(patient.fullName),
    })),
    pagination:pagination(query.page,query.limit,total),
  };
}

export async function listOwnDoctorReviews(
  doctorId:string,
  query:OwnDoctorReviewsQuery,
){
  const where:PrismaTypes.DoctorReviewWhereInput={
    doctorID:doctorId,
    ...(query.rating?{rating:query.rating}:{}),
    ...(query.status?{status:query.status}:{}),
    ...(query.replied===undefined
      ?{}
      :query.replied
        ?{doctorReply:{not:null}}
        :{doctorReply:null}),
  };
  const summaryWhere:PrismaTypes.DoctorReviewWhereInput={
    doctorID:doctorId,
    status:DoctorReviewStatus.PUBLISHED,
  };
  const skip=(query.page-1)*query.limit;
  const [items,total,summary]=await prisma.$transaction([
    prisma.doctorReview.findMany({
      where,
      select:{
        id:true,
        rating:true,
        comment:true,
        doctorReply:true,
        repliedAt:true,
        status:true,
        hiddenReason:true,
        createdAt:true,
        patient:{select:{userID:true,fullName:true}},
      },
      orderBy:[{createdAt:"desc"},{id:"asc"}],
      skip,
      take:query.limit,
    }),
    prisma.doctorReview.count({where}),
    prisma.doctorReview.aggregate({
      where:summaryWhere,
      _avg:{rating:true},
      _count:{_all:true},
    }),
  ]);

  return {
    summary:{
      ratingAverage:roundRating(summary._avg.rating),
      reviewCount:summary._count._all,
    },
    items,
    pagination:pagination(query.page,query.limit,total),
  };
}

export async function replyDoctorReview(
  doctorId:string,
  reviewId:string,
  input:ReplyDoctorReviewInput,
){
  const review=await prisma.doctorReview.findFirst({
    where:{id:reviewId,doctorID:doctorId},
    select:{id:true,status:true,doctorReply:true},
  });
  if(!review){
    throw new ApiError(404,"REVIEW_NOT_FOUND","Khong tim thay danh gia");
  }
  if(review.status===DoctorReviewStatus.HIDDEN){
    throw new ApiError(409,"REVIEW_HIDDEN","Khong the phan hoi danh gia dang bi an");
  }
  if(review.doctorReply){
    throw new ApiError(409,"REVIEW_ALREADY_REPLIED","Danh gia da duoc phan hoi");
  }

  const repliedAt=new Date();
  const updated=await prisma.doctorReview.updateMany({
    where:{
      id:reviewId,
      doctorID:doctorId,
      status:DoctorReviewStatus.PUBLISHED,
      doctorReply:null,
    },
    data:{doctorReply:input.content,repliedAt},
  });
  if(updated.count!==1){
    throw new ApiError(409,"REVIEW_ALREADY_REPLIED","Danh gia da duoc phan hoi");
  }

  return prisma.doctorReview.findUniqueOrThrow({
    where:{id:reviewId},
    select:{
      id:true,
      rating:true,
      comment:true,
      doctorReply:true,
      repliedAt:true,
      status:true,
      updatedAt:true,
    },
  });
}

export async function listAdminDoctorReviews(query:AdminDoctorReviewsQuery){
  const search=query.q
    ?{
        OR:[
          {comment:{contains:query.q,mode:"insensitive" as const}},
          {doctorReply:{contains:query.q,mode:"insensitive" as const}},
          {doctor:{fullName:{contains:query.q,mode:"insensitive" as const}}},
          {patient:{fullName:{contains:query.q,mode:"insensitive" as const}}},
        ],
      }
    :{};
  const where:PrismaTypes.DoctorReviewWhereInput={
    ...search,
    ...(query.doctorId?{doctorID:query.doctorId}:{}),
    ...(query.patientId?{patientID:query.patientId}:{}),
    ...(query.rating?{rating:query.rating}:{}),
    ...(query.status?{status:query.status}:{}),
  };
  const skip=(query.page-1)*query.limit;
  const [items,total]=await prisma.$transaction([
    prisma.doctorReview.findMany({
      where,
      select:{
        id:true,
        rating:true,
        comment:true,
        doctorReply:true,
        repliedAt:true,
        status:true,
        hiddenReason:true,
        moderatedAt:true,
        createdAt:true,
        updatedAt:true,
        doctor:{select:{userID:true,fullName:true}},
        patient:{select:{userID:true,fullName:true}},
        moderatedBy:{select:{id:true,email:true,phone:true}},
      },
      orderBy:[{[query.sortBy]:query.order},{id:"asc"}],
      skip,
      take:query.limit,
    }),
    prisma.doctorReview.count({where}),
  ]);

  return {
    items,
    pagination:pagination(query.page,query.limit,total),
  };
}

export async function moderateDoctorReview(
  adminId:string,
  reviewId:string,
  input:ModerateDoctorReviewInput,
){
  const review=await prisma.doctorReview.findUnique({
    where:{id:reviewId},
    select:{id:true},
  });
  if(!review){
    throw new ApiError(404,"REVIEW_NOT_FOUND","Khong tim thay danh gia");
  }

  return prisma.doctorReview.update({
    where:{id:reviewId},
    data:{
      status:input.status,
      hiddenReason:input.status===DoctorReviewStatus.HIDDEN?input.reason!:null,
      moderatedByID:adminId,
      moderatedAt:new Date(),
    },
    select:{
      id:true,
      status:true,
      hiddenReason:true,
      moderatedAt:true,
      moderatedBy:{select:{id:true,email:true,phone:true}},
      updatedAt:true,
    },
  });
}
