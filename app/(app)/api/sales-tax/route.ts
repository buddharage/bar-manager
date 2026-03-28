import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/session";
import { computeST100, type ST100Worksheet } from "@/lib/tax/st100";

export interface WeeklyTaxRow {
  weekStart: string; // Thu
  weekEnd: string; // Wed
  grossSales: number;
  taxableSales: number;
  taxCollected: number;
  totalTaxDue: number;
  variance: number;
  stateTaxDue: number;
  cityTaxDue: number;
  mctdTaxDue: number;
}

/**
 * Generate Thu–Wed week boundaries from a start date to an end date.
 * Each week starts on Thursday and ends on Wednesday.
 */
function generateWeeks(start: Date, end: Date): Array<{ start: string; end: string }> {
  const weeks: Array<{ start: string; end: string }> = [];

  // Find the first Thursday on or before `end`
  const cursor = new Date(end);
  // Move cursor to the Thursday of this week
  const day = cursor.getDay(); // 0=Sun..6=Sat
  // Thursday = 4. Days since last Thursday:
  const daysSinceThursday = (day + 7 - 4) % 7;
  cursor.setDate(cursor.getDate() - daysSinceThursday);

  while (cursor >= start) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6); // Wed

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    weeks.push({ start: fmt(weekStart), end: fmt(weekEnd) });

    // Move back one week
    cursor.setDate(cursor.getDate() - 7);
  }

  return weeks; // most recent first
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Get the range of available sales data
  const { data: rangeData, error: rangeError } = await supabase
    .from("daily_sales")
    .select("date")
    .order("date", { ascending: true })
    .limit(1);

  if (rangeError) {
    return NextResponse.json({ error: rangeError.message }, { status: 500 });
  }

  if (!rangeData || rangeData.length === 0) {
    return NextResponse.json({ weeks: [] });
  }

  const earliestDate = new Date(rangeData[0].date + "T00:00:00");
  const today = new Date();

  const weeks = generateWeeks(earliestDate, today);

  // Fetch all daily_sales in the full range
  const { data: allSales, error: salesError } = await supabase
    .from("daily_sales")
    .select("date, gross_sales, net_sales, tax_collected")
    .gte("date", weeks[weeks.length - 1]?.start || rangeData[0].date)
    .lte("date", weeks[0]?.end || today.toISOString().slice(0, 10))
    .order("date");

  if (salesError) {
    return NextResponse.json({ error: salesError.message }, { status: 500 });
  }

  // Index sales by date
  const salesByDate = new Map<string, { gross_sales: number | null; net_sales: number | null; tax_collected: number | null }>();
  for (const row of allSales || []) {
    salesByDate.set(row.date, row);
  }

  // Compute ST-100 for each week
  const weeklyRows: WeeklyTaxRow[] = weeks.map((week) => {
    const salesInWeek: Array<{ gross_sales: number | null; net_sales: number | null; tax_collected: number | null }> = [];

    const cur = new Date(week.start + "T00:00:00");
    const end = new Date(week.end + "T00:00:00");
    while (cur <= end) {
      const dateStr = cur.toISOString().slice(0, 10);
      const sale = salesByDate.get(dateStr);
      if (sale) salesInWeek.push(sale);
      cur.setDate(cur.getDate() + 1);
    }

    if (salesInWeek.length === 0) {
      return {
        weekStart: week.start,
        weekEnd: week.end,
        grossSales: 0,
        taxableSales: 0,
        taxCollected: 0,
        totalTaxDue: 0,
        variance: 0,
        stateTaxDue: 0,
        cityTaxDue: 0,
        mctdTaxDue: 0,
      };
    }

    const worksheet: ST100Worksheet = computeST100(salesInWeek);
    return {
      weekStart: week.start,
      weekEnd: week.end,
      grossSales: worksheet.grossSales,
      taxableSales: worksheet.taxableSales,
      taxCollected: worksheet.taxCollected,
      totalTaxDue: worksheet.totalTaxDue,
      variance: worksheet.variance,
      stateTaxDue: worksheet.stateTaxDue,
      cityTaxDue: worksheet.cityTaxDue,
      mctdTaxDue: worksheet.mctdTaxDue,
    };
  });

  // Also compute running totals
  const totalCollected = weeklyRows.reduce((s, w) => s + w.taxCollected, 0);
  const totalDue = weeklyRows.reduce((s, w) => s + w.totalTaxDue, 0);

  return NextResponse.json({
    weeks: weeklyRows,
    summary: {
      totalCollected: Math.round(totalCollected * 100) / 100,
      totalDue: Math.round(totalDue * 100) / 100,
      totalVariance: Math.round((totalCollected - totalDue) * 100) / 100,
    },
  });
}
