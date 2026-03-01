import { describe, it, expect } from "vitest";
import { getDateRange, type DatePreset } from "./date-filters";

// Helper: create a Date from local components without any UTC ambiguity.
function local(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

describe("getDateRange", () => {
  // ─── "today" ──────────────────────────────────────────────────────
  describe("today", () => {
    it("returns the current local date for both start and end", () => {
      const now = local(2026, 3, 1);
      expect(getDateRange("today", now)).toEqual({
        start: "2026-03-01",
        end: "2026-03-01",
      });
    });

    it("is correct at the very start of a day (midnight)", () => {
      const now = local(2026, 3, 1, 0);
      expect(getDateRange("today", now)).toEqual({
        start: "2026-03-01",
        end: "2026-03-01",
      });
    });

    it("is correct late at night (11pm) — the old UTC bug would shift the date forward", () => {
      // 11pm local in a US timezone is already the next day in UTC.
      // The old toISOString() approach would return the wrong date here.
      const now = new Date(2026, 2, 1, 23, 30, 0); // March 1 at 11:30pm local
      expect(getDateRange("today", now)).toEqual({
        start: "2026-03-01",
        end: "2026-03-01",
      });
    });
  });

  // ─── "yesterday" ──────────────────────────────────────────────────
  describe("yesterday", () => {
    it("returns the previous day", () => {
      const now = local(2026, 3, 1);
      expect(getDateRange("yesterday", now)).toEqual({
        start: "2026-02-28",
        end: "2026-02-28",
      });
    });

    it("is correct late at night — the old UTC bug would shift yesterday to today", () => {
      const now = new Date(2026, 2, 1, 23, 59, 59); // March 1 at 11:59pm local
      expect(getDateRange("yesterday", now)).toEqual({
        start: "2026-02-28",
        end: "2026-02-28",
      });
    });

    it("is correct at midnight", () => {
      const now = new Date(2026, 2, 1, 0, 0, 0); // March 1 at midnight local
      expect(getDateRange("yesterday", now)).toEqual({
        start: "2026-02-28",
        end: "2026-02-28",
      });
    });

    it("crosses month boundary correctly", () => {
      const now = local(2026, 3, 1); // March 1
      const result = getDateRange("yesterday", now);
      expect(result).toEqual({ start: "2026-02-28", end: "2026-02-28" });
    });

    it("crosses year boundary correctly", () => {
      const now = local(2026, 1, 1); // Jan 1
      expect(getDateRange("yesterday", now)).toEqual({
        start: "2025-12-31",
        end: "2025-12-31",
      });
    });

    it("handles leap year correctly (March 1 → Feb 29 in leap year)", () => {
      const now = local(2028, 3, 1); // 2028 is a leap year
      expect(getDateRange("yesterday", now)).toEqual({
        start: "2028-02-29",
        end: "2028-02-29",
      });
    });

    it("handles non-leap year (March 1 → Feb 28)", () => {
      const now = local(2027, 3, 1); // 2027 is not a leap year
      expect(getDateRange("yesterday", now)).toEqual({
        start: "2027-02-28",
        end: "2027-02-28",
      });
    });
  });

  // ─── "past_week" ──────────────────────────────────────────────────
  describe("past_week", () => {
    it("returns 7 days back through today", () => {
      const now = local(2026, 3, 15);
      expect(getDateRange("past_week", now)).toEqual({
        start: "2026-03-08",
        end: "2026-03-15",
      });
    });

    it("crosses month boundary correctly", () => {
      const now = local(2026, 3, 3); // March 3
      expect(getDateRange("past_week", now)).toEqual({
        start: "2026-02-24",
        end: "2026-03-03",
      });
    });

    it("crosses year boundary correctly", () => {
      const now = local(2026, 1, 3); // Jan 3
      expect(getDateRange("past_week", now)).toEqual({
        start: "2025-12-27",
        end: "2026-01-03",
      });
    });

    it("is correct late at night", () => {
      const now = new Date(2026, 2, 15, 23, 59, 59);
      expect(getDateRange("past_week", now)).toEqual({
        start: "2026-03-08",
        end: "2026-03-15",
      });
    });
  });

  // ─── "past_month" ─────────────────────────────────────────────────
  describe("past_month", () => {
    it("returns one calendar month back through today", () => {
      const now = local(2026, 3, 15); // March 15
      expect(getDateRange("past_month", now)).toEqual({
        start: "2026-02-15",
        end: "2026-03-15",
      });
    });

    it("clamps to end-of-month when target month is shorter (Mar 31 → Feb 28)", () => {
      // March 31 minus one month naively gives Feb 31, which JavaScript wraps
      // to March 3. The fix should clamp to Feb 28.
      const now = local(2026, 3, 31);
      const result = getDateRange("past_month", now)!;
      expect(result.start).toBe("2026-02-28");
      expect(result.end).toBe("2026-03-31");
    });

    it("clamps to Feb 29 in a leap year (Mar 31 → Feb 29)", () => {
      const now = local(2028, 3, 31); // 2028 is a leap year
      const result = getDateRange("past_month", now)!;
      expect(result.start).toBe("2028-02-29");
      expect(result.end).toBe("2028-03-31");
    });

    it("handles Jan 31 → Dec 31 correctly (no clamping needed)", () => {
      const now = local(2026, 1, 31);
      expect(getDateRange("past_month", now)).toEqual({
        start: "2025-12-31",
        end: "2026-01-31",
      });
    });

    it("crosses year boundary", () => {
      const now = local(2026, 1, 15); // Jan 15
      expect(getDateRange("past_month", now)).toEqual({
        start: "2025-12-15",
        end: "2026-01-15",
      });
    });

    it("handles May 31 → Apr 30 (clamping needed)", () => {
      const now = local(2026, 5, 31);
      const result = getDateRange("past_month", now)!;
      expect(result.start).toBe("2026-04-30");
      expect(result.end).toBe("2026-05-31");
    });

    it("is correct late at night", () => {
      const now = new Date(2026, 2, 15, 23, 30, 0);
      expect(getDateRange("past_month", now)).toEqual({
        start: "2026-02-15",
        end: "2026-03-15",
      });
    });
  });

  // ─── "last_year" ──────────────────────────────────────────────────
  describe("last_year", () => {
    it("returns full previous calendar year", () => {
      const now = local(2026, 6, 15);
      expect(getDateRange("last_year", now)).toEqual({
        start: "2025-01-01",
        end: "2025-12-31",
      });
    });

    it("is correct on Jan 1 of the current year", () => {
      const now = local(2026, 1, 1);
      expect(getDateRange("last_year", now)).toEqual({
        start: "2025-01-01",
        end: "2025-12-31",
      });
    });

    it("is correct on Dec 31 of the current year", () => {
      const now = local(2026, 12, 31);
      expect(getDateRange("last_year", now)).toEqual({
        start: "2025-01-01",
        end: "2025-12-31",
      });
    });
  });

  // ─── "this_year" ──────────────────────────────────────────────────
  describe("this_year", () => {
    it("returns Jan 1 of current year through today", () => {
      const now = local(2026, 3, 15);
      expect(getDateRange("this_year", now)).toEqual({
        start: "2026-01-01",
        end: "2026-03-15",
      });
    });

    it("start and end are the same on Jan 1", () => {
      const now = local(2026, 1, 1);
      expect(getDateRange("this_year", now)).toEqual({
        start: "2026-01-01",
        end: "2026-01-01",
      });
    });

    it("is correct on Dec 31", () => {
      const now = local(2026, 12, 31);
      expect(getDateRange("this_year", now)).toEqual({
        start: "2026-01-01",
        end: "2026-12-31",
      });
    });

    it("is correct late at night", () => {
      const now = new Date(2026, 2, 15, 23, 59, 59);
      expect(getDateRange("this_year", now)).toEqual({
        start: "2026-01-01",
        end: "2026-03-15",
      });
    });
  });

  // ─── "all_time" and "custom" ──────────────────────────────────────
  describe("all_time", () => {
    it("returns null", () => {
      expect(getDateRange("all_time")).toBeNull();
    });
  });

  describe("custom", () => {
    it("returns null", () => {
      expect(getDateRange("custom")).toBeNull();
    });
  });

  // ─── Regression tests for the original UTC bug ────────────────────
  describe("UTC regression", () => {
    it("today filter late at night does NOT return tomorrow's date", () => {
      // In EST (UTC-5), 11pm on March 1 = 4am March 2 in UTC.
      // The old toISOString() code would return "2026-03-02" here.
      const now = new Date(2026, 2, 1, 23, 0, 0);
      const result = getDateRange("today", now)!;
      expect(result.start).toBe("2026-03-01");
      expect(result.end).toBe("2026-03-01");
    });

    it("yesterday filter late at night does NOT return today's date", () => {
      // The old code: today in UTC is March 2, yesterday in UTC is March 1.
      // But the user's local date is still March 1, so yesterday should be Feb 28.
      const now = new Date(2026, 2, 1, 23, 0, 0);
      const result = getDateRange("yesterday", now)!;
      expect(result.start).toBe("2026-02-28");
      expect(result.end).toBe("2026-02-28");
    });

    it("past_week end date late at night does NOT shift forward", () => {
      const now = new Date(2026, 2, 1, 23, 0, 0);
      const result = getDateRange("past_week", now)!;
      expect(result.end).toBe("2026-03-01");
      expect(result.start).toBe("2026-02-22");
    });

    it("this_year end date late at night does NOT shift forward", () => {
      const now = new Date(2026, 2, 1, 23, 0, 0);
      const result = getDateRange("this_year", now)!;
      expect(result.end).toBe("2026-03-01");
    });
  });

  // ─── Zero-padding ─────────────────────────────────────────────────
  describe("date formatting", () => {
    it("zero-pads single-digit months", () => {
      const now = local(2026, 1, 15);
      const result = getDateRange("today", now)!;
      expect(result.start).toBe("2026-01-15");
    });

    it("zero-pads single-digit days", () => {
      const now = local(2026, 3, 5);
      const result = getDateRange("today", now)!;
      expect(result.start).toBe("2026-03-05");
    });
  });
});
