/**
 * days.ts — Asia/Dubai date helpers.
 *
 * Every date in the app is expressed as a "day key" (yyyy-mm-dd in Dubai time)
 * so that scraped showtimes, the date picker and "today" all agree regardless
 * of the visitor's own timezone. buildDayOptions() produces the next N days
 * for the date pickers; parseDayKey() reads keys back out of scraped payloads.
 */
export type DayOption = {
  value: string; // ISO date (yyyy-mm-dd)
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
 * How many days the board offers. Must match SCRAPE_DAYS in the aggregator:
 * cinemauae serves three days per film (?d=0|1|2) and nothing beyond, so a
 * fourth tab would have no screenings behind it.
 */
export const DAY_COUNT = 3;

/**
 * The day chips: today, tomorrow, then weekday names.
 *
 * There is deliberately no "Any day" option. It offered a merged list of every
 * day's times with nothing to say which time belonged to which day, so the one
 * question it could answer — when can I see this — it answered ambiguously.
 * The film page had already been filtering it out of this list by hand rather
 * than show it.
 */
export function buildDayOptions(count = DAY_COUNT): DayOption[] {
  const now = new Date();
  const options: DayOption[] = [];
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

/**
 * Just the day keys the pickers offer, for loaders that fetch every day up
 * front and let the component choose between them.
 *
 * Typed as never-empty because it is not: buildDayOptions always yields today
 * first. That lets callers treat days[0] as "today" without a non-null
 * assertion at every use, which is the sort of assertion that stops being true
 * quietly.
 */
export function dayKeys(count = DAY_COUNT): [string, ...string[]] {
  const [first, ...rest] = buildDayOptions(count).map((option) => option.value);
  return [first ?? toDayKey(new Date()), ...rest];
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

/**
 * "7:45pm", "07:45 PM" and "19:45" all become minutes past midnight. A 00:20
 * screening returns 20 — there is deliberately no late-night rollover.
 *
 * The source dates every screening by the calendar day it starts on, so a
 * small-hours chip on the 27 Aug tab is 27 Aug 00:20, and is that day's
 * *first* show rather than the tail of the 26th. Verified against a booking
 * link that carries its own date: the 12:00 AM chip on the 27 Aug tab links to
 * `theroxycinemas.com/en/seat-selection/.../27+Aug+2026/00:00/Silver`.
 * cinemauae renders those chips with a `time-chip-late` class and a moon icon —
 * that is decoration, and it does not shift the date. Do not read it as one.
 *
 * This used to add 24 hours to anything before 05:00 so late shows sorted at
 * the end of the evening they "belonged" to. Combined with screeningStartMs it
 * meant a 02:00 screening on today's board resolved to 02:00 *tomorrow*, so it
 * never expired: on the morning of 26 Aug the board offered a 2am screening
 * that had played hours earlier and the chain answered "booking unavailable".
 * Because everything genuinely later that day had also finished, it was often
 * the only chip left, so the day read as though it held one dead show.
 *
 * Both sort sites (lib/cinemas.ts, lib/showtimes.ts) order an already
 * day-filtered list, so plain minutes sort them correctly.
 */
export function timeToMinutes(raw: string): number {
  const match = raw.trim().match(/^(\d{1,2})[:.](\d{2})\s*([ap]\.?m\.?)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toLowerCase();
  if (suffix?.startsWith("p") && hours < 12) hours += 12;
  if (suffix?.startsWith("a") && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/** Dubai is UTC+4 all year — no daylight saving — so a fixed offset is exact. */
const DUBAI_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * The real instant a screening starts, as epoch milliseconds.
 *
 * Straight arithmetic, and it has to stay that way: the day key is the calendar
 * day the screening starts on and the minutes are minutes into that day, so a
 * 00:20 show listed under 12 Aug is 12 Aug at 00:20. Anything that shifts one
 * of the two — a rollover in timeToMinutes, a "cinema day" applied here — makes
 * a small-hours screening resolve to a day later than it plays, and a screening
 * dated in the future can never be over, so it is pinned to the board forever.
 * That is exactly the bug this pair last had.
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
