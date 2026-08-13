import bcrypt from "bcrypt";
import { ApiError } from "../../common/api-error.js";
import { config } from "../../config/env.js";
import { Gender, UserRole } from "../../../generated/prisma/enums.js";
import { createOtpCode, createOtpExpiresAt, hashOtp } from "../../lib/otp.js";
import { prisma } from "../../lib/prisma.js";
// import { sendSms } from "../../lib/speedsms.js";
import { createTokenId, hashToken } from "../../lib/token.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";
import {
  registerOtpPayloadSchema,
  type CreateDoctorInput,
  type LoginPatientInput,
  type LoginStaffInput,
  type LogOutInput,
  type RefreshInput,
  type RequestPatientLoginOtpInput,
  type RequestRegisterOtpInput,
  type VerifyRegisterOtpInput,
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

async function upsertOtp(params: {
  phone: string;
  purpose: "REGISTER" | "LOGIN";
  content: string;
  payloadJson?: unknown;
}) {
  const otpCode = createOtpCode();

  await prisma.otpCode.upsert({
    where: { phoneNumber: params.phone },
    update: {
      purpose: params.purpose,
      codeHash: hashOtp(otpCode),
      expiresAt: createOtpExpiresAt(),
      attempts: 0,
      consumedAt: null,
      payloadJson: params.payloadJson ?? {},
    },
    create: {
      phoneNumber: params.phone,
      purpose: params.purpose,
      codeHash: hashOtp(otpCode),
      expiresAt: createOtpExpiresAt(),
      payloadJson: params.payloadJson ?? {},
    },
  });

  console.info(`[OTP:${params.purpose}] phone=${params.phone} otp=${otpCode}`);
  // await sendSms(params.phone, params.content.replace("{{otp}}", otpCode));
}

async function verifyOtpOrThrow(phone: string, otpCode: string, purpose: "REGISTER" | "LOGIN") {
  const otp = await prisma.otpCode.findUnique({
    where: { phoneNumber: phone },
    select: {
      purpose: true,
      payloadJson: true,
      codeHash: true,
      consumedAt: true,
      expiresAt: true,
      attempts: true,
    },
  });

  if (!otp || otp.purpose !== purpose) {
    throw new ApiError(400, "OTP_NOT_FOUND", "Khong tim thay OTP hop le");
  }

  if (otp.consumedAt) {
    throw new ApiError(400, "OTP_ALREADY_USED", "OTP da duoc su dung");
  }

  if (otp.expiresAt < new Date()) {
    throw new ApiError(400, "OTP_EXPIRED", "OTP da het han");
  }

  if (otp.attempts >= config.otp.maxAttempts) {
    throw new ApiError(429, "OTP_MAX_ATTEMPTS", "Da vuot qua so lan sai cho phep");
  }

  if (hashOtp(otpCode) !== otp.codeHash) {
    await prisma.otpCode.updateMany({
      where: { phoneNumber: phone },
      data: { attempts: { increment: 1 } },
    });
    throw new ApiError(400, "INVALID_OTP", "OTP khong hop le");
  }

  return otp;
}

export async function requestRegisterOtp(input: RequestRegisterOtpInput) {
  const existedUser = await prisma.user.findFirst({
    where: { phone: input.phone },
    select: { id: true },
  });

  if (existedUser) {
    throw new ApiError(409, "PHONE_ALREADY_EXISTS", "So dien thoai da ton tai");
  }

  await upsertOtp({
    phone: input.phone,
    purpose: "REGISTER",
    payloadJson: input,
    content: `Ma OTP dang ky TeleMedicine: {{otp}}, OTP co hieu luc trong vong ${config.otp.expiresMinutes} phut`,
  });
}

export async function verifyRegisterOtp(input: VerifyRegisterOtpInput) {
  const existedUser = await prisma.user.findUnique({
    where: { phone: input.phone },
    select: { id: true },
  });

  if (existedUser) {
    throw new ApiError(409, "PHONE_ALREADY_EXISTS", "So dien thoai da ton tai");
  }

  const otp = await verifyOtpOrThrow(input.phone, input.otp, "REGISTER");
  const payload = registerOtpPayloadSchema.parse(otp.payloadJson);

  return prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        role: UserRole.PATIENT,
        phone: payload.phone,
        patientProfile: {
          create: {
            fullName: payload.fullName,
            dateOfBirth: payload.dateOfBirth,
            gender: payload.gender ?? Gender.UNSPECIFIED,
          },
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
        phone: true,
        createdAt: true,
        patientProfile: {
          select: {
            fullName: true,
            dateOfBirth: true,
            gender: true,
          },
        },
      },
    });

    await tx.otpCode.updateMany({
      where: { phoneNumber: input.phone },
      data: { consumedAt: new Date() },
    });

    return createdUser;
  });
}

export async function requestPatientLoginOtp(input: RequestPatientLoginOtpInput) {
  const user = await prisma.user.findFirst({
    where: {
      phone: input.phone,
      role: UserRole.PATIENT,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!user) {
    throw new ApiError(404, "PATIENT_NOT_FOUND", "Khong tim thay tai khoan benh nhan");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "USER_DISABLED", "Tai khoan da bi khoa");
  }

  await upsertOtp({
    phone: input.phone,
    purpose: "LOGIN",
    content: `Ma OTP dang nhap TeleMedicine: {{otp}}, OTP co hieu luc trong vong ${config.otp.expiresMinutes} phut`,
  });
}

export async function loginPatient(input: LoginPatientInput) {
  await verifyOtpOrThrow(input.phone, input.otp, "LOGIN");

  const user = await prisma.user.findFirst({
    where: {
      phone: input.phone,
      role: UserRole.PATIENT,
    },
    select: {
      id: true,
      role: true,
      status: true,
      phone: true,
      email: true,
      tokenVersion: true,
    },
  });

  if (!user) {
    throw new ApiError(404, "PATIENT_NOT_FOUND", "Khong tim thay tai khoan benh nhan");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "USER_DISABLED", "Tai khoan da bi khoa");
  }

  const result = await issueSession(user);

  await prisma.otpCode.updateMany({
    where: { phoneNumber: input.phone },
    data: { consumedAt: new Date() },
  });

  return result;
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
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email hoac mat khau khong dung");
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email hoac mat khau khong dung");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "USER_DISABLED", "Tai khoan da bi khoa");
  }

  return issueSession(user);
}

export async function createDoctor(input: CreateDoctorInput) {
  const existedUser = await prisma.user.findFirst({
    where: { email: input.email },
    select: { id: true },
  });

  if (existedUser) {
    throw new ApiError(409, "EMAIL_ALREADY_EXISTS", "Email da ton tai");
  }

  const passwordHash = await bcrypt.hash(config.defaultDoctorPassword, SALT_BCRYPT);

  return prisma.user.create({
    data: {
      role: UserRole.DOCTOR,
      email: input.email,
      passwordHash,
    },
    select: {
      id: true,
      role: true,
      status: true,
      email: true,
      createdAt: true,
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
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "Khong tim thay tai khoan");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "USER_DISABLED", "Nguoi dung da bi vo hieu hoa");
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
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token khong hop le");
  }

  if (storedToken.expiresAt < new Date()) {
    throw new ApiError(401, "REFRESH_TOKEN_EXPIRED", "Refresh token da het han");
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
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token khong con hop le");
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
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token khong hop le");
  }

  if (storedToken.expiresAt < new Date()) {
    throw new ApiError(401, "REFRESH_TOKEN_EXPIRED", "Refresh token da het han");
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
