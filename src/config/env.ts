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
    APPOINTMENT_SLOT_DURATION_MINUTES:z.coerce.number().int().positive().default(30),
    APP_TIMEZONE:z.string().min(1).default("Asia/Ho_Chi_Minh"),
    APPOINTMENT_HOLD_MINUTES: z.coerce.number().int().positive().min(1).default(15),
    APPOINTMENT_CANCEL_BEFORE_MINUTES:z.coerce.number().int().positive().min(1).default(30),
    APPOINTMENT_AVAILABILITY_DAYS:z.coerce.number().int().positive().min(1).default(7),
    APPOINTMENT_MEETING_JOIN_BEFORE_MINUTES: z.coerce.number().int().positive().min(1).default(15),
    APPOINTMENT_NO_SHOW_AFTER_MINUTES: z.coerce.number().int().positive().min(1).default(30),
    GOOGLE_MEET_ENABLED: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REFRESH_TOKEN: z.string().optional(),
    FIREBASE_PUSH_ENABLED: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
    FIREBASE_PHONE_AUTH_ENABLED:z
        .enum(["true","false"])
        .default("false")
        .transform((value)=>value==="true"),
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
    EMAIL_ENABLED:z
        .enum(["true","false"])
        .default("false")
        .transform((value)=>value==="true"),
    SMTP_HOST:z.string().optional(),
    SMTP_PORT:z.coerce.number().int().positive().default(587),
    SMTP_SECURE:z
        .enum(["true","false"])
        .default("false")
        .transform((value)=>value==="true"),
    SMTP_USER:z.string().optional(),
    SMTP_PASSWORD:z.string().optional(),
    EMAIL_FROM:z.string().optional(),
    CLOUDINARY_CLOUD_NAME:z.string().optional(),
    CLOUDINARY_API_KEY:z.string().optional(),
    CLOUDINARY_API_SECRET:z.string().optional(),
    DOCTOR_PASSWORD_OTP_EXPIRES_MINUTES:z.coerce.number().int().positive().default(10),
    DOCTOR_PASSWORD_OTP_MAX_ATTEMPTS:z.coerce.number().int().positive().default(5),
    DOCTOR_PASSWORD_OTP_RESEND_SECONDS:z.coerce.number().int().positive().default(60),
    NOTIFICATION_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(50),
    NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    NOTIFICATION_RETRY_MINUTES: z.coerce.number().int().positive().default(5),
    NOTIFICATION_PROCESSING_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),
    NOTIFICATION_MAX_AGE_HOURS: z.coerce.number().int().positive().default(24),
}).superRefine((env, ctx) => {
    if (env.GOOGLE_MEET_ENABLED) {
        for (const key of [
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_REFRESH_TOKEN",
        ] as const) {
            if (!env[key]) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: `${key} is required when GOOGLE_MEET_ENABLED=true`,
                });
            }
        }
    }

    if (env.FIREBASE_PUSH_ENABLED||env.FIREBASE_PHONE_AUTH_ENABLED) {
        for (const key of [
            "FIREBASE_PROJECT_ID",
            "FIREBASE_CLIENT_EMAIL",
            "FIREBASE_PRIVATE_KEY",
        ] as const) {
            if (!env[key]) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: `${key} is required when Firebase is enabled`,
                });
            }
        }
    }

    if(env.EMAIL_ENABLED){
        for(const key of ["SMTP_HOST","SMTP_USER","SMTP_PASSWORD","EMAIL_FROM"] as const){
            if(!env[key]){
                ctx.addIssue({
                    code:"custom",
                    path:[key],
                    message:`${key} is required when EMAIL_ENABLED=true`,
                });
            }
        }
    }
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
    
    schedule:{
        slotDurationMinutes:parsedEnv.data.APPOINTMENT_SLOT_DURATION_MINUTES,
        timezone:parsedEnv.data.APP_TIMEZONE,
        appointmentHoldMinutes:parsedEnv.data.APPOINTMENT_HOLD_MINUTES,
        appointmentCancelBeforeMinutes:parsedEnv.data.APPOINTMENT_CANCEL_BEFORE_MINUTES,
        appointmentAvailabilityDays:parsedEnv.data.APPOINTMENT_AVAILABILITY_DAYS,
        meetingJoinBeforeMinutes:parsedEnv.data.APPOINTMENT_MEETING_JOIN_BEFORE_MINUTES,
        noShowAfterMinutes:parsedEnv.data.APPOINTMENT_NO_SHOW_AFTER_MINUTES,
    },

    googleMeet: {
        enabled: parsedEnv.data.GOOGLE_MEET_ENABLED,
        clientId: parsedEnv.data.GOOGLE_CLIENT_ID,
        clientSecret: parsedEnv.data.GOOGLE_CLIENT_SECRET,
        refreshToken: parsedEnv.data.GOOGLE_REFRESH_TOKEN,
    },

    firebase: {
        pushEnabled: parsedEnv.data.FIREBASE_PUSH_ENABLED,
        phoneAuthEnabled:parsedEnv.data.FIREBASE_PHONE_AUTH_ENABLED,
        projectId: parsedEnv.data.FIREBASE_PROJECT_ID,
        clientEmail: parsedEnv.data.FIREBASE_CLIENT_EMAIL,
        privateKey: parsedEnv.data.FIREBASE_PRIVATE_KEY,
    },

    email:{
        enabled:parsedEnv.data.EMAIL_ENABLED,
        host:parsedEnv.data.SMTP_HOST,
        port:parsedEnv.data.SMTP_PORT,
        secure:parsedEnv.data.SMTP_SECURE,
        user:parsedEnv.data.SMTP_USER,
        password:parsedEnv.data.SMTP_PASSWORD,
        from:parsedEnv.data.EMAIL_FROM,
    },

    cloudinary:{
        cloudName:parsedEnv.data.CLOUDINARY_CLOUD_NAME,
        apiKey:parsedEnv.data.CLOUDINARY_API_KEY,
        apiSecret:parsedEnv.data.CLOUDINARY_API_SECRET,
    },

    doctorPasswordOtp:{
        expiresMinutes:parsedEnv.data.DOCTOR_PASSWORD_OTP_EXPIRES_MINUTES,
        maxAttempts:parsedEnv.data.DOCTOR_PASSWORD_OTP_MAX_ATTEMPTS,
        resendSeconds:parsedEnv.data.DOCTOR_PASSWORD_OTP_RESEND_SECONDS,
    },

    notification: {
        batchSize: parsedEnv.data.NOTIFICATION_BATCH_SIZE,
        maxAttempts: parsedEnv.data.NOTIFICATION_MAX_ATTEMPTS,
        retryMinutes: parsedEnv.data.NOTIFICATION_RETRY_MINUTES,
        processingTimeoutMinutes:
            parsedEnv.data.NOTIFICATION_PROCESSING_TIMEOUT_MINUTES,
        maxAgeHours: parsedEnv.data.NOTIFICATION_MAX_AGE_HOURS,
    },
}

export type Config=typeof config;

