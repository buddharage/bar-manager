import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/session";

// Normalize item names so that variants of the same product are aggregated.
// Each product can appear in three forms on the Toast menu:
//   "Item Name"  /  "Item Name (Happy Hour)"  /  "Item Name and a Shot"
// All three should roll up under the base "Item Name".
// This applies to specific beers (Miller High Life, Tecate, Corona)
// and all wine-category items.
function normalizeItemName(name: string, category?: string): string {
  const lowerCat = category?.toLowerCase();

  if (lowerCat === "wine" || lowerCat === "beer") {
    return name
      .replace(/\s*\(Happy Hour\)\s*$/i, "")
      .replace(/\s+and a Shot\s*$/i, "")
      .trim();
  }

  return name;
}

export async function GET(request: NextRequest) {
  // Verify session
  const token = request.cookies.get("session")?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const supabase = createServerClient();

  let query = supabase.from("order_items").select("*");

  if (startDate) {
    query = query.gte("date", startDate);
  }
  if (endDate) {
    query = query.lte("date", endDate);
  }

  const { data, error } = await query.order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch category mapping from inventory_items
  const { data: inventoryItems } = await supabase
    .from("inventory_items")
    .select("name, category");

  const categoryMap = new Map<string, string>();
  for (const inv of inventoryItems || []) {
    if (inv.name && inv.category) {
      categoryMap.set(inv.name, inv.category);
    }
  }

  // Aggregate by normalized menu item name so that variants (e.g. happy-hour
  // pricing, combo items) are rolled up under a single canonical name.
  // Sub-items are tracked so the UI can show the breakdown.
  const grouped = new Map<
    string,
    {
      name: string;
      category: string;
      quantity: number;
      revenue: number;
      subItems: Map<string, { name: string; quantity: number; revenue: number }>;
    }
  >();

  for (const item of data || []) {
    const rawCategory = categoryMap.get(item.name) || "Uncategorized";
    const canonicalName = normalizeItemName(item.name, rawCategory);
    const existing = grouped.get(canonicalName);
    if (existing) {
      existing.quantity += item.quantity;
      existing.revenue += item.revenue;
      const sub = existing.subItems.get(item.name);
      if (sub) {
        sub.quantity += item.quantity;
        sub.revenue += item.revenue;
      } else {
        existing.subItems.set(item.name, {
          name: item.name,
          quantity: item.quantity,
          revenue: item.revenue,
        });
      }
    } else {
      grouped.set(canonicalName, {
        name: canonicalName,
        category: categoryMap.get(canonicalName) || rawCategory,
        quantity: item.quantity,
        revenue: item.revenue,
        subItems: new Map([[item.name, { name: item.name, quantity: item.quantity, revenue: item.revenue }]]),
      });
    }
  }

  const items = Array.from(grouped.values())
    .map((g) => {
      const subItems = Array.from(g.subItems.values()).sort(
        (a, b) => b.quantity - a.quantity
      );
      const isAggregated = subItems.length > 1;
      return {
        name: isAggregated ? `${g.name} (aggregated)` : g.name,
        category: g.category,
        quantity: g.quantity,
        revenue: g.revenue,
        ...(isAggregated ? { subItems } : {}),
      };
    })
    .sort((a, b) => b.quantity - a.quantity);

  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalRevenue = items.reduce((sum, i) => sum + i.revenue, 0);

  return NextResponse.json({
    items,
    summary: {
      uniqueItems: items.length,
      totalQuantity,
      totalRevenue,
    },
  });
}
