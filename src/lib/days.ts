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
