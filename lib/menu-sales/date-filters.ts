export type DatePreset =
  | "yesterday"
  | "past_week"
  | "past_2_weeks"
  | "past_month"
  | "last_year"
  | "this_year"
  | "all_time"
  | "custom";

/**
 * Format a Date as YYYY-MM-DD using **local** time components.
 */
function fmtLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Default restaurant timezone. Uses the same value as lib/sync/timezone.ts
 * (duplicated here to avoid importing a server module into client code).
 */
const RESTAURANT_TZ = "America/New_York";

export function getDateRange(
  preset: DatePreset,
  now: Date = new Date(),
  tz: string = RESTAURANT_TZ,
): { start: string; end: string } | null {
  // Determine "today" in the restaurant's timezone so that date presets
  // (e.g. "yesterday") align with the restaurant's local calendar day,
  // regardless of the browser or server timezone.
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);

  switch (preset) {
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: fmtLocal(y), end: fmtLocal(y) };
    }

    case "past_week": {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      return { start: fmtLocal(w), end: fmtLocal(today) };
    }

    case "past_2_weeks": {
      const w2 = new Date(today);
      w2.setDate(w2.getDate() - 14);
      return { start: fmtLocal(w2), end: fmtLocal(today) };
    }

    case "past_month": {
      // Go back one calendar month. If the target month has fewer days than the
      // current day-of-month, JavaScript rolls forward into the next month
      // (e.g. Mar 31 → setMonth(1) → Mar 3). Detect that and clamp to the last
      // day of the target month instead.
      const m = new Date(today);
      const targetMonth = m.getMonth() - 1;
      m.setMonth(targetMonth);
      if (m.getMonth() !== ((targetMonth % 12) + 12) % 12) {
        // Overflow happened — set to last day of the intended month.
        m.setDate(0);
      }
      return { start: fmtLocal(m), end: fmtLocal(today) };
    }

    case "last_year": {
      const ly = today.getFullYear() - 1;
      return { start: `${ly}-01-01`, end: `${ly}-12-31` };
    }

    case "this_year":
      return { start: `${today.getFullYear()}-01-01`, end: fmtLocal(today) };

    case "all_time":
      return null;

    case "custom":
      return null;
  }
}
