import { createServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default async function DashboardPage() {
  const supabase = createServerClient();

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Fetch today's and yesterday's sales, unresolved alerts, and latest sync in parallel
  const [salesResult, yesterdaySalesResult, alertsResult, syncResult] = await Promise.all([
    supabase.from("daily_sales").select("*").eq("date", today).single(),
    supabase.from("daily_sales").select("*").eq("date", yesterday).single(),
    supabase
      .from("inventory_alerts")
      .select("*, inventory_items(name, category)")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("sync_logs")
      .select("*")
      .eq("source", "toast")
      .order("started_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const todaySales = salesResult.data;
  const yesterdaySales = yesterdaySalesResult.data;
  const alerts = alertsResult.data || [];
  const lastSync = syncResult.data;

  return (
    <div className="p-6 space-y-6">
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

      {/* Sales KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today&apos;s Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {todaySales ? formatCurrency(todaySales.net_sales) : "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Yesterday&apos;s Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {yesterdaySales ? formatCurrency(yesterdaySales.net_sales) : "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tax Collected Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {todaySales ? formatCurrency(todaySales.tax_collected) : "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tips Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {todaySales ? formatCurrency(todaySales.tips) : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

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
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <div className="font-medium">
                      {(alert.inventory_items as unknown as { name: string })?.name || `Item #${alert.item_id}`}
                    </div>
                    <div className="text-sm text-muted-foreground">{alert.message}</div>
                  </div>
                  <Badge
                    variant={alert.alert_type === "out_of_stock" ? "destructive" : "default"}
                  >
                    {alert.alert_type.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
