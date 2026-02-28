import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchOrders, fetchInventory, fetchMenuItems, fetchMenuItemCategoryMap, fetchSizeOptionGroupGuids } from "@/lib/integrations/toast-client";
import { verifyRequest } from "@/lib/auth/session";

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
    const [stockItems, menuItems, categoryMap, sizeGroupGuids] = await Promise.all([
      fetchInventory(),
      fetchMenuItems(),
      fetchMenuItemCategoryMap(),
      fetchSizeOptionGroupGuids(),
    ]);

    // Build a GUID→name lookup from menu data
    const menuNameMap = new Map<string, string>();
    for (const mi of menuItems) {
      menuNameMap.set(mi.guid, mi.name);
    }

    for (const item of stockItems) {
      const guid = item.menuItem.guid;
      await supabase
        .from("inventory_items")
        .upsert(
          {
            toast_guid: guid,
            name: menuNameMap.get(guid) || guid,
            current_stock: item.quantity,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "toast_guid" }
        );
      totalRecords++;
    }

    // 2. Sync yesterday's orders
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];
    const startOfDay = `${dateStr}T00:00:00.000Z`;
    const endOfDay = `${dateStr}T23:59:59.999Z`;

    const orders = await fetchOrders(startOfDay, endOfDay);

    // Aggregate daily sales
    let grossSales = 0;
    let taxAmount = 0;
    let tipAmount = 0;
    let discountAmount = 0;
    const paymentBreakdown: Record<string, number> = {};
    const orderItemsMap = new Map<string, {
      name: string;
      quantity: number;
      revenue: number;
      category: string | null;
      size: string | null;
      menu_item_guid: string | null;
    }>();

    for (const order of orders) {
      grossSales += order.totalAmount || 0;
      taxAmount += order.taxAmount || 0;
      tipAmount += order.tipAmount || 0;
      discountAmount += order.discountAmount || 0;

      for (const check of order.checks || []) {
        // Aggregate payment types
        for (const payment of check.payments || []) {
          paymentBreakdown[payment.type] =
            (paymentBreakdown[payment.type] || 0) + payment.amount;
        }

        // Aggregate order items — keyed by (name, category, size)
        for (const selection of check.selections || []) {
          const itemGuid = selection.item?.guid || null;
          const category = itemGuid ? (categoryMap.get(itemGuid) || null) : null;

          // Extract size from modifiers: find the first modifier whose
          // optionGroup is a known size group (identified from the menus API).
          let size: string | null = null;
          for (const mod of selection.modifiers || []) {
            if (mod.optionGroup?.guid && sizeGroupGuids.has(mod.optionGroup.guid)) {
              size = mod.displayName;
              break;
            }
          }

          const key = `${selection.displayName}||${category}||${size}`;
          const existing = orderItemsMap.get(key) || {
            name: selection.displayName,
            quantity: 0,
            revenue: 0,
            category,
            size,
            menu_item_guid: itemGuid,
          };
          existing.quantity += selection.quantity || 1;
          existing.revenue += selection.price || 0;
          orderItemsMap.set(key, existing);
        }
      }
    }

    // Upsert daily sales
    await supabase.from("daily_sales").upsert(
      {
        date: dateStr,
        gross_sales: grossSales,
        net_sales: grossSales - discountAmount,
        tax_collected: taxAmount,
        tips: tipAmount,
        discounts: discountAmount,
        payment_breakdown: paymentBreakdown,
      },
      { onConflict: "date" }
    );
    totalRecords++;

    // Insert order items (clear previous entries for this date to avoid duplicates on re-run)
    const orderItemRows = Array.from(orderItemsMap.values()).map((item) => ({
      date: dateStr,
      menu_item_guid: item.menu_item_guid,
      name: item.name,
      quantity: item.quantity,
      revenue: item.revenue,
      category: item.category,
      size: item.size,
    }));

    if (orderItemRows.length > 0) {
      await supabase.from("order_items").delete().eq("date", dateStr);
      await supabase.from("order_items").insert(orderItemRows);
      totalRecords += orderItemRows.length;
    }

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
      orders_processed: orders.length,
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
