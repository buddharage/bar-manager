import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/session";
import { getLocalDateStr, RESTAURANT_TIMEZONE } from "@/lib/sync/timezone";

export async function GET(request: NextRequest) {
  // Verify session
  const token = request.cookies.get("session")?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate required env vars before creating client
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_SUPABASE_URL is not configured" },
      { status: 500 }
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const supabase = createServerClient();
    const sevenDaysAgoStr = getLocalDateStr(RESTAURANT_TIMEZONE, -7);

    const [
      latestSalesResult,
      recentSalesResult,
      alertsResult,
      syncResult,
      ingredientsSummaryResult,
      topItemsResult,
    ] = await Promise.all([
      supabase
        .from("daily_sales")
        .select("*")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("daily_sales")
        .select("date, net_sales, tax_collected, tips")
        .gte("date", sevenDaysAgoStr)
        .order("date", { ascending: true }),
      supabase
        .from("inventory_alerts")
        .select("*, inventory_items(name, category), ingredients(name, category)")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("sync_logs")
        .select("*")
        .eq("source", "toast")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("ingredients")
        .select("id, par_level, expected_quantity, last_counted_at"),
      supabase
        .from("order_items")
        .select("name, quantity, revenue")
        .gte("date", sevenDaysAgoStr)
        .order("quantity", { ascending: false })
        .limit(50),
    ]);

    // Collect query errors
    const queryErrors: string[] = [];
    if (latestSalesResult.error) queryErrors.push(`Sales: ${latestSalesResult.error.message}`);
    if (recentSalesResult.error) queryErrors.push(`7-day trend: ${recentSalesResult.error.message}`);
    if (alertsResult.error) queryErrors.push(`Alerts: ${alertsResult.error.message}`);
    if (syncResult.error) queryErrors.push(`Sync log: ${syncResult.error.message}`);
    if (ingredientsSummaryResult.error) queryErrors.push(`Ingredients: ${ingredientsSummaryResult.error.message}`);
    if (topItemsResult.error) queryErrors.push(`Top items: ${topItemsResult.error.message}`);

    return NextResponse.json({
      latestSales: latestSalesResult.data,
      recentSales: recentSalesResult.data || [],
      alerts: alertsResult.data || [],
      lastSync: syncResult.data,
      ingredients: ingredientsSummaryResult.data || [],
      topItems: topItemsResult.data || [],
      queryErrors,
    });
  } catch (err) {
    console.error("Dashboard API error:", err);
    return NextResponse.json(
      { error: `Dashboard data fetch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
