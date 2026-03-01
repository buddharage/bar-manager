export type DatePreset =
  | "today"
  | "yesterday"
  | "past_week"
  | "past_month"
  | "last_year"
  | "this_year"
  | "all_time"
  | "custom";

/**
 * Format a Date as YYYY-MM-DD using **local** time components.
 *
 * The previous implementation used `toISOString().split("T")[0]` which converts
 * to UTC first. In any timezone west of UTC (e.g. US timezones), this shifts
 * the date forward — so "yesterday" could actually return today's UTC date, and
 * "today" could return tomorrow's UTC date.
 */
function fmtLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDateRange(
  preset: DatePreset,
  now: Date = new Date()
): { start: string; end: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return { start: fmtLocal(today), end: fmtLocal(today) };

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
