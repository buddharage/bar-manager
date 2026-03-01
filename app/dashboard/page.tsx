import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { getLocalDateStr, RESTAURANT_TIMEZONE } from "@/lib/sync/timezone";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function daysAgoLabel(dateStr: string): string {
  // Use restaurant timezone so labels are correct even when server is in UTC
  const todayStr = getLocalDateStr(RESTAURANT_TIMEZONE, 0);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [dy, dm, dd] = dateStr.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const dateMs = Date.UTC(dy, dm - 1, dd);
  const diff = Math.round((todayMs - dateMs) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

export default async function DashboardPage() {
  const supabase = createServerClient();

  // Fetch most recent sales day, last 7 days of sales, alerts, inventory summary,
  // top selling items, and latest sync — all in parallel.
  // Use the restaurant's local timezone so date boundaries match the business day.
  const sevenDaysAgoStr = getLocalDateStr(RESTAURANT_TIMEZONE, -7);

  const [
    latestSalesResult,
    recentSalesResult,
    alertsResult,
    syncResult,
    ingredientsSummaryResult,
    topItemsResult,
  ] = await Promise.all([
    // Most recent sales day (fixes the "always empty" bug)
    supabase
      .from("daily_sales")
      .select("*")
      .order("date", { ascending: false })
      .limit(1)
      .single(),
    // Last 7 days for trend
    supabase
      .from("daily_sales")
      .select("date, net_sales, tax_collected, tips")
      .gte("date", sevenDaysAgoStr)
      .order("date", { ascending: true }),
    // Unresolved alerts
    supabase
      .from("inventory_alerts")
      .select("*, inventory_items(name, category), ingredients(name, category)")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(5),
    // Latest sync
    supabase
      .from("sync_logs")
      .select("*")
      .eq("source", "toast")
      .order("started_at", { ascending: false })
      .limit(1)
      .single(),
    // Inventory summary: count ingredients, count below par
    supabase
      .from("ingredients")
      .select("id, par_level, expected_quantity, last_counted_at"),
    // Top selling items from last 7 days
    supabase
      .from("order_items")
      .select("name, quantity, revenue")
      .gte("date", sevenDaysAgoStr)
      .order("quantity", { ascending: false })
      .limit(50),
  ]);

  const latestSales = latestSalesResult.data;
  const recentSales = recentSalesResult.data || [];
  const alerts = alertsResult.data || [];
  const lastSync = syncResult.data;
  const ingredients = ingredientsSummaryResult.data || [];
  const rawTopItems = topItemsResult.data || [];

  // Aggregate top items by name (order_items may have multiple rows per item across dates)
  const topItemsMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const item of rawTopItems) {
    const existing = topItemsMap.get(item.name);
    if (existing) {
      existing.quantity += item.quantity;
      existing.revenue += item.revenue;
    } else {
      topItemsMap.set(item.name, { name: item.name, quantity: item.quantity, revenue: item.revenue });
    }
  }
  const topItems = Array.from(topItemsMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Inventory stats
  const totalIngredients = ingredients.length;
  const countedIngredients = ingredients.filter((i) => i.last_counted_at).length;
  const belowPar = ingredients.filter(
    (i) => i.par_level != null && i.expected_quantity != null && i.expected_quantity <= i.par_level,
  ).length;

  // 7-day trend stats
  const weekNetSales = recentSales.reduce((sum, d) => sum + (d.net_sales || 0), 0);
  const weekTips = recentSales.reduce((sum, d) => sum + (d.tips || 0), 0);
  const maxDailySales = Math.max(...recentSales.map((d) => d.net_sales || 0), 1);

  const hasAnySalesData = latestSales != null;
  const hasAnyInventoryData = totalIngredients > 0;
  const hasAnyOrderData = topItems.length > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {lastSync && (
          <div className="text-sm text-muted-foreground">
            Last Toast sync:{" "}
            <Badge variant={lastSync.status === "success" ? "default" : "destructive"}>
              {lastSync.status}
            </Badge>{" "}
            {new Date(lastSync.started_at).toLocaleString()}
          </div>
        )}
      </div>

      {/* No data at all — guide the user */}
      {!hasAnySalesData && !hasAnyInventoryData && !lastSync && (
        <Card>
          <CardHeader>
            <CardTitle>Welcome to Bar Manager</CardTitle>
            <CardDescription>
              No data has been synced yet. Connect your Toast account and run your first sync to populate the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go to Settings
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Sales KPIs — most recent day with data */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Sales
            </CardTitle>
            {latestSales && (
              <CardDescription className="text-xs">
                {formatDate(latestSales.date)} ({daysAgoLabel(latestSales.date)})
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latestSales ? formatCurrency(latestSales.net_sales) : "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tax Collected
            </CardTitle>
            {latestSales && (
              <CardDescription className="text-xs">
                {formatDate(latestSales.date)} ({daysAgoLabel(latestSales.date)})
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latestSales ? formatCurrency(latestSales.tax_collected) : "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tips
            </CardTitle>
            {latestSales && (
              <CardDescription className="text-xs">
                {formatDate(latestSales.date)} ({daysAgoLabel(latestSales.date)})
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latestSales ? formatCurrency(latestSales.tips) : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 7-Day Sales Trend + Inventory Health side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 7-Day Sales Trend */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>7-Day Sales</CardTitle>
              <Link
                href="/menu/sales"
                className="text-sm text-muted-foreground hover:underline"
              >
                View details
              </Link>
            </div>
            {recentSales.length > 0 && (
              <CardDescription>
                {formatCurrency(weekNetSales)} net &middot; {formatCurrency(weekTips)} tips
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sales data in the last 7 days.
              </p>
            ) : (
              <div className="flex items-end gap-1.5" style={{ height: 80 }}>
                {recentSales.map((day) => {
                  const pct = ((day.net_sales || 0) / maxDailySales) * 100;
                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-sm bg-primary/80"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={`${formatDate(day.date)}: ${formatCurrency(day.net_sales)}`}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inventory Health */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Inventory Health</CardTitle>
              <Link
                href="/inventory"
                className="text-sm text-muted-foreground hover:underline"
              >
                View inventory
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {!hasAnyInventoryData ? (
              <p className="text-sm text-muted-foreground">
                No ingredients tracked yet. Sync recipes to populate inventory.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{totalIngredients}</div>
                  <div className="text-xs text-muted-foreground">Items Tracked</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{countedIngredients}</div>
                  <div className="text-xs text-muted-foreground">Counted</div>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${belowPar > 0 ? "text-destructive" : ""}`}>
                    {belowPar}
                  </div>
                  <div className="text-xs text-muted-foreground">Below Par</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Sellers + Alerts side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Selling Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Top Sellers (7 Days)</CardTitle>
              <Link
                href="/menu/sales"
                className="text-sm text-muted-foreground hover:underline"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {!hasAnyOrderData ? (
              <p className="text-sm text-muted-foreground">
                No order data available yet.
              </p>
            ) : (
              <div className="space-y-3">
                {topItems.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-medium text-muted-foreground w-5 shrink-0">
                        {i + 1}.
                      </span>
                      <span className="text-sm font-medium truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-sm text-muted-foreground">{item.quantity} sold</span>
                      <span className="text-sm font-medium w-20 text-right">
                        {formatCurrency(item.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Inventory Alerts</CardTitle>
              <Link
                href="/inventory/alerts"
                className="text-sm text-muted-foreground hover:underline"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active alerts. All inventory levels are healthy.
              </p>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const itemName =
                    (alert.ingredients as unknown as { name: string })?.name ||
                    (alert.inventory_items as unknown as { name: string })?.name ||
                    `Item #${alert.item_id || alert.ingredient_id}`;
                  return (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{itemName}</div>
                        {alert.message && (
                          <div className="text-xs text-muted-foreground truncate">{alert.message}</div>
                        )}
                      </div>
                      <Badge
                        variant={alert.alert_type === "out_of_stock" ? "destructive" : "default"}
                        className="shrink-0 ml-2"
                      >
                        {alert.alert_type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
