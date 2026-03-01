import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchInventory, fetchAllMenuLookups } from "@/lib/integrations/toast-client";
import { verifyRequest } from "@/lib/auth/session";
import { syncOrdersForDate } from "@/lib/sync/toast-orders";
import { recalculateExpectedInventory } from "@/lib/inventory/expected";

// Daily Toast sync — called by GitHub Actions cron or manual trigger
export async function POST(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Create sync log
  const { data: syncLog, error: syncLogError } = await supabase
    .from("sync_logs")
    .insert({ source: "toast", status: "started" })
    .select()
    .single();

  if (syncLogError) {
    console.error("Failed to create sync log:", syncLogError);
  }

  try {
    let totalRecords = 0;

    // 1. Sync inventory stock levels (enriched with menu item names)
    // Fetch inventory and menu data in parallel, but only call /menus/v2/menus
    // once via fetchAllMenuLookups to avoid 429 rate limiting.
    const [stockItems, { menuItems, categoryMap, sizeGroupGuids }] = await Promise.all([
      fetchInventory(),
      fetchAllMenuLookups(),
    ]);

    // Build a GUID→name lookup from menu data
    const menuNameMap = new Map<string, string>();
    for (const mi of menuItems) {
      menuNameMap.set(mi.guid, mi.name);
    }

    for (const item of stockItems) {
      const guid = item.menuItem.guid;
      const { error: upsertError } = await supabase
        .from("inventory_items")
        .upsert(
          {
            toast_guid: guid,
            name: menuNameMap.get(guid) || guid,
            category: categoryMap.get(guid) || null,
            current_stock: item.quantity,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "toast_guid" }
        );
      if (upsertError) {
        console.error(`Failed to upsert inventory item ${guid}:`, upsertError);
      } else {
        totalRecords++;
      }
    }

    // 2. Sync yesterday's orders (use local time components to avoid UTC date shift)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    const { records: orderRecords, ordersProcessed } = await syncOrdersForDate(
      supabase,
      dateStr,
      categoryMap,
      sizeGroupGuids,
    );
    totalRecords += orderRecords;

    // 3. Generate low-stock alerts
    const { data: lowStockItems } = await supabase
      .from("inventory_items")
      .select("*")
      .not("par_level", "is", null);

    for (const item of lowStockItems || []) {
      if (item.par_level && item.current_stock <= item.par_level) {
        const alertType = item.current_stock === 0 ? "out_of_stock" : "low_stock";

        // Check if there's already an unresolved alert for this item
        const { data: existingAlert } = await supabase
          .from("inventory_alerts")
          .select("id")
          .eq("item_id", item.id)
          .eq("resolved", false)
          .limit(1)
          .single();

        if (!existingAlert) {
          await supabase.from("inventory_alerts").insert({
            item_id: item.id,
            alert_type: alertType,
            threshold: item.par_level,
            message: `${item.name} is ${alertType === "out_of_stock" ? "out of stock" : "below par level"} (${item.current_stock} ${item.unit} remaining, par: ${item.par_level})`,
          });
        }
      } else {
        // Resolve any existing alerts if stock is back above par
        await supabase
          .from("inventory_alerts")
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq("item_id", item.id)
          .eq("resolved", false);
      }
    }

    // 4. Recalculate expected inventory from ingredient-based system
    const expectedResult = await recalculateExpectedInventory(supabase);

    // Update sync log
    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "success",
          records_synced: totalRecords,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    return NextResponse.json({
      success: true,
      records_synced: totalRecords,
      orders_processed: ordersProcessed,
      expected_inventory_updated: expectedResult.updated,
      ingredient_alerts_created: expectedResult.alerts,
    });
  } catch (error) {
    // Log error
    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({
          status: "error",
          error: String(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    console.error("Toast sync error:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}
