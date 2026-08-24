import type { Prisma } from "../../../generated/prisma/client.js";
import {
  DoctorReviewStatus,
  SpecialtyStatus,
  UserStatus,
} from "../../../generated/prisma/enums.js";
import { ApiError } from "../../common/api-error.js";
import { config } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import {
  weeklyScheduleSchema,
  type ListDoctorsQuery,
} from "./doctor.schema.js";

const activeSpecialtiesSelect = {
  where: { status: SpecialtyStatus.ACTIVE },
  select: {
    id: true,
    code: true,
    name: true,
  },
  orderBy: { name: "asc" },
} as const;

const doctorListSelect = {
  userID: true,
  fullName: true,
  yearsOfExperience: true,
  qualifications: true,
  avatarUrl: true,
  bio: true,
  specialties: activeSpecialtiesSelect,
} as const;

function maskPatientName(fullName:string){
  const parts=fullName.trim().split(/\s+/).filter(Boolean);
  if(parts.length===0)return "Benh nhan";
  if(parts.length===1)return `${parts[0]!.charAt(0)}***`;
  return `${parts[0]} ${parts.slice(1).map((part)=>`${part.charAt(0)}***`).join(" ")}`;
}

function createDoctorWhere(query: ListDoctorsQuery): Prisma.DoctorProfileWhereInput {
  const searchFilters: Prisma.DoctorProfileWhereInput[] = [];

  if (query.q) {
    searchFilters.push({
      OR: [
        { fullName: { contains: query.q, mode: "insensitive" } },
        {
          specialties: {
            some: {
              status: SpecialtyStatus.ACTIVE,
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { code: { contains: query.q, mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    });
  }

  if (query.specialtyId) {
    searchFilters.push({
      specialties: {
        some: {
          id: query.specialtyId,
          status: SpecialtyStatus.ACTIVE,
        },
      },
    });
  }

  return {
    user: { status: UserStatus.ACTIVE },
    ...(searchFilters.length > 0 ? { AND: searchFilters } : {}),
  };
}

async function getRatingSummaries(doctorIds: string[]) {
  if (doctorIds.length === 0) {
    return new Map<string, { ratingAverage: number | null; reviewCount: number }>();
  }

  const summaries = await prisma.doctorReview.groupBy({
    by: ["doctorID"],
    where: {
      doctorID: { in: doctorIds },
      status:DoctorReviewStatus.PUBLISHED,
    },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return new Map(
    summaries.map((summary) => [
      summary.doctorID,
      {
        ratingAverage: summary._avg.rating,
        reviewCount: summary._count._all,
      },
    ]),
  );
}

export async function listDoctors(query: ListDoctorsQuery) {
  const where = createDoctorWhere(query);
  const skip = (query.page - 1) * query.limit;

  if (query.sortBy === "rating") {
    const doctors = await prisma.doctorProfile.findMany({
      where,
      select: doctorListSelect,
      orderBy: [{ fullName: "asc" }, { userID: "asc" }],
    });
    const ratings = await getRatingSummaries(
      doctors.map((doctor) => doctor.userID),
    );
    const sortedDoctors = doctors
      .map((doctor) => ({
        ...doctor,
        ...(ratings.get(doctor.userID) ?? {
          ratingAverage: null,
          reviewCount: 0,
        }),
      }))
      .sort((left, right) => {
        const leftRating = left.ratingAverage ?? -1;
        const rightRating = right.ratingAverage ?? -1;
        const ratingDifference = leftRating - rightRating;

        if (ratingDifference !== 0) {
          return query.order === "asc" ? ratingDifference : -ratingDifference;
        }

        return left.fullName.localeCompare(right.fullName);
      });
    const total = sortedDoctors.length;

    return {
      items: sortedDoctors.slice(skip, skip + query.limit),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  const [doctors, total] = await prisma.$transaction([
    prisma.doctorProfile.findMany({
      where,
      select: doctorListSelect,
      orderBy: [{ fullName: query.order }, { userID: "asc" }],
      skip,
      take: query.limit,
    }),
    prisma.doctorProfile.count({ where }),
  ]);

  const ratings = await getRatingSummaries(doctors.map((doctor) => doctor.userID));
  const data = doctors.map((doctor) => ({
    ...doctor,
    ...(ratings.get(doctor.userID) ?? {
      ratingAverage: null,
      reviewCount: 0,
    }),
  }));

  return {
    items: data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getDoctorDetail(doctorId: string) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      userID: doctorId,
      user: { status: UserStatus.ACTIVE },
    },
    select: {
      ...doctorListSelect,
      reviews: {
        where:{status:DoctorReviewStatus.PUBLISHED},
        select: {
          id: true,
          rating: true,
          comment: true,
          doctorReply:true,
          repliedAt:true,
          createdAt: true,
          patient: {
            select: { fullName: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!doctor) {
    throw new ApiError(404, "DOCTOR_NOT_FOUND", "Khong tim thay bac si");
  }

  const rating = await prisma.doctorReview.aggregate({
    where: {
      doctorID: doctorId,
      status:DoctorReviewStatus.PUBLISHED,
    },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const {reviews,...doctorData}=doctor;
  return {
    ...doctorData,
    reviews:reviews.map(({patient,...review})=>({
      ...review,
      patientDisplayName:maskPatientName(patient.fullName),
    })),
    ratingAverage: rating._avg.rating===null
      ?null
      :Math.round(rating._avg.rating*10)/10,
    reviewCount: rating._count._all,
  };
}

export async function getDoctorSchedule(doctorId: string) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      userID: doctorId,
      user: { status: UserStatus.ACTIVE },
    },
    select: {
      userID: true,
      weeklySchedule: true,
    },
  });

  if (!doctor) {
    throw new ApiError(404, "DOCTOR_NOT_FOUND", "Khong tim thay bac si");
  }

  return {
    doctorId,
    timezone: config.schedule.timezone,
    slotDurationMinutes: config.schedule.slotDurationMinutes,
    weeklySchedule: weeklyScheduleSchema.parse(doctor.weeklySchedule),
  };
}
