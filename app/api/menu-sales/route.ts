import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/auth/session";

// Normalize item names so that variants of the same product are aggregated.
// A product can appear on the Toast menu as:
//   "Item Name"  /  "Item Name (Happy Hour)"  /  "Item Name and a Shot"
//   "Item & Shot"  /  "Item and a Shot"  /  "Item and Shot"
// All should roll up under the base name.
// This applies to specific beers (Miller High Life, Tecate, Corona)
// and all wine-category items.
//
// Additionally, short-name aliases are mapped to their canonical name
// (e.g. "High Life" → "Miller High Life").
const BEER_ALIASES: Record<string, string> = {
  "high life": "Miller High Life",
  "miller high life": "Miller High Life",
};

function normalizeItemName(name: string, category?: string): string {
  // "(Happy Hour)" is a pricing variant that applies to any category —
  // strip it universally so happy-hour items aggregate with their base item.
  let normalized = name.replace(/\s*\(Happy Hour\)\s*$/i, "").trim();

  const lowerCat = category?.toLowerCase();
  const isBeerOrWine = lowerCat?.includes("wine") || lowerCat?.includes("beer");

  // Tentatively strip shot suffixes to check against known beer names.
  const withoutShot = normalized
    .replace(/\s+and\s+(a\s+)?Shot\s*$/i, "")
    .replace(/\s*&\s*Shot\s*$/i, "")
    .trim();

  if (isBeerOrWine) {
    // Beer/wine category — always strip shot suffixes and apply aliases.
    normalized = withoutShot;
    const alias = BEER_ALIASES[normalized.toLowerCase()];
    if (alias) normalized = alias;
  } else {
    // Outside beer/wine categories, items like "High Life and Shot" may be
    // categorised under "Shots" or similar. Strip the shot suffix and check
    // if the result matches a known beer alias — only then apply it.
    const alias = BEER_ALIASES[withoutShot.toLowerCase()];
    if (alias) normalized = alias;
  }

  return normalized;
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

  // Paginate through all rows to avoid the default 1000-row limit,
  // which would cause incomplete aggregation over larger date ranges.
  const PAGE_SIZE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = [];
  let from = 0;

  while (true) {
    let pageQuery = supabase.from("order_items").select("*");
    if (startDate) pageQuery = pageQuery.gte("date", startDate);
    if (endDate) pageQuery = pageQuery.lte("date", endDate);

    const { data: page, error } = await pageQuery
      .order("date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!page || page.length === 0) break;
    data.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Build a fallback name→category map from inventory_items for old rows
  // that pre-date migration 003 (which added category directly to order_items).
  const { data: inventoryItems } = await supabase
    .from("inventory_items")
    .select("name, category");

  const inventoryCategoryMap = new Map<string, string>();
  for (const inv of inventoryItems || []) {
    if (inv.name && inv.category) {
      inventoryCategoryMap.set(inv.name, inv.category);
    }
  }

  // Aggregate by (normalizedName, size) so that variants (e.g. happy-hour
  // pricing, combo items) are rolled up under a single canonical name,
  // while different sizes remain separate rows.
  // Sub-items are tracked so the UI can show the breakdown.
  const grouped = new Map<
    string,
    {
      name: string;
      category: string;
      size: string | null;
      quantity: number;
      revenue: number;
      subItems: Map<string, { name: string; quantity: number; revenue: number }>;
    }
  >();

  for (const item of data || []) {
    const baseName = item.name.replace(/\s*\(Happy Hour\)\s*$/i, "").trim();
    const rawCategory = item.category
      || inventoryCategoryMap.get(item.name)
      || inventoryCategoryMap.get(baseName)
      || "Uncategorized";
    const canonicalName = normalizeItemName(item.name, rawCategory);
    const size = item.size || null;
    const key = `${canonicalName}||${size}`;
    const existing = grouped.get(key);
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
      grouped.set(key, {
        name: canonicalName,
        category: rawCategory,
        size,
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
        size: g.size,
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
