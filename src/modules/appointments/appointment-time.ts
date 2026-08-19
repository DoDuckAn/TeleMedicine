import { isValid } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { WeeklySchedule } from "../doctors/doctor.schema.js";

export type TimeRange = {
  startAt: Date;
  endAt: Date;
};

export type WeekdayKey = keyof WeeklySchedule;

export type UpcomingDay = TimeRange & {
  date: string;
  weekday: WeekdayKey;
};

const weekdayKeys: WeekdayKey[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

function isWeekdayKey(value: string): value is WeekdayKey {
  return weekdayKeys.includes(value as WeekdayKey);
}

export function getWeekdayKey(
  date: string,
  timezone: string,
): WeekdayKey {
  const utcNoon = fromZonedTime(`${date}T12:00:00`, timezone);

  if (!isValid(utcNoon)) {
    throw new RangeError(`Ngay hoac mui gio khong hop le: ${date}, ${timezone}`);
  }

  const weekday = formatInTimeZone(utcNoon, timezone, "EEEE").toUpperCase();

  if (!isWeekdayKey(weekday)) {
    throw new RangeError(`Khong xac dinh duoc thu trong tuan: ${weekday}`);
  }

  return weekday;
}

export function weeklyScheduleToTimeRanges(
  weeklySchedule: WeeklySchedule,
  day: Pick<UpcomingDay, "date" | "weekday">,
  timezone: string,
): TimeRange[] {
  return weeklySchedule[day.weekday].map((range) => {
    const start = fromZonedTime(
      `${day.date}T${range.startTime}:00`,
      timezone,
    );
    const end = fromZonedTime(
      `${day.date}T${range.endTime}:00`,
      timezone,
    );

    if (!isValid(start) || !isValid(end)) {
      throw new RangeError(
        `Khoang gio khong hop le: ${day.date} ${range.startTime}-${range.endTime}`,
      );
    }

    return { startAt: start, endAt: end };
  });
}

export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort(
    (left, right) => left.startAt.getTime() - right.startAt.getTime(),
  );
  const result: TimeRange[] = [];

  for (const current of sorted) {
    const previous = result.at(-1);

    if (!previous || current.startAt.getTime() > previous.endAt.getTime()) {
      result.push({ ...current });
      continue;
    }

    if (current.endAt.getTime() > previous.endAt.getTime()) {
      previous.endAt = current.endAt;
    }
  }

  return result;
}

function subtractRange(source: TimeRange, blocked: TimeRange): TimeRange[] {
  const noOverlap =
    blocked.endAt.getTime() <= source.startAt.getTime() ||
    blocked.startAt.getTime() >= source.endAt.getTime();

  if (noOverlap) return [source];

  const result: TimeRange[] = [];

  if (blocked.startAt.getTime() > source.startAt.getTime()) {
    result.push({ startAt: source.startAt, endAt: blocked.startAt });
  }

  if (blocked.endAt.getTime() < source.endAt.getTime()) {
    result.push({ startAt: blocked.endAt, endAt: source.endAt });
  }

  return result;
}

export function subtractRanges(
  available: TimeRange[],
  blockedRanges: TimeRange[],
) {
  return blockedRanges.reduce(
    (current, blocked) =>
      current.flatMap((range) => subtractRange(range, blocked)),
    available,
  );
}

export function splitIntoSlots(ranges: TimeRange[], slotMinutes: number) {
  const duration = slotMinutes * 60 * 1000;
  const slots: TimeRange[] = [];

  for (const range of ranges) {
    for (
      let start = range.startAt.getTime();
      start + duration <= range.endAt.getTime();
      start += duration
    ) {
      slots.push({
        startAt: new Date(start),
        endAt: new Date(start + duration),
      });
    }
  }

  return slots;
}

export function addDaysToDateString(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day!));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getUpcomingDays(
  now: Date,
  timezone: string,
  numberOfDays: number,
): UpcomingDay[] {
  if (!Number.isInteger(numberOfDays) || numberOfDays < 1) {
    throw new RangeError("So ngay availability phai la so nguyen duong");
  }

  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");

  return Array.from({ length: numberOfDays }, (_, index) => {
    const date = addDaysToDateString(today, index);
    const nextDate = addDaysToDateString(date, 1);
    const startAt = fromZonedTime(`${date}T00:00:00`, timezone);
    const endAt = fromZonedTime(`${nextDate}T00:00:00`, timezone);

    if (!isValid(startAt) || !isValid(endAt)) {
      throw new RangeError(`Khong tao duoc khoang ngay: ${date}`);
    }

    return {
      date,
      weekday: getWeekdayKey(date, timezone),
      startAt,
      endAt,
    };
  });
}

export function rangesOverlap(
  left: TimeRange,
  right: TimeRange,
) {
  return (
    left.startAt.getTime() < right.endAt.getTime() &&
    left.endAt.getTime() > right.startAt.getTime()
  );
}

export function clipRangesToWindow(
  ranges: TimeRange[],
  window: TimeRange,
): TimeRange[] {
  return ranges.flatMap((range) => {
    const startAt = new Date(
      Math.max(range.startAt.getTime(), window.startAt.getTime()),
    );
    const endAt = new Date(
      Math.min(range.endAt.getTime(), window.endAt.getTime()),
    );

    return startAt < endAt ? [{ startAt, endAt }] : [];
  });
}

export function overlapsAny(
  range: TimeRange,
  otherRanges: TimeRange[],
) {
  return otherRanges.some((other) =>
    rangesOverlap(range, other),
  );
}
