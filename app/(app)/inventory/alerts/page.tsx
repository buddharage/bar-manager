"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InventoryAlert } from "@/lib/supabase/types";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [reorderSuggestions, setReorderSuggestions] = useState<string | null>(null);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    const supabase = createClient();
    const { data } = await supabase
      .from("inventory_alerts")
      .select("*, inventory_items(name, category, current_stock, par_level, unit), ingredients(name, category, unit, current_quantity, par_level, expected_quantity)")
      .eq("resolved", false)
      .order("created_at", { ascending: false });
    setAlerts((data as unknown as InventoryAlert[]) || []);
    setLoading(false);
  }

  async function resolveAlert(id: number) {
    const supabase = createClient();
    await supabase
      .from("inventory_alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function generateSuggestions() {
    setGeneratingSuggestions(true);
    try {
      const res = await fetch("/api/ai/reorder", { method: "POST" });
      const data = await res.json();
      setReorderSuggestions(data.suggestions);
    } catch {
      setReorderSuggestions("Failed to generate suggestions. Check API key configuration.");
    }
    setGeneratingSuggestions(false);
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading alerts...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory Alerts</h1>
        <Button onClick={generateSuggestions} disabled={generatingSuggestions}>
          {generatingSuggestions ? "Generating..." : "AI Reorder Suggestions"}
        </Button>
      </div>

      {/* AI Suggestions */}
      {reorderSuggestions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">AI Reorder Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-sm">{reorderSuggestions}</div>
          </CardContent>
        </Card>
      )}

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              No active alerts. All inventory levels are healthy.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            // Support both old inventory_items alerts and new ingredient alerts
            const oldItem = alert.inventory_items as unknown as {
              name: string;
              category: string;
              current_stock: number;
              par_level: number;
              unit: string;
            } | undefined;

            const ingredient = alert.ingredients as unknown as {
              name: string;
              category: string | null;
              unit: string | null;
              current_quantity: number;
              par_level: number | null;
              expected_quantity: number | null;
            } | undefined;

            const itemName = ingredient?.name || oldItem?.name || `Item #${alert.item_id || alert.ingredient_id}`;
            const itemCategory = ingredient?.category || oldItem?.category;

            return (
              <Card key={alert.id} className={alert.alert_type === "out_of_stock" ? "border-destructive/50" : ""}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{itemName}</span>
                      <Badge
                        variant={
                          alert.alert_type === "out_of_stock"
                            ? "destructive"
                            : "default"
                        }
                      >
                        {alert.alert_type.replace(/_/g, " ")}
                      </Badge>
                      {itemCategory && (
                        <Badge variant="secondary">{itemCategory}</Badge>
                      )}
                      {alert.ingredient_id && (
                        <Badge variant="secondary">ingredient</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                    {ingredient && (
                      <p className="text-xs text-muted-foreground">
                        Expected: {ingredient.expected_quantity ?? "?"} {ingredient.unit || "units"}
                        {ingredient.par_level != null && (
                          <> | Par: {ingredient.par_level} {ingredient.unit || "units"}</>
                        )}
                      </p>
                    )}
                    {oldItem && !ingredient && (
                      <p className="text-xs text-muted-foreground">
                        Current: {oldItem.current_stock} {oldItem.unit} | Par: {oldItem.par_level}{" "}
                        {oldItem.unit}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resolveAlert(alert.id)}
                  >
                    Resolve
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
