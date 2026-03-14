"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function daysAgoLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

interface DashboardData {
  latestSales: {
    date: string;
    net_sales: number;
    tax_collected: number;
    tips: number;
    gross_sales: number;
    discounts: number;
  } | null;
  recentSales: { date: string; net_sales: number; tax_collected: number; tips: number }[];
  alerts: {
    id: number;
    alert_type: string;
    message: string | null;
    item_id: number | null;
    ingredient_id: number | null;
    inventory_items?: { name: string } | null;
    ingredients?: { name: string } | null;
  }[];
  lastSync: { status: string; started_at: string } | null;
  ingredients: { id: number; par_level: number | null; expected_quantity: number | null; last_counted_at: string | null }[];
  topItems: { name: string; quantity: number; revenue: number }[];
  queryErrors: string[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || `Failed to load dashboard (${res.status})`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/dashboard", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setSyncMessage(`Sync failed: ${body.error}`);
      } else {
        setSyncMessage(`Synced ${body.total_orders} orders across ${body.days_synced.length} days`);
        // Refresh dashboard data
        await fetchDashboard();
      }
    } catch (err) {
      setSyncMessage(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }, [fetchDashboard]);

  const triggerBackfill = useCallback(async () => {
    setBackfilling(true);
    setSyncMessage(null);
    try {
      const end = new Date();
      end.setDate(end.getDate() - 1); // yesterday
      const start = new Date(end);
      start.setDate(start.getDate() - 89); // 90 days total
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const res = await fetch("/api/sync/toast/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSyncMessage(`Backfill failed: ${body.error}`);
      } else {
        setSyncMessage(`Backfilled ${body.total_orders} orders across ${body.days_processed} days`);
        await fetchDashboard();
      }
    } catch (err) {
      setSyncMessage(`Backfill failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBackfilling(false);
    }
  }, [fetchDashboard]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const topItems = data?.topItems ?? [];

  // Inventory stats
  const totalIngredients = data?.ingredients.length ?? 0;
  const countedIngredients = data?.ingredients.filter((i) => i.last_counted_at).length ?? 0;
  const belowPar = data?.ingredients.filter(
    (i) => i.par_level != null && i.expected_quantity != null && i.expected_quantity <= i.par_level,
  ).length ?? 0;

  // 7-day trend stats
  const recentSales = data?.recentSales ?? [];
  const weekNetSales = recentSales.reduce((sum, d) => sum + (d.net_sales || 0), 0);
  const weekTips = recentSales.reduce((sum, d) => sum + (d.tips || 0), 0);
  const maxDailySales = Math.max(...recentSales.map((d) => d.net_sales || 0), 1);

  const latestSales = data?.latestSales ?? null;
  const lastSync = data?.lastSync ?? null;
  const alerts = data?.alerts ?? [];
  const queryErrors = data?.queryErrors ?? [];
  const hasAnySalesData = latestSales != null;
  const hasAnyInventoryData = totalIngredients > 0;
  const hasAnyOrderData = topItems.length > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold shrink-0">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-3">
          {lastSync && (
            <div className="text-sm text-muted-foreground">
              Last Toast sync:{" "}
              <Badge variant={lastSync.status === "success" ? "default" : "destructive"}>
                {lastSync.status}
              </Badge>{" "}
              {new Date(lastSync.started_at).toLocaleString()}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={triggerBackfill} disabled={backfilling || syncing}>
              {backfilling ? "Backfilling..." : "Backfill 90 Days"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchDashboard} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && !data && (
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      )}

      {/* Sync status message */}
      {syncMessage && (
        <p className={`text-sm ${syncMessage.startsWith("Sync failed") ? "text-destructive" : "text-muted-foreground"}`}>
          {syncMessage}
        </p>
      )}

      {/* Fatal error fetching data */}
      {error && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">
              Failed to load dashboard data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Check that the Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are configured and the database migrations have been applied.
            </p>
            <Button className="mt-3" size="sm" onClick={triggerSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Toast Data (Last 7 Days)"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Database query errors — partial failures */}
      {queryErrors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">
              Some dashboard queries failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-1">
              {queryErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Check that the database migrations have been applied.
            </p>
          </CardContent>
        </Card>
      )}

      {/* No data at all — guide the user */}
      {!loading && !error && !hasAnySalesData && !hasAnyInventoryData && !lastSync && queryErrors.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Welcome to Willy</CardTitle>
            <CardDescription>
              No data has been synced yet. Click below to pull the last 7 days of sales from Toast, or go to Settings to configure your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={triggerSync} disabled={syncing || backfilling}>
              {syncing ? "Syncing Toast data..." : "Sync Toast Data (Last 7 Days)"}
            </Button>
            <Button variant="outline" onClick={triggerBackfill} disabled={backfilling || syncing}>
              {backfilling ? "Backfilling..." : "Backfill 90 Days"}
            </Button>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Go to Settings
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Has sync logs but no sales — sync ran but produced no data */}
      {!loading && !error && !hasAnySalesData && lastSync && queryErrors.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">No Sales Data</CardTitle>
            <CardDescription>
              {lastSync.status === "error"
                ? "The last Toast sync failed. Try syncing again, or check the Toast API credentials in Settings."
                : "A sync has run but no sales data was found. Try syncing the last 7 days to backfill historical data."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={triggerSync} disabled={syncing}>
              {syncing ? "Syncing Toast data..." : "Sync Last 7 Days"}
            </Button>
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
              <div className="space-y-1">
                <div className="flex items-end gap-1.5" style={{ height: 64 }}>
                  {recentSales.map((day) => {
                    const pct = ((day.net_sales || 0) / maxDailySales) * 100;
                    return (
                      <div
                        key={day.date}
                        className="group relative flex-1 rounded-sm bg-primary/80 hover:bg-primary cursor-pointer"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      >
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10">
                          <div className="whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md border">
                            <div className="font-medium">{formatDate(day.date)}</div>
                            <div>{formatCurrency(day.net_sales)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1.5">
                  {recentSales.map((day) => (
                    <span key={day.date} className="flex-1 text-center text-[10px] text-muted-foreground">
                      {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" })}
                    </span>
                  ))}
                </div>
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
                    alert.ingredients?.name ||
                    alert.inventory_items?.name ||
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
