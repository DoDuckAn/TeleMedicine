import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  AppointmentActor,
  AppointmentNotificationType,
  AppointmentStatus,
  DoctorScheduleOverrideType,
  NotificationDeliveryStatus,
  UserStatus,
} from "../../../generated/prisma/enums.js";
import { ApiError } from "../../common/api-error.js";
import { config } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { cleanupAppointmentMeeting } from "../appointments/appointment.service.js";
import { createAppointmentEvents } from "../appointments/appointment.notification.js";
import {
  addDaysToDateString,
  clipRangesToWindow,
  getWeekdayKey,
  mergeRanges,
  overlapsAny,
  rangesOverlap,
  splitIntoSlots,
  subtractRanges,
  weeklyScheduleToTimeRanges,
  type TimeRange,
} from "../appointments/appointment-time.js";
import { weeklyScheduleSchema } from "../doctors/doctor.schema.js";
import type {
  CreateScheduleOverrideInput,
  DoctorCalendarQuery,
  ListScheduleOverridesQuery,
  RestoreScheduleOverridesInput,
  UpdateWeeklyScheduleInput,
} from "./schedule-override.schema.js";
import {
  assertAvailableRangeWithinWorkday,
  assertWeeklyScheduleWithinWorkday,
  getScheduleSettings,
  getWorkdayWindow,
} from "../system-settings/system-setting.service.js";

const ACTIVE_APPOINTMENT_STATUSES=[
  AppointmentStatus.PENDING_CONFIRMATION,
  AppointmentStatus.CONFIRMED,
] as const;

const CALENDAR_APPOINTMENT_STATUSES=[
  AppointmentStatus.PENDING_CONFIRMATION,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
] as const;

async function findDoctorSchedule(doctorId: string, includeDisabled=false) {
  const doctor=await prisma.doctorProfile.findFirst({
    where: {
      userID: doctorId,
      ...(includeDisabled?{}:{user: { status: UserStatus.ACTIVE }}),
    },
    select: {
      userID: true,
      weeklySchedule: true,
    },
  });

  if (!doctor) {
    throw new ApiError("DOCTOR_NOT_FOUND");
  }

  return doctor;
}

export async function getWeeklySchedule(doctorId: string) {
  const doctor=await findDoctorSchedule(doctorId);
  return {
    doctorId: doctor.userID,
    timezone: config.schedule.timezone,
    slotDurationMinutes: config.schedule.slotDurationMinutes,
    weeklySchedule: weeklyScheduleSchema.parse(doctor.weeklySchedule),
  };
}

export async function updateWeeklySchedule(
  doctorId: string,
  input: UpdateWeeklyScheduleInput,
) {
  await findDoctorSchedule(doctorId);
  const settings=await getScheduleSettings();
  assertWeeklyScheduleWithinWorkday(input.weeklySchedule,settings);
  const doctor=await prisma.doctorProfile.update({
    where: { userID: doctorId },
    data: { weeklySchedule: input.weeklySchedule },
    select: {
      userID: true,
      weeklySchedule: true,
      updatedAt: true,
    },
  });

  return {
    doctorId: doctor.userID,
    timezone: config.schedule.timezone,
    slotDurationMinutes: config.schedule.slotDurationMinutes,
    weeklySchedule: weeklyScheduleSchema.parse(doctor.weeklySchedule),
    updatedAt: doctor.updatedAt,
  };
}

export async function listOverrides(
  doctorId: string,
  query: ListScheduleOverridesQuery,
  includeDisabled=false,
) {
  await findDoctorSchedule(doctorId,includeDisabled);
  const now=new Date();
  const from=query.from??now;
  const to=query.to??new Date(from.getTime()+28*24*60*60*1000);

  const items=await prisma.doctorScheduleOverride.findMany({
    where: {
      doctorID:doctorId,
      startAt:{lt: to},
      endAt:{gt: from},
      ...(query.type ? { type: query.type } : {}),
    },
    select: {
      id: true,
      type: true,
      startAt: true,
      endAt: true,
      reason: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
  });

  return { from, to, items };
}

export async function createOverride(
  doctorId: string,
  input: CreateScheduleOverrideInput,
) {
  await findDoctorSchedule(doctorId);
  if(input.type===DoctorScheduleOverrideType.AVAILABLE){
    const settings=await getScheduleSettings();
    input.ranges.forEach(range=>assertAvailableRangeWithinWorkday(range,settings));
  }
  const now=new Date();
  if (input.ranges.some((range) => range.endAt<=now)) {
    throw new ApiError("SCHEDULE_OVERRIDE_IN_PAST");
  }

  const result=await prisma.$transaction(async (tx) => {
    const overlappingOverride=await tx.doctorScheduleOverride.findFirst({
      where: {
        doctorID: doctorId,
        OR: input.ranges.map((range) => ({
          startAt: { lt: range.endAt },
          endAt: { gt: range.startAt },
        })),
      },
      select: { id: true },
    });

    if (overlappingOverride) {
      throw new ApiError("SCHEDULE_OVERRIDE_OVERLAP");
    }

    const overrides=[];
    for (const range of input.ranges) {
      const override=await tx.doctorScheduleOverride.create({
        data: {
          doctorID: doctorId,
          createdByID: doctorId,
          type: input.type,
          startAt: range.startAt,
          endAt: range.endAt,
          reason: input.reason??null,
        },
        select: {
          id: true,
          type: true,
          startAt: true,
          endAt: true,
          reason: true,
          createdAt: true,
        },
      });
      overrides.push(override);
    }

    if (input.type!==DoctorScheduleOverrideType.UNAVAILABLE) {
      return { overrides, cancelledAppointments: [] };
    }

    const affectedAppointments=await tx.appointment.findMany({
      where: {
        doctorID: doctorId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        OR: input.ranges.map((range) => ({
          startAt: { lt: range.endAt },
          endAt: { gt: range.startAt },
        })),
      },
      select: {
        id: true,
        patientID: true,
        status: true,
        meetingSpaceName: true,
      },
      orderBy: { startAt: "asc" },
    });

    const cancellationReason=`Bac si nghi dot xuat: ${input.reason??"Khong co ly do"}`;
    const cancelledAppointments: typeof affectedAppointments=[];

    for (const appointment of affectedAppointments) {
      const updated=await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          doctorID: doctorId,
          status: appointment.status,
        },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancellationReason,
          cancelledBy: AppointmentActor.DOCTOR,
          cancelledAt: now,
          meetingCleanupPending: appointment.meetingSpaceName!==null,
        },
      });

      if (updated.count===1) {
        cancelledAppointments.push(appointment);
      }
    }

    const cancelledIds=cancelledAppointments.map((appointment) => appointment.id);
    if (cancelledIds.length>0) {
      await tx.appointmentSlotReservation.deleteMany({
        where: { appointmentID: { in: cancelledIds } },
      });

      await tx.appointmentStatusHistory.createMany({
        data: cancelledAppointments.map((appointment) => ({
          appointmentID: appointment.id,
          changedByID: doctorId,
          fromStatus: appointment.status,
          toStatus: AppointmentStatus.CANCELLED,
          actor: AppointmentActor.DOCTOR,
          note: cancellationReason,
        })),
      });

      await tx.appointmentNotification.updateMany({
        where: {
          appointmentID: { in: cancelledIds },
          status: {
            in: [
              NotificationDeliveryStatus.PENDING,
              NotificationDeliveryStatus.PROCESSING,
            ],
          },
        },
        data: {
          status: NotificationDeliveryStatus.CANCELLED,
          processingStartedAt: null,
          nextAttemptAt: null,
        },
      });

      await tx.userNotification.deleteMany({
        where:{
          appointmentID:{in:cancelledIds},
          scheduledAt:{gt:now},
        },
      });

      await createAppointmentEvents(tx,cancelledAppointments.map((appointment)=>({
        appointmentID:appointment.id,
        recipientID:appointment.patientID,
        type:AppointmentNotificationType.APPOINTMENT_CANCELLED,
        scheduledAt:now,
      })));
    }

    return { overrides, cancelledAppointments };
  });

  await Promise.all(
    result.cancelledAppointments
      .filter((appointment) => appointment.meetingSpaceName!==null)
      .map((appointment) => cleanupAppointmentMeeting(appointment.id)),
  );

  return {
    overrides: result.overrides,
    createdOverrideCount: result.overrides.length,
    cancelledAppointmentCount: result.cancelledAppointments.length,
    cancelledAppointmentIds: result.cancelledAppointments.map(
      (appointment) => appointment.id,
    ),
  };
}

export async function restoreOverrides(
  doctorId: string,
  input: RestoreScheduleOverridesInput,
) {
  await findDoctorSchedule(doctorId);

  return prisma.$transaction(async (tx) => {
    const affectedOverrides=await tx.doctorScheduleOverride.findMany({
      where: {
        doctorID: doctorId,
        OR: input.ranges.map((range) => ({
          startAt: { lt: range.endAt },
          endAt: { gt: range.startAt },
        })),
      },
      select: {
        id: true,
        createdByID: true,
        type: true,
        startAt: true,
        endAt: true,
        reason: true,
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });

    const removedOverrideIds=affectedOverrides.map((override) => override.id);
    if (removedOverrideIds.length>0) {
      await tx.doctorScheduleOverride.deleteMany({
        where: {
          doctorID: doctorId,
          id: { in: removedOverrideIds },
        },
      });
    }

    const replacementOverrides=[];
    for (const override of affectedOverrides) {
      const remainingRanges=subtractRanges(
        [{ startAt: override.startAt, endAt: override.endAt }],
        input.ranges,
      );

      for (const range of remainingRanges) {
        const replacement=await tx.doctorScheduleOverride.create({
          data: {
            doctorID: doctorId,
            createdByID: override.createdByID,
            type: override.type,
            startAt: range.startAt,
            endAt: range.endAt,
            reason: override.reason,
          },
          select: {
            id: true,
            type: true,
            startAt: true,
            endAt: true,
            reason: true,
            createdAt: true,
          },
        });
        replacementOverrides.push(replacement);
      }
    }

    return {
      restoredRanges: input.ranges,
      removedOverrideCount: removedOverrideIds.length,
      removedOverrideIds,
      replacementOverrideCount: replacementOverrides.length,
      replacementOverrides,
    };
  });
}

export async function deleteOverride(doctorId: string, overrideId: string) {
  const deleted=await prisma.doctorScheduleOverride.deleteMany({
    where: {
      id: overrideId,
      doctorID: doctorId,
    },
  });

  if (deleted.count!==1) {
    throw new ApiError("SCHEDULE_OVERRIDE_NOT_FOUND");
  }
}

function resolveWeekStart(query: DoctorCalendarQuery) {
  if (query.weekStart) {
    if (getWeekdayKey(query.weekStart, config.schedule.timezone)!=="MONDAY") {
      throw new ApiError("WEEK_START_NOT_MONDAY");
    }
    return query.weekStart;
  }

  const today=formatInTimeZone(
    new Date(),
    config.schedule.timezone,
    "yyyy-MM-dd",
  );
  const weekdayOrder=[
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ];
  const weekdayIndex=weekdayOrder.indexOf(
    getWeekdayKey(today, config.schedule.timezone),
  );
  return addDaysToDateString(today, -weekdayIndex);
}

export async function getDoctorCalendar(
  doctorId: string,
  query: DoctorCalendarQuery,
) {
  const doctor=await findDoctorSchedule(doctorId);
  const settings=await getScheduleSettings();
  const weeklySchedule=weeklyScheduleSchema.parse(doctor.weeklySchedule);
  const weekStart=resolveWeekStart(query);
  const weekEnd=addDaysToDateString(weekStart, 7);
  const period: TimeRange={
    startAt: fromZonedTime(
      `${weekStart}T00:00:00`,
      config.schedule.timezone,
    ),
    endAt: fromZonedTime(
      `${weekEnd}T00:00:00`,
      config.schedule.timezone,
    ),
  };

  const [overrides, appointments]=await Promise.all([
    prisma.doctorScheduleOverride.findMany({
      where: {
        doctorID: doctorId,
        startAt: { lt: period.endAt },
        endAt: { gt: period.startAt },
      },
      select: {
        id: true,
        type: true,
        startAt: true,
        endAt: true,
        reason: true,
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        doctorID: doctorId,
        status: { in: [...CALENDAR_APPOINTMENT_STATUSES] },
        startAt: { lt: period.endAt },
        endAt: { gt: period.startAt },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        visitReason: true,
        confirmationDueAt: true,
        meetingUrl: true,
        patient: {
          select: {
            userID: true,
            fullName: true,
            dateOfBirth: true,
            gender: true,
            avatar: true,
          },
        },
      },
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const availableOverrides=overrides.filter(
    (override) => override.type===DoctorScheduleOverrideType.AVAILABLE,
  );
  const unavailableOverrides=overrides.filter(
    (override) => override.type===DoctorScheduleOverrideType.UNAVAILABLE,
  );
  const now=new Date();

  const days=Array.from({ length: 7 }, (_, index) => {
    const date=addDaysToDateString(weekStart, index);
    const nextDate=addDaysToDateString(date, 1);
    const day: TimeRange & { date: string; weekday: ReturnType<typeof getWeekdayKey> }={
      date,
      weekday: getWeekdayKey(date, config.schedule.timezone),
      startAt: fromZonedTime(`${date}T00:00:00`, config.schedule.timezone),
      endAt: fromZonedTime(`${nextDate}T00:00:00`, config.schedule.timezone),
    };
    const weeklyRanges=weeklyScheduleToTimeRanges(
      weeklySchedule,
      day,
      config.schedule.timezone,
    );
    const availableToday=clipRangesToWindow(availableOverrides, day);
    const unavailableToday=clipRangesToWindow(unavailableOverrides, day);
    const appointmentsToday=appointments.filter((appointment) =>
      rangesOverlap(appointment, day),
    );
    const availableRanges=clipRangesToWindow(
      mergeRanges([...weeklyRanges,...availableToday]),
      getWorkdayWindow(date,settings),
    );
    const candidateRanges=mergeRanges([
      ...availableRanges,
      ...appointmentsToday.map((appointment) => ({
        startAt: appointment.startAt,
        endAt: appointment.endAt,
      })),
    ]);
    const slots=splitIntoSlots(
      candidateRanges,
      config.schedule.slotDurationMinutes,
    ).map((slot) => {
      const appointment=appointmentsToday.find((item) =>
        rangesOverlap(item, slot),
      );
      const unavailableOverride=unavailableOverrides.find((override) =>
        rangesOverlap(override, slot),
      );

      if (appointment) {
        return {
          ...slot,
          status: appointment.status,
          isBookable: false,
          appointment,
          override: null,
        };
      }

      if (unavailableOverride || overlapsAny(slot, unavailableToday)) {
        return {
          ...slot,
          status: "UNAVAILABLE" as const,
          isBookable: false,
          appointment: null,
          override: unavailableOverride
            ? {
                id: unavailableOverride.id,
                reason: unavailableOverride.reason,
              }
            : null,
        };
      }

      return {
        ...slot,
        status: "AVAILABLE" as const,
        isBookable: slot.startAt>now,
        appointment: null,
        override: null,
      };
    });

    return {
      date,
      weekday: day.weekday,
      overrides: overrides.filter((override) => rangesOverlap(override, day)),
      slots,
    };
  });

  return {
    doctorId,
    timezone: config.schedule.timezone,
    slotDurationMinutes: config.schedule.slotDurationMinutes,
    weekStart,
    weekEnd: addDaysToDateString(weekEnd, -1),
    days,
  };
}
