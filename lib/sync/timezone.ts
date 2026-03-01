/**
 * Timezone utilities for aligning Toast sync with the restaurant's local time.
 *
 * Toast orders and daily sales should use the restaurant's business day
 * (local time), not UTC. These helpers convert between local dates and
 * the UTC ranges that the Toast API expects.
 */

export const RESTAURANT_TIMEZONE =
  process.env.RESTAURANT_TIMEZONE || "America/New_York";

/**
 * Get a YYYY-MM-DD date string in the given timezone, optionally offset
 * by a number of days (e.g., -1 for yesterday).
 */
export function getLocalDateStr(tz: string, daysOffset = 0): string {
  const now = new Date();
  // en-CA locale produces YYYY-MM-DD format
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  if (daysOffset === 0) return todayStr;

  const [y, m, d] = todayStr.split("-").map(Number);
  const adjusted = new Date(y, m - 1, d + daysOffset);
  return formatDate(adjusted);
}

/**
 * Get the UTC start and end timestamps for a calendar date in the given
 * timezone. Returns ISO 8601 strings with +0000 offset for the Toast API.
 *
 * Example (EST, UTC-5):
 *   getLocalDayUTCRange("2026-02-28", "America/New_York")
 *   -> start: "2026-02-28T05:00:00.000+0000"  (midnight ET in UTC)
 *   -> end:   "2026-03-01T04:59:59.999+0000"   (23:59:59 ET in UTC)
 */
export function getLocalDayUTCRange(
  dateStr: string,
  tz: string,
): { start: string; end: string } {
  const startUTC = localToUTC(dateStr, "00:00:00.000", tz);
  const endUTC = localToUTC(dateStr, "23:59:59.999", tz);

  return {
    start: startUTC.toISOString().replace("Z", "+0000"),
    end: endUTC.toISOString().replace("Z", "+0000"),
  };
}

// -- internal helpers -------------------------------------------------------

/**
 * Convert a local date+time in the given timezone to a UTC Date.
 * Handles DST transitions correctly by computing the offset at the
 * approximate UTC instant and adjusting.
 */
function localToUTC(dateStr: string, timeStr: string, tz: string): Date {
  // Treat the local time as if it were UTC to get a reference point
  const guess = new Date(`${dateStr}T${timeStr}Z`);
  // Compute the offset between UTC and the target timezone at this instant
  const offsetMs = utcOffsetAt(guess, tz);
  // local + offset = UTC
  return new Date(guess.getTime() + offsetMs);
}

/** UTC offset in ms at a given instant. Positive = local is behind UTC. */
function utcOffsetAt(instant: Date, tz: string): number {
  const utc = dateParts(instant, "UTC");
  const local = dateParts(instant, tz);

  const utcMs = Date.UTC(utc.y, utc.m - 1, utc.d, utc.h, utc.min, utc.s);
  const localMs = Date.UTC(
    local.y,
    local.m - 1,
    local.d,
    local.h,
    local.min,
    local.s,
  );

  return utcMs - localMs;
}

function dateParts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const p = f.formatToParts(date);
  const g = (t: string) =>
    parseInt(p.find((x) => x.type === t)?.value || "0");
  return {
    y: g("year"),
    m: g("month"),
    d: g("day"),
    h: g("hour"),
    min: g("minute"),
    s: g("second"),
  };
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
