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

  // Aggregate by menu item name
  const grouped = new Map<
    string,
    { name: string; quantity: number; revenue: number }
  >();

  for (const item of data || []) {
    const existing = grouped.get(item.name);
    if (existing) {
      existing.quantity += item.quantity;
      existing.revenue += item.revenue;
    } else {
      grouped.set(item.name, {
        name: item.name,
        quantity: item.quantity,
        revenue: item.revenue,
      });
    }
  }

  const items = Array.from(grouped.values()).sort(
    (a, b) => b.revenue - a.revenue
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
