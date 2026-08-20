import { AppointmentStatus } from "../../../generated/prisma/enums.js";
import { config } from "../../config/env.js";

type AppointmentWithMeeting = {
    status: AppointmentStatus;
    startAt: Date;
    endAt: Date;
    meetingUrl: string | null;
};

export function applyPatientMeetingUrlPolicy<T extends AppointmentWithMeeting>(
    appointment: T,
    now = new Date(),
): T {
    const joinWindowStartsAt = new Date(
        appointment.startAt.getTime() -
            config.schedule.meetingJoinBeforeMinutes * 60 * 1000,
    );
    const canJoin =
        appointment.status === AppointmentStatus.CONFIRMED &&
        now >= joinWindowStartsAt &&
        now <= appointment.endAt;

    return {
        ...appointment,
        meetingUrl: canJoin ? appointment.meetingUrl : null,
    };
}
