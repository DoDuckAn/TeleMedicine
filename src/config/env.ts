import "dotenv/config"; 
import {z} from "zod";

const envSchema=z.object({
    NODE_ENV: z
        .enum(["development","test","production"])
        .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),

    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),

    JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),

    JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
    JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),
    DEFAULT_DOCTOR_PASSWORD: z.string().min(1, "DEFAULT_DOCTOR_PASSWORD is required"),
    SPEEDSMS_ACCESS_TOKEN: z.string().min(1, "SPEEDSMS_ACCESS_TOKEN is required"),
    SPEEDSMS_SMS_TYPE:z.coerce.number().int().positive().default(4),
    SPEEDSMS_SENDER:z.string().default("Verify"),
    OTP_EXPIRES_MINUTES:z.coerce.number().int().positive().default(2),
    OTP_MAX_ATTEMPTS:z.coerce.number().int().positive().default(3),
    APPOINTMENT_SLOT_DURATION_MINUTES:z.coerce.number().int().positive().default(30),
    APP_TIMEZONE:z.string().min(1).default("Asia/Ho_Chi_Minh"),
    APPOINTMENT_HOLD_MINUTES: z.coerce.number().int().positive().min(1).default(15),
    APPOINTMENT_CANCEL_BEFORE_MINUTES:z.coerce.number().int().positive().min(1).default(30),
    APPOINTMENT_AVAILABILITY_DAYS:z.coerce.number().int().positive().min(1).default(7),
});

const parsedEnv=envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error("Invalid environment variables:");
    console.error(parsedEnv.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
}

export const config={
    env:parsedEnv.data.NODE_ENV,
    
    port:parsedEnv.data.PORT,

    jwt:{
        accessSecret:parsedEnv.data.JWT_ACCESS_SECRET,
        accessExpiresIn:parsedEnv.data.JWT_ACCESS_EXPIRES_IN,
        refreshSecret:parsedEnv.data.JWT_REFRESH_SECRET,
        refreshExpiresIn:parsedEnv.data.JWT_REFRESH_EXPIRES_IN,
        refreshExpiresDays:parsedEnv.data.JWT_REFRESH_EXPIRES_DAYS,
    },

    databaseUrl:parsedEnv.data.DATABASE_URL,

    defaultDoctorPassword:parsedEnv.data.DEFAULT_DOCTOR_PASSWORD,
    
    speedsms:{
        accessToken:parsedEnv.data.SPEEDSMS_ACCESS_TOKEN,
        smsType:parsedEnv.data.SPEEDSMS_SMS_TYPE,
        sender:parsedEnv.data.SPEEDSMS_SENDER,
    },

    otp:{
        expiresMinutes:parsedEnv.data.OTP_EXPIRES_MINUTES,
        maxAttempts:parsedEnv.data.OTP_MAX_ATTEMPTS,
    },

    schedule:{
        slotDurationMinutes:parsedEnv.data.APPOINTMENT_SLOT_DURATION_MINUTES,
        timezone:parsedEnv.data.APP_TIMEZONE,
        appointmentHoldMinutes:parsedEnv.data.APPOINTMENT_HOLD_MINUTES,
        appointmentCancelBeforeMinutes:parsedEnv.data.APPOINTMENT_CANCEL_BEFORE_MINUTES,
        appointmentAvailabilityDays:parsedEnv.data.APPOINTMENT_AVAILABILITY_DAYS,
    },
}

export type Config=typeof config;

