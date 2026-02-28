import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/session";

// Normalize item names so that variants of the same product are aggregated.
// Each product can appear in three forms on the Toast menu:
//   "Item Name"  /  "Item Name (Happy Hour)"  /  "Item Name and a Shot"
// All three should roll up under the base "Item Name".
function normalizeItemName(name: string, category?: string): string {
  const lower = name.toLowerCase();

  // Beer variants — name always contains the base product name
  if (lower.includes("miller high life")) return "Miller High Life";
  if (lower.includes("tecate")) return "Tecate";
  if (lower.includes("corona")) return "Corona";

  // Wine variants — strip the (Happy Hour) / and a Shot suffixes so each
  // wine type (e.g. "Pinot Grigio") keeps its own row.
  if (category?.toLowerCase() === "wine") {
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
  const grouped = new Map<
    string,
    { name: string; category: string; quantity: number; revenue: number }
  >();

  for (const item of data || []) {
    const rawCategory = categoryMap.get(item.name) || "Uncategorized";
    const canonicalName = normalizeItemName(item.name, rawCategory);
    const existing = grouped.get(canonicalName);
    if (existing) {
      existing.quantity += item.quantity;
      existing.revenue += item.revenue;
    } else {
      grouped.set(canonicalName, {
        name: canonicalName,
        category: categoryMap.get(canonicalName) || rawCategory,
        quantity: item.quantity,
        revenue: item.revenue,
      });
    }
  }

  const items = Array.from(grouped.values()).sort(
    (a, b) => b.quantity - a.quantity
  );

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
