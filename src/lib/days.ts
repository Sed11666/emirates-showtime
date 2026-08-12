/**
 * days.ts — Asia/Dubai date helpers.
 *
 * Every date in the app is expressed as a "day key" (yyyy-mm-dd in Dubai time)
 * so that scraped showtimes, the date picker and "today" all agree regardless
 * of the visitor's own timezone. buildDayOptions() produces the next N days
 * for the date pickers; parseDayKey() reads keys back out of scraped payloads.
 */
export type DayOption = {
  value: string; // "any" or ISO date (yyyy-mm-dd)
  label: string;
  sublabel: string;
};

const DUBAI_TZ = "Asia/Dubai";

export function toDayKey(date: Date): string {
  // yyyy-mm-dd in Dubai time
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DUBAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildDayOptions(count = 7): DayOption[] {
  const now = new Date();
  const options: DayOption[] = [{ value: "any", label: "Any", sublabel: "day" }];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(now.getTime() + i * 86_400_000);
    const key = toDayKey(date);
    options.push({
      value: key,
      label:
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : new Intl.DateTimeFormat("en-AE", { timeZone: DUBAI_TZ, weekday: "short" }).format(date),
      sublabel: new Intl.DateTimeFormat("en-AE", {
        timeZone: DUBAI_TZ,
        day: "numeric",
        month: "short",
      }).format(date),
    });
  }
  return options;
}

/** Extract a yyyy-mm-dd key from a loose date string, if possible. */
export function parseDayKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDayKey(parsed);
}

export function isTodayKey(key: string) {
  return key === toDayKey(new Date());
}

/** Screenings before this hour belong to the previous evening, not a new day. */
const LATE_NIGHT_ROLLOVER_HOUR = 5;

/**
 * "7:45pm", "07:45 PM" and "19:45" all become minutes past midnight. A 00:20
 * screening returns 1460, not 20, so it sorts at the end of the evening it
 * actually belongs to rather than the start of the next morning.
 */
export function timeToMinutes(raw: string): number {
  const match = raw.trim().match(/^(\d{1,2})[:.](\d{2})\s*([ap]\.?m\.?)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toLowerCase();
  if (suffix?.startsWith("p") && hours < 12) hours += 12;
  if (suffix?.startsWith("a") && hours === 12) hours = 0;
  if (hours < LATE_NIGHT_ROLLOVER_HOUR) hours += 24;
  return hours * 60 + minutes;
}

/** Dubai wall-clock as minutes past midnight, on timeToMinutes' rolled-over scale. */
export function dubaiNowMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const hour = rawHour < LATE_NIGHT_ROLLOVER_HOUR ? rawHour + 24 : rawHour;
  return hour * 60 + minute;
}

/** How long a screening stays listed after it starts. */
export const SHOWTIME_GRACE_MINUTES = 30;

/**
 * True once a screening started more than the grace period ago — a 12:30 show
 * drops off at 13:00.
 *
 * Only ever hides today's screenings. A future date keeps its whole schedule,
 * and an undated entry is only judged when the visitor is looking at today,
 * since otherwise we cannot tell which day it belongs to and hiding it would
 * silently drop a valid future screening.
 */
export function isScreeningOver(
  time: string,
  screeningDate: string | null,
  selectedDayKey: string,
  now: Date = new Date(),
): boolean {
  const appliesToToday = screeningDate
    ? isTodayKey(screeningDate)
    : isTodayKey(selectedDayKey);
  if (!appliesToToday) return false;

  const start = timeToMinutes(time);
  if (start === Number.MAX_SAFE_INTEGER) return false; // unparseable: leave it alone
  return start + SHOWTIME_GRACE_MINUTES <= dubaiNowMinutes(now);
}
