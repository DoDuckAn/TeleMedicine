import {
  AppointmentActor,
  AppointmentNotificationType,
  AppointmentStatus,
  NotificationDeliveryStatus,
  type UserRole,
  UserStatus,
} from "../../../generated/prisma/enums.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { ApiError } from "../../common/api-error.js";
import { config } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import {
  closeGoogleMeetSpace,
  createGoogleMeetSpace,
  limitGoogleMeetSpaceAccess,
} from "../../lib/google-meet.js";
import { applyPatientMeetingUrlPolicy } from "./appointment-meeting.js";
import { isInUpcomingDays } from "./appointment-time.js";
import type {
  AdminAppointmentListQuery,
  AppointmentHistoryQuery,
  checkOverlapAppointmentInput,
  CreateAppointmentInput,
  DoctorAppointmentListQuery,
} from "./appointment.schema.js";
import { checkSlotAvailable } from "./availability.service.js";
import { createAppointmentEvents } from "./appointment.notification.js";

const doctorAppointmentListSelect = {
    id: true,
    startAt: true,
    endAt: true,
    visitReason: true,
    status: true,
    confirmationDueAt: true,
    respondedAt: true,
    meetingUrl: true,
    createdAt: true,
    patient: {
        select: {
            userID: true,
            fullName: true,
            dateOfBirth: true,
            gender: true,
            avatar: true,
        },
    },
} as const;

const appointmentHistorySelect = {
    id: true,
    doctorID: true,
    patientID: true,
    startAt: true,
    endAt: true,
    visitReason: true,
    status: true,
    confirmationDueAt: true,
    rejectionReason: true,
    cancellationReason: true,
    cancelledBy: true,
    respondedAt: true,
    cancelledAt: true,
    completedAt: true,
    noShowAt: true,
    meetingUrl: true,
    createdAt: true,
    updatedAt: true,
    doctor: {
        select: {
            userID: true,
            fullName: true,
            avatarUrl: true,
        },
    },
    patient: {
        select: {
            userID: true,
            fullName: true,
            dateOfBirth: true,
            gender: true,
            avatar: true,
        },
    },
    slotReservation: {
        select: {
            id: true,
            doctorID: true,
            patientID: true,
            startAt: true,
            endAt: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
        },
    },
} as const;

function getAppointmentActor(role: UserRole) {
    switch (role) {
        case "PATIENT":
            return AppointmentActor.PATIENT;
        case "DOCTOR":
            return AppointmentActor.DOCTOR;
        case "ADMIN":
            return AppointmentActor.ADMIN;
    }
}

async function listDoctorAppointments(
    doctorId: string,
    query: DoctorAppointmentListQuery,
    where: Prisma.AppointmentWhereInput,
    orderBy: Prisma.AppointmentOrderByWithRelationInput,
) {
    const skip = (query.page - 1) * query.limit;
    const scopedWhere: Prisma.AppointmentWhereInput = {
        doctorID: doctorId,
        ...where,
    };
    const items=await prisma.appointment.findMany({
            where: scopedWhere,
            select: doctorAppointmentListSelect,
            orderBy,
            skip,
            take: query.limit,
    });
    const total=await prisma.appointment.count({where:scopedWhere});

    return {
        items,
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
        },
    };
}

export function getDoctorPendingAppointments(
    doctorId: string,
    query: DoctorAppointmentListQuery,
) {
    const now = new Date();
    return listDoctorAppointments(
        doctorId,
        query,
        {
            status: AppointmentStatus.PENDING_CONFIRMATION,
            confirmationDueAt: { gt: now },
            startAt: { gt: now },
        },
        { confirmationDueAt: "asc" },
    );
}

export function getDoctorUpcomingAppointments(
    doctorId: string,
    query: DoctorAppointmentListQuery,
) {
    return listDoctorAppointments(
        doctorId,
        query,
        {
            status: AppointmentStatus.CONFIRMED,
            endAt: { gt: new Date() },
        },
        { startAt: "asc" },
    );
}

export async function getPatientUpcomingAppointments(
    patientId: string,
    query: DoctorAppointmentListQuery,
) {
    const now = new Date();
    const where: Prisma.AppointmentWhereInput = {
        patientID: patientId,
        OR: [
            {
                status: AppointmentStatus.PENDING_CONFIRMATION,
                confirmationDueAt: { gt: now },
                startAt: { gt: now },
            },
            {
                status: AppointmentStatus.CONFIRMED,
                endAt: { gt: now },
            },
        ],
    };
    const skip = (query.page - 1) * query.limit;
    const items=await prisma.appointment.findMany({
            where,
            select: appointmentHistorySelect,
            orderBy: [{ startAt: "asc" }, { id: "asc" }],
            skip,
            take: query.limit,
    });
    const total=await prisma.appointment.count({where});

    return {
        items: items.map((item) => applyPatientMeetingUrlPolicy(item, now)),
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
        },
    };
}

function createAppointmentHistoryWhere(
    query: AppointmentHistoryQuery | AdminAppointmentListQuery,
) {
    const startAt =
        query.from || query.to
            ? {
                  ...(query.from ? { gte: query.from } : {}),
                  ...(query.to ? { lte: query.to } : {}),
              }
            : undefined;

    return {
        ...(query.status ? { status: query.status } : {}),
        ...(startAt ? { startAt } : {}),
    } satisfies Prisma.AppointmentWhereInput;
}

async function listAppointmentHistory(
    where: Prisma.AppointmentWhereInput,
    query: AppointmentHistoryQuery | AdminAppointmentListQuery,
    applyPatientMeetingPolicy = false,
) {
    const skip = (query.page - 1) * query.limit;
    const items=await prisma.appointment.findMany({
            where,
            select: appointmentHistorySelect,
            orderBy: [
                { startAt: query.order },
                { id: query.order },
            ],
            skip,
            take: query.limit,
    });
    const total=await prisma.appointment.count({where});

    const responseItems = applyPatientMeetingPolicy
        ? items.map((item) => applyPatientMeetingUrlPolicy(item))
        : items;

    return {
        items: responseItems,
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
        },
    };
}

export function getOwnAppointmentHistory(
    currentUser: { id: string; role: UserRole },
    query: AppointmentHistoryQuery,
) {
    const ownerWhere: Prisma.AppointmentWhereInput =
        currentUser.role === "PATIENT"
            ? { patientID: currentUser.id }
            : { doctorID: currentUser.id };

    return listAppointmentHistory(
        {
            ...ownerWhere,
            ...createAppointmentHistoryWhere(query),
        },
        query,
        currentUser.role === "PATIENT",
    );
}

export function getAllAppointments(query: AdminAppointmentListQuery) {
    return listAppointmentHistory(
        {
            ...createAppointmentHistoryWhere(query),
            ...(query.patientId ? { patientID: query.patientId } : {}),
            ...(query.doctorId ? { doctorID: query.doctorId } : {}),
        },
        query,
    );
}

export async function getPatientMedicalHistory(
    patientId:string,
    query:AppointmentHistoryQuery,
){
    const now=new Date();
    const baseWhere=createAppointmentHistoryWhere(query);
    const where:Prisma.AppointmentWhereInput={
        ...baseWhere,
        patientID:patientId,
        endAt:{lte:now},
    };
    const skip=(query.page-1)*query.limit;
    const [items,total]=await prisma.$transaction([
        prisma.appointment.findMany({
            where,
            select:{
                id:true,
                startAt:true,
                endAt:true,
                visitReason:true,
                status:true,
                rejectionReason:true,
                cancellationReason:true,
                completedAt:true,
                doctor:{select:{
                    userID:true,
                    fullName:true,
                    avatarUrl:true,
                    specialties:{select:{id:true,code:true,name:true}},
                }},
            },
            orderBy:[{startAt:query.order},{id:query.order}],
            skip,
            take:query.limit,
        }),
        prisma.appointment.count({where}),
    ]);
    const doctorIds=[...new Set(items.map((item)=>item.doctor.userID))];
    const reviews=doctorIds.length===0?[]:await prisma.doctorReview.findMany({
        where:{patientID:patientId,doctorID:{in:doctorIds}},
        select:{
            id:true,
            doctorID:true,
            rating:true,
            comment:true,
            doctorReply:true,
            repliedAt:true,
            status:true,
            createdAt:true,
        },
    });
    const reviewByDoctor=new Map(reviews.map((review)=>[review.doctorID,review]));
    return {
        items:items.map((item)=>({
            ...item,
            doctorReview:reviewByDoctor.get(item.doctor.userID)??null,
        })),
        pagination:{
            page:query.page,
            limit:query.limit,
            total,
            totalPages:Math.ceil(total/query.limit),
        },
    };
}

export async function getDoctorConsultationHistory(
    doctorId:string,
    query:AppointmentHistoryQuery,
){
    const dateWhere=createAppointmentHistoryWhere(query).startAt;
    const where:Prisma.AppointmentWhereInput={
        doctorID:doctorId,
        status:AppointmentStatus.COMPLETED,
        ...(dateWhere?{startAt:dateWhere}:{}),
    };
    const skip=(query.page-1)*query.limit;
    const [items,total]=await prisma.$transaction([
        prisma.appointment.findMany({
            where,
            select:{
                id:true,
                startAt:true,
                endAt:true,
                completedAt:true,
                visitReason:true,
                status:true,
                patient:{select:{
                    userID:true,
                    fullName:true,
                    dateOfBirth:true,
                    gender:true,
                    avatar:true,
                }},
            },
            orderBy:[{startAt:query.order},{id:query.order}],
            skip,
            take:query.limit,
        }),
        prisma.appointment.count({where}),
    ]);
    const patientIds=[...new Set(items.map((item)=>item.patient.userID))];
    const reviews=patientIds.length===0?[]:await prisma.doctorReview.findMany({
        where:{doctorID:doctorId,patientID:{in:patientIds}},
        select:{
            id:true,
            patientID:true,
            rating:true,
            comment:true,
            doctorReply:true,
            repliedAt:true,
            status:true,
            createdAt:true,
        },
    });
    const reviewByPatient=new Map(reviews.map((review)=>[review.patientID,review]));
    return {
        items:items.map((item)=>({
            ...item,
            scheduledDurationMinutes:Math.round(
                (item.endAt.getTime()-item.startAt.getTime())/60000,
            ),
            actualDurationMinutes:item.completedAt
                ?Math.max(0,Math.round(
                    (item.completedAt.getTime()-item.startAt.getTime())/60000,
                ))
                :null,
            reviewReceived:reviewByPatient.get(item.patient.userID)??null,
        })),
        pagination:{
            page:query.page,
            limit:query.limit,
            total,
            totalPages:Math.ceil(total/query.limit),
        },
    };
}

export async function getAppointmentDetail(
    currentUser: { id: string; role: UserRole },
    appointmentId: string,
) {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            doctorID: true,
            patientID: true,
            startAt: true,
            endAt: true,
            visitReason: true,
            status: true,
            confirmationDueAt: true,
            rejectionReason: true,
            cancellationReason: true,
            cancelledBy: true,
            respondedAt: true,
            cancelledAt: true,
            completedAt: true,
            noShowAt: true,
            meetingUrl: true,
            createdAt: true,
            updatedAt: true,
            doctor: {
                select: {
                    userID: true,
                    fullName: true,
                    yearsOfExperience: true,
                    qualifications: true,
                    avatarUrl: true,
                    bio: true,
                    specialties: {
                        select: {
                            id: true,
                            code: true,
                            name: true,
                        },
                        orderBy: { name: "asc" },
                    },
                },
            },
            patient: {
                select: {
                    userID: true,
                    fullName: true,
                    dateOfBirth: true,
                    gender: true,
                    address: true,
                    medicalHistory: true,
                    drugAllergies: true,
                    avatar: true,
                    user: {select: {email: true,phone: true}},
                },
            },
            statusHistory: {
                select: {
                    id: true,
                    fromStatus: true,
                    toStatus: true,
                    actor: true,
                    note: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "asc" },
            },
        },
    });

    if (!appointment) {
        throw new ApiError(
            404,
            "APPOINTMENT_NOT_FOUND",
            "Khong tim thay lich hen",
        );
    }

    const isOwner =
        currentUser.role === "ADMIN" ||
        appointment.doctorID === currentUser.id ||
        appointment.patientID === currentUser.id;

    if (!isOwner) {
        throw new ApiError(
            403,
            "APPOINTMENT_FORBIDDEN",
            "Khong co quyen xem lich hen nay",
        );
    }

    const {user:patientUser,...patientProfile}=appointment.patient;
    const detail={
        ...appointment,
        patient:{...patientProfile,email:patientUser.email,phone:patientUser.phone},
    };
    return currentUser.role === "PATIENT"
        ? applyPatientMeetingUrlPolicy(detail)
        : detail;
}

export async function confirmAppointment(
    doctorId: string,
    appointmentId: string,
) {
    const existingAppointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            doctorID: true,
            status: true,
            confirmationDueAt: true,
            startAt: true,
        },
    });

    if (!existingAppointment) {
        throw new ApiError(
            404,
            "APPOINTMENT_NOT_FOUND",
            "Khong tim thay lich hen",
        );
    }

    if (existingAppointment.doctorID !== doctorId) {
        throw new ApiError(
            403,
            "APPOINTMENT_FORBIDDEN",
            "Khong co quyen xac nhan lich hen nay",
        );
    }

    const now = new Date();

    if (
        existingAppointment.status !== AppointmentStatus.PENDING_CONFIRMATION ||
        existingAppointment.confirmationDueAt <= now ||
        existingAppointment.startAt <= now
    ) {
        throw new ApiError(
            409,
            "APPOINTMENT_NOT_CONFIRMABLE",
            "Lich hen khong con co the xac nhan",
        );
    }

    const meetingSpace = await createGoogleMeetSpace();

    try {
        return await prisma.$transaction(async (tx) => {
        const updated = await tx.appointment.updateMany({
            where: {
                id: appointmentId,
                doctorID: doctorId,
                status: AppointmentStatus.PENDING_CONFIRMATION,
                confirmationDueAt: { gt: now },
                startAt: { gt: now },
            },
            data: {
                status: AppointmentStatus.CONFIRMED,
                respondedAt: now,
                meetingUrl: meetingSpace.meetingUrl,
                meetingSpaceName: meetingSpace.name,
                meetingCreatedAt: now,
            },
        });

        if (updated.count !== 1) {
            throw new ApiError(
                409,
                "APPOINTMENT_NOT_CONFIRMABLE",
                "Lich hen khong con co the xac nhan",
            );
        }

        const lockedReservation =
            await tx.appointmentSlotReservation.updateMany({
                where: {
                    appointmentID: appointmentId,
                    expiresAt: { gt: now },
                },
                data: { expiresAt: null },
            });

        if (lockedReservation.count !== 1) {
            throw new ApiError(
                409,
                "APPOINTMENT_NOT_CONFIRMABLE",
                "Khung gio giu cho lich hen khong con hieu luc",
            );
        }

        const appointment = await tx.appointment.findUniqueOrThrow({
            where: { id: appointmentId },
        });

        await tx.appointmentStatusHistory.create({
            data: {
                appointmentID: appointmentId,
                changedByID: doctorId,
                fromStatus: AppointmentStatus.PENDING_CONFIRMATION,
                toStatus: AppointmentStatus.CONFIRMED,
                actor: AppointmentActor.DOCTOR,
            },
        });

        await tx.appointmentNotification.updateMany({
            where: {
                appointmentID: appointmentId,
                status: NotificationDeliveryStatus.PENDING,
                type: AppointmentNotificationType.REQUEST_CREATED,
            },
            data: { status: NotificationDeliveryStatus.CANCELLED },
        });

        await createAppointmentEvents(tx,[{
            appointmentID:appointmentId,
            recipientID:appointment.patientID,
            type:AppointmentNotificationType.REQUEST_CONFIRMED,
            scheduledAt:now,
        }]);

        const reminders = [
            {
                minutes: 60,
                type: AppointmentNotificationType.REMINDER_1_HOUR,
            },
            {
                minutes: 15,
                type: AppointmentNotificationType.REMINDER_15_MINUTES,
            },
        ]
            .map((reminder) => ({
                ...reminder,
                scheduledAt: new Date(
                    appointment.startAt.getTime() - reminder.minutes * 60 * 1000,
                ),
            }))
            .filter((reminder) => reminder.scheduledAt.getTime() > now.getTime());

        if (reminders.length > 0) {
            await createAppointmentEvents(tx,reminders.flatMap((reminder)=>[
                {
                    appointmentID:appointmentId,
                    recipientID:appointment.patientID,
                    type:reminder.type,
                    scheduledAt:reminder.scheduledAt,
                },
                {
                    appointmentID:appointmentId,
                    recipientID:doctorId,
                    type:reminder.type,
                    scheduledAt:reminder.scheduledAt,
                },
            ]));
        }

        return appointment;
        });
    } catch (error) {
        await limitGoogleMeetSpaceAccess(meetingSpace.name);
        throw error;
    }
}

export async function cleanupAppointmentMeeting(appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            meetingSpaceName: true,
            meetingCleanupPending: true,
        },
    });

    if (
        !appointment?.meetingCleanupPending ||
        !appointment.meetingSpaceName
    ) {
        return true;
    }

    try {
        await closeGoogleMeetSpace(appointment.meetingSpaceName);
        await prisma.appointment.updateMany({
            where: {
                id: appointmentId,
                meetingCleanupPending: true,
            },
            data: {
                meetingCleanupPending: false,
                meetingCleanupLastError: null,
                meetingClosedAt: new Date(),
            },
        });
        return true;
    } catch (error) {
        const message = error instanceof Error
            ? error.message.slice(0, 1000)
            : "Unknown error";
        await prisma.appointment.updateMany({
            where: {
                id: appointmentId,
                meetingCleanupPending: true,
            },
            data: {
                meetingCleanupAttempts: { increment: 1 },
                meetingCleanupLastError: message,
            },
        });
        return false;
    }
}

export async function completeAppointment(
    doctorId: string,
    appointmentId: string,
) {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            doctorID: true,
            patientID:true,
            startAt: true,
            status: true,
            meetingSpaceName: true,
        },
    });

    if (!appointment) {
        throw new ApiError(
            404,
            "APPOINTMENT_NOT_FOUND",
            "Khong tim thay lich hen",
        );
    }

    if (appointment.doctorID !== doctorId) {
        throw new ApiError(
            403,
            "APPOINTMENT_FORBIDDEN",
            "Khong co quyen hoan thanh lich hen nay",
        );
    }

    const now = new Date();
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
        throw new ApiError(
            409,
            "APPOINTMENT_NOT_COMPLETABLE",
            "Lich hen khong con co the hoan thanh",
        );
    }

    if (now < appointment.startAt) {
        throw new ApiError(
            409,
            "APPOINTMENT_NOT_STARTED",
            "Chua den gio bat dau lich hen",
        );
    }

    const completedAppointment = await prisma.$transaction(async (tx) => {
        const updated = await tx.appointment.updateMany({
            where: {
                id: appointmentId,
                doctorID: doctorId,
                status: AppointmentStatus.CONFIRMED,
                startAt: { lte: now },
            },
            data: {
                status: AppointmentStatus.COMPLETED,
                completedAt: now,
                meetingCleanupPending: appointment.meetingSpaceName !== null,
            },
        });

        if (updated.count !== 1) {
            throw new ApiError(
                409,
                "APPOINTMENT_NOT_COMPLETABLE",
                "Lich hen khong con co the hoan thanh",
            );
        }

        await tx.appointmentSlotReservation.deleteMany({
            where: { appointmentID: appointmentId },
        });

        await tx.appointmentStatusHistory.create({
            data: {
                appointmentID: appointmentId,
                changedByID: doctorId,
                fromStatus: AppointmentStatus.CONFIRMED,
                toStatus: AppointmentStatus.COMPLETED,
                actor: AppointmentActor.DOCTOR,
                note: "Bac si xac nhan hoan thanh buoi kham",
            },
        });

        await tx.appointmentNotification.updateMany({
            where: {
                appointmentID: appointmentId,
                status: NotificationDeliveryStatus.PENDING,
            },
            data: { status: NotificationDeliveryStatus.CANCELLED },
        });

        await tx.userNotification.deleteMany({
            where:{appointmentID:appointmentId,scheduledAt:{gt:now}},
        });

        await createAppointmentEvents(tx,[{
            appointmentID:appointmentId,
            recipientID:appointment.patientID,
            type:AppointmentNotificationType.APPOINTMENT_COMPLETED,
            scheduledAt:now,
        }]);

        return tx.appointment.findUniqueOrThrow({
            where: { id: appointmentId },
        });
    });

    if (completedAppointment.meetingCleanupPending) {
        await cleanupAppointmentMeeting(appointmentId);
        return prisma.appointment.findUniqueOrThrow({
            where: { id: appointmentId },
        });
    }

    return completedAppointment;
}

export async function rejectAppointment(
    doctorId: string,
    appointmentId: string,
    reason: string,
) {
    const existingAppointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            doctorID: true,
        },
    });

    if (!existingAppointment) {
        throw new ApiError(
            404,
            "APPOINTMENT_NOT_FOUND",
            "Khong tim thay lich hen",
        );
    }

    if (existingAppointment.doctorID !== doctorId) {
        throw new ApiError(
            403,
            "APPOINTMENT_FORBIDDEN",
            "Khong co quyen tu choi lich hen nay",
        );
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
        const updated = await tx.appointment.updateMany({
            where: {
                id: appointmentId,
                doctorID: doctorId,
                status: AppointmentStatus.PENDING_CONFIRMATION,
                confirmationDueAt: { gt: now },
                startAt: { gt: now },
            },
            data: {
                status: AppointmentStatus.REJECTED,
                rejectionReason: reason,
                respondedAt: now,
            },
        });

        if (updated.count !== 1) {
            throw new ApiError(
                409,
                "APPOINTMENT_NOT_REJECTABLE",
                "Lich hen khong con co the tu choi",
            );
        }

        const releasedReservation =
            await tx.appointmentSlotReservation.deleteMany({
                where: {
                    appointmentID: appointmentId,
                    expiresAt: { gt: now },
                },
            });

        if (releasedReservation.count !== 1) {
            throw new ApiError(
                409,
                "APPOINTMENT_NOT_REJECTABLE",
                "Khung gio giu cho lich hen khong con hieu luc",
            );
        }

        const appointment = await tx.appointment.findUniqueOrThrow({
            where: { id: appointmentId },
        });

        await tx.appointmentStatusHistory.create({
            data: {
                appointmentID: appointmentId,
                changedByID: doctorId,
                fromStatus: AppointmentStatus.PENDING_CONFIRMATION,
                toStatus: AppointmentStatus.REJECTED,
                actor: AppointmentActor.DOCTOR,
                note: reason,
            },
        });

        await tx.appointmentNotification.updateMany({
            where: {
                appointmentID: appointmentId,
                status: NotificationDeliveryStatus.PENDING,
                type: AppointmentNotificationType.REQUEST_CREATED,
            },
            data: { status: NotificationDeliveryStatus.CANCELLED },
        });

        await createAppointmentEvents(tx,[{
            appointmentID:appointmentId,
            recipientID:appointment.patientID,
            type:AppointmentNotificationType.REQUEST_REJECTED,
            scheduledAt:now,
        }]);

        return appointment;
    });
}

export async function cancelAppointment(
    currentUser: { id: string; role: UserRole },
    appointmentId: string,
    reason: string,
) {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            doctorID: true,
            patientID: true,
            startAt: true,
            status: true,
            meetingSpaceName: true,
        },
    });

    if (!appointment) {
        throw new ApiError(
            404,
            "APPOINTMENT_NOT_FOUND",
            "Khong tim thay lich hen",
        );
    }

    const isOwner =
        currentUser.role === "ADMIN" ||
        (currentUser.role === "DOCTOR" &&
            appointment.doctorID === currentUser.id) ||
        (currentUser.role === "PATIENT" &&
            appointment.patientID === currentUser.id);

    if (!isOwner) {
        throw new ApiError(
            403,
            "APPOINTMENT_FORBIDDEN",
            "Khong co quyen huy lich hen nay",
        );
    }

    const cancellableStatuses: AppointmentStatus[] = [
        AppointmentStatus.PENDING_CONFIRMATION,
        AppointmentStatus.CONFIRMED,
    ];

    if (!cancellableStatuses.includes(appointment.status)) {
        throw new ApiError(
            409,
            "APPOINTMENT_NOT_CANCELLABLE",
            "Lich hen khong con co the huy",
        );
    }

    const now = new Date();
    const cancelDeadline = new Date(
        appointment.startAt.getTime() -
            config.schedule.appointmentCancelBeforeMinutes * 60 * 1000,
    );

    if (now.getTime() > cancelDeadline.getTime()) {
        throw new ApiError(
            409,
            "CANCELLATION_TOO_LATE",
            `Chi duoc huy truoc gio hen it nhat ${config.schedule.appointmentCancelBeforeMinutes} phut`,
        );
    }

    const actor = getAppointmentActor(currentUser.role);

    const cancelledAppointment = await prisma.$transaction(async (tx) => {
        const updated = await tx.appointment.updateMany({
            where: {
                id: appointmentId,
                status: appointment.status,
                startAt: {
                    gte: new Date(
                        now.getTime() +
                            config.schedule.appointmentCancelBeforeMinutes *
                                60 *
                                1000,
                    ),
                },
            },
            data: {
                status: AppointmentStatus.CANCELLED,
                cancellationReason: reason,
                cancelledBy: actor,
                cancelledAt: now,
                meetingCleanupPending: appointment.meetingSpaceName !== null,
            },
        });

        if (updated.count !== 1) {
            throw new ApiError(
                409,
                "APPOINTMENT_NOT_CANCELLABLE",
                "Lich hen khong con co the huy",
            );
        }

        await tx.appointmentSlotReservation.deleteMany({
            where: { appointmentID: appointmentId },
        });

        await tx.appointmentStatusHistory.create({
            data: {
                appointmentID: appointmentId,
                changedByID: currentUser.id,
                fromStatus: appointment.status,
                toStatus: AppointmentStatus.CANCELLED,
                actor,
                note: reason,
            },
        });

        await tx.appointmentNotification.updateMany({
            where: {
                appointmentID: appointmentId,
                status: NotificationDeliveryStatus.PENDING,
                type: {
                    in: [
                        AppointmentNotificationType.REQUEST_CREATED,
                        AppointmentNotificationType.REQUEST_CONFIRMED,
                        AppointmentNotificationType.REMINDER_1_HOUR,
                        AppointmentNotificationType.REMINDER_15_MINUTES,
                    ],
                },
            },
            data: { status: NotificationDeliveryStatus.CANCELLED },
        });

        await tx.userNotification.deleteMany({
            where:{appointmentID:appointmentId,scheduledAt:{gt:now}},
        });

        const recipientIds =
            currentUser.role === "ADMIN"
                ? [appointment.patientID, appointment.doctorID]
                : [
                      currentUser.role === "PATIENT"
                          ? appointment.doctorID
                          : appointment.patientID,
                  ];

        await createAppointmentEvents(tx,recipientIds.map((recipientID)=>({
            appointmentID:appointmentId,
            recipientID,
            type:AppointmentNotificationType.APPOINTMENT_CANCELLED,
            scheduledAt:now,
        })));

        return tx.appointment.findUniqueOrThrow({
            where: { id: appointmentId },
        });
    });

    if (appointment.meetingSpaceName) {
        await cleanupAppointmentMeeting(appointmentId);
        const cleanedAppointment = await prisma.appointment.findUniqueOrThrow({
            where: { id: appointmentId },
        });
        return currentUser.role === "PATIENT"
            ? applyPatientMeetingUrlPolicy(cleanedAppointment)
            : cleanedAppointment;
    }

    return currentUser.role === "PATIENT"
        ? applyPatientMeetingUrlPolicy(cancelledAppointment)
        : cancelledAppointment;
}

export async function createAppointment(input:CreateAppointmentInput){
    const patient=await prisma.patientProfile.findUnique({
        where:{
            userID:input.patientId
        },
        select:{
            userID:true,
            user:{
                select:{
                    status:true
                }
            }
        }
    })

    if(!patient){
        throw new ApiError(404,"PATIENT_NOT_FOUND","Khong tim thay benh nhan");
    };
    if(patient.user.status!==UserStatus.ACTIVE){
        throw new ApiError(403,"USER_DISABLED","Nguoi dung da bi vo hieu hoa");
    };

    const doctor=await prisma.doctorProfile.findUnique({
        where:{
            userID:input.doctorId
        },
        select:{
            user:{
                select:{
                    status:true
                }
            }
        }
    });

    if(!doctor){
        throw new ApiError(404,"DOCTOR_NOT_FOUND","Khong tim thay bac si");
    };
    if(doctor.user.status!==UserStatus.ACTIVE){
        throw new ApiError(403,"USER_DISABLED","Nguoi dung da bi vo hieu hoa");
    }

    if(!isInUpcomingDays(input.startAt)){
        throw new ApiError(400,"APPOINTMENT_DATE_OUT_OF_RANGE","Thoi gian dat lich nam ngoai khoang cho phep");
    };

    const checkAvaible=await checkSlotAvailable({startAt:input.startAt,doctorId:input.doctorId});
    if(!checkAvaible){
        throw new ApiError(409,"APPOINTMENT_SLOT_UNAVAILABLE","Khung gio khong con kha dung");
    };

    const checkOverlap=await checkOverlapAppointment({
        startAt:input.startAt,
        patientId:input.patientId,
    });
    if(checkOverlap){
        throw new ApiError(409,"PATIENT_TIME_CONFLICT","Da dang ky lich khac cung khung gio");
    };

    try {
      return await prisma.$transaction(async (tx)=>{
        const now=new Date();
        const expiredReservations=await tx.appointmentSlotReservation.findMany({
            where: {
                expiresAt: { lte: now },
                OR: [
                    {
                        doctorID: input.doctorId,
                        startAt: input.startAt,
                    },
                    {
                        patientID: input.patientId,
                        startAt: input.startAt,
                    },
                ],
            },
            select: {
                id: true,
                appointmentID: true,
                patientID: true,
                expiresAt: true,
            },
        });

        for (const reservation of expiredReservations) {
            const expiredAppointment=await tx.appointment.updateMany({
                where:{
                    id:reservation.appointmentID,
                    status:AppointmentStatus.PENDING_CONFIRMATION,
                    confirmationDueAt:{lte:now},
                },
                data:{
                    status:AppointmentStatus.EXPIRED,
                }
            });

            if(expiredAppointment.count===1){
                await tx.appointmentSlotReservation.deleteMany({
                    where:{
                        id:reservation.id,
                        expiresAt:{
                            lte:now
                        },
                    }
                });

                await tx.appointmentStatusHistory.create({
                    data: {
                        appointmentID: reservation.appointmentID,
                        fromStatus: AppointmentStatus.PENDING_CONFIRMATION,
                        toStatus: AppointmentStatus.EXPIRED,
                        actor: AppointmentActor.SYSTEM,
                        note: "Qua thoi gian cho bac si xac nhan",
                    },
                });

                await tx.appointmentNotification.updateMany({
                    where: {
                        appointmentID: reservation.appointmentID,
                        status: NotificationDeliveryStatus.PENDING,
                        type: AppointmentNotificationType.REQUEST_CREATED,
                    },
                    data: { status: NotificationDeliveryStatus.CANCELLED },
                });

                await createAppointmentEvents(tx,[{
                    appointmentID:reservation.appointmentID,
                    recipientID:reservation.patientID,
                    type:AppointmentNotificationType.REQUEST_EXPIRED,
                    scheduledAt:now,
                }]);
            }
        }

        const endAt=new Date(input.startAt.getTime()+config.schedule.slotDurationMinutes*60*1000);
        const confirmationDueAt=new Date(now.getTime()+config.schedule.appointmentHoldMinutes*60*1000);
        const appointment=await tx.appointment.create({
            data:{
                doctorID:input.doctorId,
                patientID:input.patientId,
                startAt:input.startAt,
                endAt,
                visitReason:input.visitReason,
                confirmationDueAt,                
            }
        });

        await tx.appointmentSlotReservation.create({
            data:{
                appointmentID:appointment.id,
                doctorID:input.doctorId,
                patientID:input.patientId,
                startAt:input.startAt,
                endAt,
                expiresAt:confirmationDueAt,
            }
        });

        await tx.appointmentStatusHistory.create({
            data: {
                appointmentID: appointment.id,
                toStatus: AppointmentStatus.PENDING_CONFIRMATION,
                changedByID: input.patientId,
                actor: AppointmentActor.PATIENT,
                note: "Benh nhan gui yeu cau dat lich",
            },
        });

        await createAppointmentEvents(tx,[
            {
                appointmentID:appointment.id,
                recipientID:input.doctorId,
                type:AppointmentNotificationType.REQUEST_CREATED,
                scheduledAt:now,
            },
            {
                appointmentID:appointment.id,
                recipientID:input.patientId,
                type:AppointmentNotificationType.BOOKING_CREATED,
                scheduledAt:now,
            },
        ]);

        return appointment;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const patientReservation =
          await prisma.appointmentSlotReservation.findUnique({
            where: {
              patientID_startAt: {
                patientID: input.patientId,
                startAt: input.startAt,
              },
            },
            select: { id: true },
          });

        if (patientReservation) {
          throw new ApiError(
            409,
            "PATIENT_TIME_CONFLICT",
            "Benh nhan da co lich trong khung gio nay",
          );
        }

        throw new ApiError(
          409,
          "SLOT_ALREADY_RESERVED",
          "Khung gio vua duoc nguoi khac dat",
        );
      }

      throw error;
    }
};

async function checkOverlapAppointment(input:checkOverlapAppointmentInput) {
    const now = new Date();
    const appointment=await prisma.appointment.findFirst({
        where:{
            patientID:input.patientId,
            startAt:input.startAt,
            OR: [
                { status: AppointmentStatus.CONFIRMED },
                {
                    status: AppointmentStatus.PENDING_CONFIRMATION,
                    confirmationDueAt: { gt: now },
                },
            ],
        },
        select:{
            id:true,
        }
    })

    return appointment!==null;
}
