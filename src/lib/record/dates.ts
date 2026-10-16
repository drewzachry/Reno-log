import type { ISODate } from "./types";

// Dates without times are handled as plain calendar days ("2026-11-03"),
// never as instants, so time zones can't shift them.

function toDays(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day) / 86_400_000;
}

function fromDays(n: number): ISODate {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromDays(toDays(d) + n);
}

/** Whole days from `today` to `d`; negative when `d` is past. */
export function daysBetween(today: ISODate, d: ISODate): number {
  return toDays(d) - toDays(today);
}

/** Today's date where the person is, from an IANA time zone. */
export function todayIn(timeZone: string | undefined, now = new Date()): ISODate {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Nov 3", or "—" when there's no date. */
export function shortDate(d: ISODate | null | undefined): string {
  return d ? SHORT.format(new Date(`${d}T00:00:00Z`)) : "—";
}
