import bcrypt from "bcrypt";
import { ApiError } from "../../common/api-error.js";
import { config } from "../../config/env.js";
import {
  Gender,
  SpecialtyStatus,
  UserRole,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import {assertWeeklyScheduleWithinWorkday,getScheduleSettings} from "../system-settings/system-setting.service.js";
import {verifyFirebasePhoneIdToken} from "../../lib/firebase.js";
import { createTokenId, hashToken } from "../../lib/token.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";
import {
  type CreateDoctorInput,
  type LoginPatientInput,
  type LoginStaffInput,
  type LogOutInput,
  type RefreshInput,
  type RegisterPatientInput,
} from "./auth.schema.js";

const SALT_BCRYPT = 10;

type SessionUser = {
  id: string;
  role: UserRole;
  status: string;
  phone: string | null;
  email?: string | null;
  tokenVersion: number;
};

function createRefreshTokenExpiresAt() {
  return new Date(Date.now() + config.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000);
}

async function issueSession(user: SessionUser) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  const refreshTokenId = createTokenId();
  const refreshToken = signRefreshToken({
    sub: user.id,
    tokenVersion: user.tokenVersion,
    jti: refreshTokenId,
  });

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      jti: refreshTokenId,
      tokenHash: hashToken(refreshToken),
      expiresAt: createRefreshTokenExpiresAt(),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      role: user.role,
      status: user.status,
      phone: user.phone,
      email: user.email ?? null,
    },
  };
}

type PhoneTokenVerifier=(idToken:string)=>Promise<{uid:string;phone:string}>;

function isPrismaUniqueError(error:unknown){
  return typeof error==="object"&&error!==null&&"code" in error&&error.code==="P2002";
}

async function getVerifiedPhone(idToken:string,verifier:PhoneTokenVerifier){
  try{
    return await verifier(idToken);
  }catch{
    throw new ApiError("INVALID_FIREBASE_TOKEN");
  }
}

export async function registerPatient(
  input:RegisterPatientInput,
  verifier:PhoneTokenVerifier=verifyFirebasePhoneIdToken,
){
  const {phone,uid}=await getVerifiedPhone(input.firebaseIdToken,verifier);
  const existedUser=await prisma.user.findUnique({
    where:{phone},
    select:{id:true},
  });
  if(existedUser){
    throw new ApiError("PHONE_ALREADY_EXISTS");
  }
  let createdUser;
  try{
    createdUser=await prisma.user.create({
      data:{
        role:UserRole.PATIENT,
        phone,
        firebaseUid:uid,
        patientProfile:{
          create:{
            fullName:input.fullName,
            dateOfBirth:input.dateOfBirth,
            gender:input.gender??Gender.UNSPECIFIED,
          },
        },
      },
      select:{
        id:true,
        role:true,
        status:true,
        phone:true,
        email:true,
        tokenVersion:true,
      },
    });
  }catch(error){
    if(isPrismaUniqueError(error)){
      throw new ApiError("PHONE_ALREADY_EXISTS");
    }
    throw error;
  }
  return issueSession(createdUser);
}

export async function loginPatient(
  input:LoginPatientInput,
  verifier:PhoneTokenVerifier=verifyFirebasePhoneIdToken,
){
  const {phone,uid}=await getVerifiedPhone(input.firebaseIdToken,verifier);
  const user=await prisma.user.findFirst({
    where:{phone,role:UserRole.PATIENT},
    select:{
      id:true,
      role:true,
      status:true,
      phone:true,
      email:true,
      firebaseUid:true,
      tokenVersion:true,
    },
  });
  if(!user){
    throw new ApiError("PATIENT_NOT_FOUND");
  }
  if(user.status!=="ACTIVE"){
    throw new ApiError("USER_DISABLED");
  }
  if(user.firebaseUid&&user.firebaseUid!==uid){
    throw new ApiError("FIREBASE_ACCOUNT_MISMATCH");
  }
  try{
    await prisma.user.update({
      where:{id:user.id},
      data:{lastLoginAt:new Date(),...(!user.firebaseUid?{firebaseUid:uid}:{})},
    });
  }catch(error){
    if(isPrismaUniqueError(error)){
      throw new ApiError("FIREBASE_ACCOUNT_ALREADY_LINKED");
    }
    throw error;
  }
  return issueSession(user);
}

export async function loginStaff(input: LoginStaffInput) {
  const user = await prisma.user.findFirst({
    where: {
      email: input.email,
      role: { in: [UserRole.ADMIN, UserRole.DOCTOR] },
    },
    select: {
      id: true,
      role: true,
      status: true,
      phone: true,
      email: true,
      passwordHash: true,
      tokenVersion: true,
    },
  });

  if (!user || !user.passwordHash) {
    throw new ApiError("INVALID_CREDENTIALS");
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new ApiError("INVALID_CREDENTIALS");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError("USER_DISABLED");
  }

  return issueSession(user);
}

export async function createDoctor(input: CreateDoctorInput) {
  assertWeeklyScheduleWithinWorkday(input.weeklySchedule,await getScheduleSettings());
  const existedUser = await prisma.user.findFirst({
    where: { email: input.email },
    select: { id: true },
  });

  if (existedUser) {
    throw new ApiError("EMAIL_ALREADY_EXISTS");
  }

  const specialtyIds = [...new Set(input.specialtyIds)];
  const specialties = await prisma.specialty.findMany({
    where: {
      id: { in: specialtyIds },
      status: SpecialtyStatus.ACTIVE,
    },
    select: { id: true },
  });

  if (specialties.length !== specialtyIds.length) {
    const existingIds = new Set(specialties.map((specialty) => specialty.id));
    const missingIds = specialtyIds.filter((id) => !existingIds.has(id));
    throw new ApiError("SPECIALTY_NOT_AVAILABLE", { missingIds });
  }

  const passwordHash = await bcrypt.hash(config.defaultDoctorPassword, SALT_BCRYPT);

  return prisma.user.create({
    data: {
      role: UserRole.DOCTOR,
      email: input.email,
      passwordHash,
      doctorProfile: {
        create: {
          fullName: input.fullName,
          yearsOfExperience: input.yearsOfExperience,
          qualifications: input.qualifications,
          avatarUrl: input.avatarUrl,
          bio: input.bio,
          weeklySchedule: input.weeklySchedule,
          specialties: {
            connect: specialtyIds.map((id) => ({ id })),
          },
        },
      },
    },
    select: {
      id: true,
      role: true,
      status: true,
      email: true,
      createdAt: true,
      doctorProfile: {
        select: {
          fullName: true,
          yearsOfExperience: true,
          qualifications: true,
          avatarUrl: true,
          bio: true,
          weeklySchedule: true,
          specialties: {
            where: { status: SpecialtyStatus.ACTIVE },
            select: {
              id: true,
              code: true,
              name: true,
            },
            orderBy: { name: "asc" },
          },
        },
      },
    },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      phone: true,
      email: true,
      createdAt: true,
      patientProfile: {
        select: {
          fullName: true,
          dateOfBirth: true,
          gender: true,
          address: true,
          medicalHistory: true,
          drugAllergies: true,
          avatar:true,
        },
      },
      doctorProfile: {
        select: {
          fullName: true,
          yearsOfExperience: true,
          qualifications: true,
          avatarUrl: true,
          bio: true,
          weeklySchedule: true,
          specialties: {
            where: { status: SpecialtyStatus.ACTIVE },
            select: {
              id: true,
              code: true,
              name: true,
            },
            orderBy: { name: "asc" },
          },
        },
      },
    },
  });

  if (!user) {
    throw new ApiError("USER_NOT_FOUND");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError("USER_DISABLED");
  }

  return user;
}

export async function refresh(input: RefreshInput) {
  const payload = verifyRefreshToken(input.refreshToken);
  const storedToken = await prisma.refreshToken.findUnique({
    where: { jti: payload.jti },
  });

  const tokenHash = hashToken(input.refreshToken);
  if (!storedToken || storedToken.revokedAt || storedToken.replacedByID || storedToken.tokenHash !== tokenHash) {
    throw new ApiError("INVALID_REFRESH_TOKEN");
  }

  if (storedToken.expiresAt < new Date()) {
    throw new ApiError("REFRESH_TOKEN_EXPIRED");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      status: true,
      tokenVersion: true,
      role: true,
      id: true,
      phone: true,
      email: true,
    },
  });

  if (!user || user.status !== "ACTIVE" || user.tokenVersion !== payload.tokenVersion) {
    throw new ApiError("INVALID_REFRESH_TOKEN");
  }

  const newRefreshTokenId = createTokenId();
  const newRefreshToken = signRefreshToken({
    sub: user.id,
    tokenVersion: user.tokenVersion,
    jti: newRefreshTokenId,
  });

  await prisma.$transaction(async (tx) => {
    const createdRefreshToken = await tx.refreshToken.create({
      data: {
        userId: user.id,
        jti: newRefreshTokenId,
        tokenHash: hashToken(newRefreshToken),
        expiresAt: createRefreshTokenExpiresAt(),
      },
      select: { id: true },
    });

    await tx.refreshToken.update({
      where: { jti: payload.jti },
      data: {
        replacedByID: createdRefreshToken.id,
        revokedAt: new Date(),
      },
    });
  });

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logout(input: LogOutInput) {
  const payload = verifyRefreshToken(input.refreshToken);
  const storedToken = await prisma.refreshToken.findUnique({
    where: { jti: payload.jti },
  });

  const tokenHash = hashToken(input.refreshToken);
  if (!storedToken || storedToken.revokedAt || storedToken.replacedByID || storedToken.tokenHash !== tokenHash) {
    throw new ApiError("INVALID_REFRESH_TOKEN");
  }

  if (storedToken.expiresAt < new Date()) {
    throw new ApiError("REFRESH_TOKEN_EXPIRED");
  }

  await prisma.refreshToken.updateMany({
    where: { jti: payload.jti },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string) {
  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ]);
}
