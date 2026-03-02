import { describe, it, expect } from "vitest";
import { getDateRange, type DatePreset } from "./date-filters";

// Helper: create a Date in UTC so tests are timezone-independent.
// All tests pass tz="UTC" to getDateRange for deterministic results.
function utc(year: number, month: number, day: number, hour = 12): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0));
}

const TZ = "UTC";

describe("getDateRange", () => {
  // ─── "yesterday" ──────────────────────────────────────────────────
  describe("yesterday", () => {
    it("returns the previous day", () => {
      const now = utc(2026, 3, 1);
      expect(getDateRange("yesterday", now, TZ)).toEqual({
        start: "2026-02-28",
        end: "2026-02-28",
      });
    });

    it("is correct late at night — the old UTC bug would shift yesterday to today", () => {
      const now = utc(2026, 3, 1, 23);
      expect(getDateRange("yesterday", now, TZ)).toEqual({
        start: "2026-02-28",
        end: "2026-02-28",
      });
    });

    it("is correct at midnight", () => {
      const now = utc(2026, 3, 1, 0);
      expect(getDateRange("yesterday", now, TZ)).toEqual({
        start: "2026-02-28",
        end: "2026-02-28",
      });
    });

    it("crosses month boundary correctly", () => {
      const now = utc(2026, 3, 1); // March 1
      const result = getDateRange("yesterday", now, TZ);
      expect(result).toEqual({ start: "2026-02-28", end: "2026-02-28" });
    });

    it("crosses year boundary correctly", () => {
      const now = utc(2026, 1, 1); // Jan 1
      expect(getDateRange("yesterday", now, TZ)).toEqual({
        start: "2025-12-31",
        end: "2025-12-31",
      });
    });

    it("handles leap year correctly (March 1 → Feb 29 in leap year)", () => {
      const now = utc(2028, 3, 1); // 2028 is a leap year
      expect(getDateRange("yesterday", now, TZ)).toEqual({
        start: "2028-02-29",
        end: "2028-02-29",
      });
    });

    it("handles non-leap year (March 1 → Feb 28)", () => {
      const now = utc(2027, 3, 1); // 2027 is not a leap year
      expect(getDateRange("yesterday", now, TZ)).toEqual({
        start: "2027-02-28",
        end: "2027-02-28",
      });
    });
  });

  // ─── "past_week" ──────────────────────────────────────────────────
  describe("past_week", () => {
    it("returns 7 days back through today", () => {
      const now = utc(2026, 3, 15);
      expect(getDateRange("past_week", now, TZ)).toEqual({
        start: "2026-03-08",
        end: "2026-03-15",
      });
    });

    it("crosses month boundary correctly", () => {
      const now = utc(2026, 3, 3); // March 3
      expect(getDateRange("past_week", now, TZ)).toEqual({
        start: "2026-02-24",
        end: "2026-03-03",
      });
    });

    it("crosses year boundary correctly", () => {
      const now = utc(2026, 1, 3); // Jan 3
      expect(getDateRange("past_week", now, TZ)).toEqual({
        start: "2025-12-27",
        end: "2026-01-03",
      });
    });

    it("is correct late at night", () => {
      const now = utc(2026, 3, 15, 23);
      expect(getDateRange("past_week", now, TZ)).toEqual({
        start: "2026-03-08",
        end: "2026-03-15",
      });
    });
  });

  // ─── "past_month" ─────────────────────────────────────────────────
  describe("past_month", () => {
    it("returns one calendar month back through today", () => {
      const now = utc(2026, 3, 15); // March 15
      expect(getDateRange("past_month", now, TZ)).toEqual({
        start: "2026-02-15",
        end: "2026-03-15",
      });
    });

    it("clamps to end-of-month when target month is shorter (Mar 31 → Feb 28)", () => {
      const now = utc(2026, 3, 31);
      const result = getDateRange("past_month", now, TZ)!;
      expect(result.start).toBe("2026-02-28");
      expect(result.end).toBe("2026-03-31");
    });

    it("clamps to Feb 29 in a leap year (Mar 31 → Feb 29)", () => {
      const now = utc(2028, 3, 31); // 2028 is a leap year
      const result = getDateRange("past_month", now, TZ)!;
      expect(result.start).toBe("2028-02-29");
      expect(result.end).toBe("2028-03-31");
    });

    it("handles Jan 31 → Dec 31 correctly (no clamping needed)", () => {
      const now = utc(2026, 1, 31);
      expect(getDateRange("past_month", now, TZ)).toEqual({
        start: "2025-12-31",
        end: "2026-01-31",
      });
    });

    it("crosses year boundary", () => {
      const now = utc(2026, 1, 15); // Jan 15
      expect(getDateRange("past_month", now, TZ)).toEqual({
        start: "2025-12-15",
        end: "2026-01-15",
      });
    });

    it("handles May 31 → Apr 30 (clamping needed)", () => {
      const now = utc(2026, 5, 31);
      const result = getDateRange("past_month", now, TZ)!;
      expect(result.start).toBe("2026-04-30");
      expect(result.end).toBe("2026-05-31");
    });

    it("is correct late at night", () => {
      const now = utc(2026, 3, 15, 23);
      expect(getDateRange("past_month", now, TZ)).toEqual({
        start: "2026-02-15",
        end: "2026-03-15",
      });
    });
  });

  // ─── "last_year" ──────────────────────────────────────────────────
  describe("last_year", () => {
    it("returns full previous calendar year", () => {
      const now = utc(2026, 6, 15);
      expect(getDateRange("last_year", now, TZ)).toEqual({
        start: "2025-01-01",
        end: "2025-12-31",
      });
    });

    it("is correct on Jan 1 of the current year", () => {
      const now = utc(2026, 1, 1);
      expect(getDateRange("last_year", now, TZ)).toEqual({
        start: "2025-01-01",
        end: "2025-12-31",
      });
    });

    it("is correct on Dec 31 of the current year", () => {
      const now = utc(2026, 12, 31);
      expect(getDateRange("last_year", now, TZ)).toEqual({
        start: "2025-01-01",
        end: "2025-12-31",
      });
    });
  });

  // ─── "this_year" ──────────────────────────────────────────────────
  describe("this_year", () => {
    it("returns Jan 1 of current year through today", () => {
      const now = utc(2026, 3, 15);
      expect(getDateRange("this_year", now, TZ)).toEqual({
        start: "2026-01-01",
        end: "2026-03-15",
      });
    });

    it("start and end are the same on Jan 1", () => {
      const now = utc(2026, 1, 1);
      expect(getDateRange("this_year", now, TZ)).toEqual({
        start: "2026-01-01",
        end: "2026-01-01",
      });
    });

    it("is correct on Dec 31", () => {
      const now = utc(2026, 12, 31);
      expect(getDateRange("this_year", now, TZ)).toEqual({
        start: "2026-01-01",
        end: "2026-12-31",
      });
    });

    it("is correct late at night", () => {
      const now = utc(2026, 3, 15, 23);
      expect(getDateRange("this_year", now, TZ)).toEqual({
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

  // ─── Timezone-aware tests ─────────────────────────────────────────
  describe("timezone awareness", () => {
    it("yesterday uses restaurant timezone, not machine timezone", () => {
      // 11:30 PM ET on March 1 = 4:30 AM UTC on March 2
      // In ET, today is March 1, so yesterday should be Feb 28.
      const utcMarch2Morning = new Date(Date.UTC(2026, 2, 2, 4, 30, 0));
      const result = getDateRange("yesterday", utcMarch2Morning, "America/New_York")!;
      expect(result.start).toBe("2026-02-28");
      expect(result.end).toBe("2026-02-28");
    });

    it("past_week end date aligns with restaurant timezone", () => {
      // 1:00 AM ET on March 2 = 6:00 AM UTC on March 2
      const utcMarch2 = new Date(Date.UTC(2026, 2, 2, 6, 0, 0));
      const result = getDateRange("past_week", utcMarch2, "America/New_York")!;
      expect(result.end).toBe("2026-03-02");
      expect(result.start).toBe("2026-02-23");
    });
  });

  // ─── Zero-padding ─────────────────────────────────────────────────
  describe("date formatting", () => {
    it("zero-pads single-digit months", () => {
      const now = utc(2026, 1, 15);
      const result = getDateRange("yesterday", now, TZ)!;
      expect(result.start).toBe("2026-01-14");
    });

    it("zero-pads single-digit days", () => {
      const now = utc(2026, 3, 6);
      const result = getDateRange("yesterday", now, TZ)!;
      expect(result.start).toBe("2026-03-05");
    });
  });
});
