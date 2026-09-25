export type TimeOptions = { locale?: string; timeZone?: string };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function year(time: Date, timeZone: string | undefined) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).format(time);
}

function count(value: number, unit: "minute" | "hour", locale: string | undefined) {
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "narrow" }).format(
    value,
  );
}

/**
 * A time in a feed: "now", "2m", "3h", then the date, "Sep 12", with the year when it isn't this
 * year. A time slightly in the future, from a clock that runs fast, reads "now".
 */
export function formatRelativeTime(
  time: Date,
  now: Date,
  { locale, timeZone }: TimeOptions = {},
): string {
  const elapsed = now.getTime() - time.getTime();
  if (elapsed < MINUTE) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  }
  if (elapsed < HOUR) {
    return count(Math.floor(elapsed / MINUTE), "minute", locale);
  }
  if (elapsed < DAY) {
    return count(Math.floor(elapsed / HOUR), "hour", locale);
  }
  const sameYear = year(time, timeZone) === year(now, timeZone);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone,
  }).format(time);
}

/** The exact time, for a tooltip: "Sep 12, 2026, 2:03 PM". */
export function formatExactTime(time: Date, { locale, timeZone }: TimeOptions = {}): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(time);
}
