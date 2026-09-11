import { ApiError } from "../../common/api-error.js";
import { prisma } from "../../lib/prisma.js";
import { SpecialtyStatus } from "../../../generated/prisma/enums.js";
import type {
  CreateSpecialtyInput,
  UpdateSpecialtyInput,
} from "./specialty.schema.js";

const doctorSelect = {
  userID: true,
  fullName: true,
  yearsOfExperience: true,
  qualifications: true,
  avatarUrl: true,
  bio: true,
} as const;

const specialtySelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  status: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  doctors: {
    where: { user: { status: "ACTIVE" } },
    select: doctorSelect,
    orderBy: { fullName: "asc" },
  },
} as const;

async function ensureUniqueSpecialty(
  input: Pick<CreateSpecialtyInput, "code" | "name">,
  excludeId?: string,
) {
  const duplicated = await prisma.specialty.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [{ code: input.code }, { name: input.name }],
    },
    select: { code: true, name: true },
  });

  if (duplicated) {
    throw new ApiError("SPECIALTY_ALREADY_EXISTS", duplicated);
  }
}

async function getSpecialtyOrThrow(specialtyId: string, activeOnly = false) {
  const specialty = await prisma.specialty.findFirst({
    where: {
      id: specialtyId,
      ...(activeOnly ? { status: SpecialtyStatus.ACTIVE } : {}),
    },
    select: specialtySelect,
  });

  if (!specialty) {
    throw new ApiError("SPECIALTY_NOT_FOUND");
  }

  return specialty;
}

export function listSpecialties() {
  return prisma.specialty.findMany({
    where: { status: SpecialtyStatus.ACTIVE },
    select: specialtySelect,
    orderBy: { name: "asc" },
  });
}

export function listAllSpecialties() {
  return prisma.specialty.findMany({
    select: {
      id:true,code:true,name:true,description:true,status:true,deletedAt:true,
      _count:{select:{doctors:true}},
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function updateSpecialtyDoctors(specialtyId:string,input:{
  addDoctorIds:string[];removeDoctorIds:string[];
}){
  const addDoctorIds=[...new Set(input.addDoctorIds)];
  const removeDoctorIds=[...new Set(input.removeDoctorIds)];
  return prisma.$transaction(async tx=>{
    const specialty=await tx.specialty.findUnique({where:{id:specialtyId},select:{status:true,deletedAt:true}});
    if(!specialty)throw new ApiError("SPECIALTY_NOT_FOUND");
    if(addDoctorIds.length&&specialty.status!=="ACTIVE"){
      throw new ApiError("SPECIALTY_DISABLED");
    }
    const doctors=await tx.doctorProfile.count({
      where:{userID:{in:addDoctorIds},user:{role:"DOCTOR",status:"ACTIVE"}},
    });
    if(doctors!==addDoctorIds.length)throw new ApiError("DOCTOR_NOT_AVAILABLE");
    return tx.specialty.update({
      where:{id:specialtyId},
      data:{doctors:{
        connect:addDoctorIds.map(userID=>({userID})),
        disconnect:removeDoctorIds.map(userID=>({userID})),
      }},
      select:{id:true,_count:{select:{doctors:true}}},
    });
  });
}

export function getSpecialty(specialtyId: string) {
  return getSpecialtyOrThrow(specialtyId, true);
}

export async function createSpecialty(input: CreateSpecialtyInput) {
  await ensureUniqueSpecialty(input);

  return prisma.specialty.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
    },
    select: specialtySelect,
  });
}

export async function updateSpecialty(
  specialtyId: string,
  input: UpdateSpecialtyInput,
) {
  const current = await getSpecialtyOrThrow(specialtyId);

  await ensureUniqueSpecialty(
    {
      code: input.code ?? current.code,
      name: input.name ?? current.name,
    },
    specialtyId,
  );

  return prisma.specialty.update({
    where: { id: specialtyId },
    data: {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.status === SpecialtyStatus.ACTIVE
        ? { status: SpecialtyStatus.ACTIVE, deletedAt: null }
        : {}),
      ...(input.status === SpecialtyStatus.DISABLED
        ? { status: SpecialtyStatus.DISABLED, deletedAt: new Date() }
        : {}),
    },
    select: specialtySelect,
  });
}

export async function deleteSpecialty(specialtyId: string) {
  const specialty = await getSpecialtyOrThrow(specialtyId);

  if (specialty.status === SpecialtyStatus.DISABLED) {
    return specialty;
  }

  return prisma.specialty.update({
    where: { id: specialtyId },
    data: {
      status: SpecialtyStatus.DISABLED,
      deletedAt: new Date(),
    },
    select: specialtySelect,
  });
}

export async function addDoctorToSpecialty(
  specialtyId: string,
  doctorId: string,
) {
  const [specialty, doctor] = await Promise.all([
    prisma.specialty.findUnique({
      where: { id: specialtyId },
      select: {
        id: true,
        status: true,
        doctors: {
          where: { userID: doctorId },
          select: { userID: true },
        },
      },
    }),
    prisma.doctorProfile.findUnique({
      where: { userID: doctorId },
      select: { userID: true },
    }),
  ]);

  if (!specialty) {
    throw new ApiError("SPECIALTY_NOT_FOUND");
  }

  if (specialty.status === SpecialtyStatus.DISABLED) {
    throw new ApiError("SPECIALTY_DISABLED");
  }

  if (!doctor) {
    throw new ApiError("DOCTOR_NOT_FOUND");
  }

  if (specialty.doctors.length > 0) {
    throw new ApiError("DOCTOR_ALREADY_IN_SPECIALTY");
  }

  return prisma.specialty.update({
    where: { id: specialtyId },
    data: { doctors: { connect: { userID: doctorId } } },
    select: specialtySelect,
  });
}

export async function removeDoctorFromSpecialty(
  specialtyId: string,
  doctorId: string,
) {
  const specialty = await prisma.specialty.findUnique({
    where: { id: specialtyId },
    select: {
      id: true,
      doctors: {
        where: { userID: doctorId },
        select: { userID: true },
      },
    },
  });

  if (!specialty) {
    throw new ApiError("SPECIALTY_NOT_FOUND");
  }

  if (specialty.doctors.length === 0) {
    throw new ApiError("DOCTOR_NOT_IN_SPECIALTY");
  }

  return prisma.specialty.update({
    where: { id: specialtyId },
    data: { doctors: { disconnect: { userID: doctorId } } },
    select: specialtySelect,
  });
}
