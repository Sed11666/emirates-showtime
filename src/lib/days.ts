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

/**
 * Currently unused. The day pickers were removed because the database only ever
 * holds the day it was scraped, so offering future days rendered today's times
 * under tomorrow's date. Kept because it is exactly what a multi-day UI needs
 * back, and because it is correct — the gap is the data, not this function.
 */
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

/** Dubai is UTC+4 all year — no daylight saving — so a fixed offset is exact. */
const DUBAI_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * The real instant a screening starts, as epoch milliseconds.
 *
 * timeToMinutes' rollover is what makes this correct rather than clever: a
 * 00:20 screening listed under 12 Aug returns 1460 minutes, i.e. past the end
 * of that day, so it resolves to 00:20 on the 13th — which is when it actually
 * plays. Comparing rolled minutes directly against a rolled clock would be
 * wrong in the small hours, where "now" is ~1470 and a 09:50 show later the
 * same day is only 590, making the whole coming day look long finished.
 */
function screeningStartMs(dayKey: string, minutesFromMidnight: number): number | null {
  const match = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const midnightUtc = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return midnightUtc + minutesFromMidnight * 60_000 - DUBAI_UTC_OFFSET_MS;
}

/** How long a screening stays listed after it starts. */
export const SHOWTIME_GRACE_MINUTES = 30;

/**
 * True once a screening started more than the grace period ago — a 12:30 show
 * drops off at 13:00.
 *
 * Undated entries are judged against the day the visitor is viewing, falling
 * back to today when that is "any". Anything we cannot place on a clock is
 * left visible: hiding a screening we failed to parse would be worse than
 * showing one that has started.
 */
export function isScreeningOver(
  time: string,
  screeningDate: string | null,
  selectedDayKey: string,
  now: Date = new Date(),
): boolean {
  const dayKey =
    screeningDate ?? (selectedDayKey !== "any" ? selectedDayKey : toDayKey(now));

  const minutes = timeToMinutes(time);
  if (minutes === Number.MAX_SAFE_INTEGER) return false;

  const startMs = screeningStartMs(dayKey, minutes);
  if (startMs === null) return false;

  return now.getTime() - startMs >= SHOWTIME_GRACE_MINUTES * 60_000;
}
