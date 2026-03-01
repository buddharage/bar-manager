import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequest } from "@/lib/auth/session";
import { fetchAllMenuLookups } from "@/lib/integrations/toast-client";
import { syncOrdersForDate } from "@/lib/sync/toast-orders";
import { recalculateExpectedInventory } from "@/lib/inventory/expected";
import { getLocalDateStr, RESTAURANT_TIMEZONE } from "@/lib/sync/timezone";

// Maximum number of days to backfill in a single request to avoid timeouts
const MAX_DAYS = 90;

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Backfill Toast order data for a date range.
 *
 * POST /api/sync/toast/backfill
 * Body: { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }
 *
 * Both dates are inclusive. Maximum range is 90 days per request.
 * Existing data for each date is overwritten (upsert/replace).
 */
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { startDate, endDate } = body;

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "startDate and endDate are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }

  if (end < start) {
    return NextResponse.json(
      { error: "endDate must be on or after startDate" },
      { status: 400 }
    );
  }

  // Don't allow syncing today or future dates — data won't be complete
  const maxDate = getLocalDateStr(RESTAURANT_TIMEZONE, -1);
  if (endDate > maxDate) {
    return NextResponse.json(
      { error: `endDate cannot be after yesterday (${maxDate}). Today's data is not yet complete.` },
      { status: 400 }
    );
  }

  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (diffDays > MAX_DAYS) {
    return NextResponse.json(
      { error: `Date range too large (${diffDays} days). Maximum is ${MAX_DAYS} days per request.` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Create sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ source: "toast", status: "started" })
    .select()
    .single();

  try {
    // Fetch menu data once for all days (single /menus/v2/menus call)
    const { categoryMap, sizeGroupGuids } = await fetchAllMenuLookups();

    let totalRecords = 0;
    let totalOrders = 0;
    const results: { date: string; orders: number; records: number }[] = [];

    // Process each day sequentially to avoid overwhelming the Toast API
    const current = new Date(start);
    while (current <= end) {
      const dateStr = formatDate(current);
      const { records, ordersProcessed } = await syncOrdersForDate(
        supabase,
        dateStr,
        categoryMap,
        sizeGroupGuids,
        RESTAURANT_TIMEZONE,
      );
      totalRecords += records;
      totalOrders += ordersProcessed;
      results.push({ date: dateStr, orders: ordersProcessed, records });
      current.setDate(current.getDate() + 1);
    }

    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "success",
          records_synced: totalRecords,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    // Recalculate expected inventory after backfill
    const expectedResult = await recalculateExpectedInventory(supabase);

    return NextResponse.json({
      success: true,
      days_processed: results.length,
      total_records: totalRecords,
      total_orders: totalOrders,
      expected_inventory_updated: expectedResult.updated,
      results,
    });
  } catch (error) {
    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "error",
          error: String(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    console.error("Toast backfill error:", error);
    return NextResponse.json(
      { error: "Backfill failed", details: String(error) },
      { status: 500 }
    );
  }
}
