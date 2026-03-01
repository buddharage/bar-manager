import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Get distinct menu item names from order_items for autocomplete
  const { data, error } = await supabase
    .from("order_items")
    .select("name")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate
  const names = [...new Set((data || []).map((item) => item.name))].sort();

  return NextResponse.json({ menuItems: names });
}
