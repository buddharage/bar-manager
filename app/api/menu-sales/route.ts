import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/session";

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

  // Aggregate by (name, size) so different sizes are separate rows.
  // Category comes directly from the order_items row; fall back to
  // inventory_items only for legacy rows that pre-date migration 003.
  const grouped = new Map<
    string,
    { name: string; category: string; size: string | null; quantity: number; revenue: number }
  >();

  // Build a fallback name→category map from inventory_items for old rows
  const { data: inventoryItems } = await supabase
    .from("inventory_items")
    .select("name, category");

  const inventoryCategoryMap = new Map<string, string>();
  for (const inv of inventoryItems || []) {
    if (inv.name && inv.category) {
      inventoryCategoryMap.set(inv.name, inv.category);
    }
  }

  for (const item of data || []) {
    const size = item.size || null;
    const key = `${item.name}||${size}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.revenue += item.revenue;
    } else {
      grouped.set(key, {
        name: item.name,
        category: item.category || inventoryCategoryMap.get(item.name) || "Uncategorized",
        size,
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
