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
    throw new ApiError(
      409,
      "SPECIALTY_ALREADY_EXISTS",
      "Ma hoac ten chuyen khoa da ton tai",
      duplicated,
    );
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
    throw new ApiError(404, "SPECIALTY_NOT_FOUND", "Khong tim thay chuyen khoa");
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
    select: specialtySelect,
    orderBy: [{ status: "asc" }, { name: "asc" }],
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
    throw new ApiError(404, "SPECIALTY_NOT_FOUND", "Khong tim thay chuyen khoa");
  }

  if (specialty.status === SpecialtyStatus.DISABLED) {
    throw new ApiError(
      409,
      "SPECIALTY_DISABLED",
      "Chuyen khoa da bi vo hieu hoa",
    );
  }

  if (!doctor) {
    throw new ApiError(404, "DOCTOR_NOT_FOUND", "Khong tim thay bac si");
  }

  if (specialty.doctors.length > 0) {
    throw new ApiError(
      409,
      "DOCTOR_ALREADY_IN_SPECIALTY",
      "Bac si da thuoc chuyen khoa nay",
    );
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
    throw new ApiError(404, "SPECIALTY_NOT_FOUND", "Khong tim thay chuyen khoa");
  }

  if (specialty.doctors.length === 0) {
    throw new ApiError(
      404,
      "DOCTOR_NOT_IN_SPECIALTY",
      "Bac si khong thuoc chuyen khoa nay",
    );
  }

  return prisma.specialty.update({
    where: { id: specialtyId },
    data: { doctors: { disconnect: { userID: doctorId } } },
    select: specialtySelect,
  });
}
