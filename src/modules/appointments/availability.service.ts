import {
  DoctorScheduleOverrideType,
  UserRole,
  UserStatus,
} from "../../../generated/prisma/enums.js";
import { ApiError } from "../../common/api-error.js";
import { config } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { weeklyScheduleSchema } from "../doctors/doctor.schema.js";
import type { checkSlotAvailableInput, DoctorAvailabilityInput } from "./appointment.schema.js";
import {
  clipRangesToWindow,
  getUpcomingDays,
  mergeRanges,
  overlapsAny,
  splitIntoSlots,
  weeklyScheduleToTimeRanges,
  type TimeRange,
} from "./appointment-time.js";
import {
  getScheduleSettings,
  getWorkdayWindow,
} from "../system-settings/system-setting.service.js";

export type DailyAvailability = {
  date: string;
  slots: TimeRange[];
};

export async function getDoctorAvailability(
  input: DoctorAvailabilityInput,
) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      userID: input.doctorId,
      user: {
        status: UserStatus.ACTIVE,
        role: UserRole.DOCTOR,
      },
    },
    select: {
      userID: true,
      weeklySchedule: true,
    },
  });

  if (!doctor) {
    throw new ApiError("DOCTOR_NOT_FOUND");
  }

  const weeklySchedule = weeklyScheduleSchema.parse(doctor.weeklySchedule);
  const now = new Date();
  const timezone = config.schedule.timezone;
  const upcomingDays = getUpcomingDays(
    now,
    timezone,
    config.schedule.appointmentAvailabilityDays,
  );
  const period: TimeRange = {
    startAt: upcomingDays[0]!.startAt,
    endAt: upcomingDays.at(-1)!.endAt,
  };

  const [overrides, reservations, settings] = await Promise.all([
    prisma.doctorScheduleOverride.findMany({
      where: {
        doctorID: doctor.userID,
        startAt: { lt: period.endAt },
        endAt: { gt: period.startAt },
      },
      select: {
        startAt: true,
        endAt: true,
        type: true,
      },
    }),
    prisma.appointmentSlotReservation.findMany({
      where: {
        doctorID: doctor.userID,
        startAt: { lt: period.endAt },
        endAt: { gt: period.startAt },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        startAt: true,
        endAt: true,
      },
    }),
    getScheduleSettings(),
  ]);

  const availableOverrideRanges: TimeRange[] = overrides.filter(
    (override) => override.type === DoctorScheduleOverrideType.AVAILABLE,
  );
  const unavailableOverrideRanges: TimeRange[] = overrides.filter(
    (override) => override.type === DoctorScheduleOverrideType.UNAVAILABLE,
  );
  const reservationRanges: TimeRange[] = reservations;

  const days: DailyAvailability[] = upcomingDays.map((day) => {
    const weeklyRanges = weeklyScheduleToTimeRanges(
      weeklySchedule,
      day,
      timezone,
    );
    const availableToday = clipRangesToWindow(
      availableOverrideRanges,
      day,
    );
    const unavailableToday = clipRangesToWindow(
      unavailableOverrideRanges,
      day,
    );
    const reservationsToday = clipRangesToWindow(
      reservationRanges,
      day,
    );
    const candidateRanges = clipRangesToWindow(
      mergeRanges([...weeklyRanges, ...availableToday]),
      getWorkdayWindow(day.date, settings),
    );
    const slots: TimeRange[] = splitIntoSlots(
      candidateRanges,
      config.schedule.slotDurationMinutes,
    )
      .filter(
        (slot) => 
            slot.startAt.getTime() > now.getTime() &&
            !overlapsAny(slot,unavailableToday) &&
            !overlapsAny(slot,reservationsToday),
    );
    
    return { date: day.date, slots };
  });

  return {
    doctorId: doctor.userID,
    timezone,
    fromDate: upcomingDays[0]!.date,
    toDate: upcomingDays.at(-1)!.date,
    slotDurationMinutes: config.schedule.slotDurationMinutes,
    days,
  };
}

export async function checkSlotAvailable(input:checkSlotAvailableInput) {
  const availableSlots=await getDoctorAvailability({doctorId:input.doctorId});
  const slotDuration = config.schedule.slotDurationMinutes * 60 * 1000;
  const expectedEndAt=new Date(input.startAt.getTime()+slotDuration);
  return availableSlots.days.some((day)=>
    day.slots.some((slot)=>
      slot.startAt.getTime()===input.startAt.getTime() &&
      slot.endAt.getTime()===expectedEndAt.getTime()
    )
  );
}
