import { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrders, fetchMenuItemCategoryMap, fetchSizeOptionGroupGuids } from "@/lib/integrations/toast-client";
import { getLocalDayUTCRange, RESTAURANT_TIMEZONE } from "@/lib/sync/timezone";

/**
 * Sync a single day's orders from Toast into daily_sales + order_items.
 * Returns the number of records upserted/inserted.
 *
 * `dateStr` is a local calendar date (YYYY-MM-DD) in the restaurant's
 * timezone. The Toast API is queried for the corresponding UTC range so
 * that the full local business day is captured (e.g. midnight–midnight ET
 * instead of midnight–midnight UTC).
 */
export async function syncOrdersForDate(
  supabase: SupabaseClient,
  dateStr: string,
  categoryMap: Map<string, string>,
  sizeGroupGuids: Set<string>,
  timezone: string = RESTAURANT_TIMEZONE,
): Promise<{ records: number; ordersProcessed: number }> {
  const { start: startOfDay, end: endOfDay } = getLocalDayUTCRange(dateStr, timezone);

  const orders = await fetchOrders(startOfDay, endOfDay);

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
      for (const payment of check.payments || []) {
        paymentBreakdown[payment.type] =
          (paymentBreakdown[payment.type] || 0) + payment.amount;
      }

      for (const selection of check.selections || []) {
        const itemGuid = selection.item?.guid || null;
        const category = itemGuid ? (categoryMap.get(itemGuid) || null) : null;

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
  const { error: salesError } = await supabase.from("daily_sales").upsert(
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
  if (salesError) {
    console.error(`Failed to upsert daily_sales for ${dateStr}:`, salesError);
    throw new Error(`Failed to upsert daily sales for ${dateStr}: ${salesError.message}`);
  }
  let records = 1;

  // Insert order items (clear previous entries to avoid duplicates on re-run)
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
    const { error: deleteError } = await supabase.from("order_items").delete().eq("date", dateStr);
    if (deleteError) {
      console.error(`Failed to delete old order_items for ${dateStr}:`, deleteError);
    }
    const { error: insertError } = await supabase.from("order_items").insert(orderItemRows);
    if (insertError) {
      console.error(`Failed to insert order_items for ${dateStr}:`, insertError);
      throw new Error(`Failed to insert order items for ${dateStr}: ${insertError.message}`);
    }
    records += orderItemRows.length;
  }

  return { records, ordersProcessed: orders.length };
}

/**
 * Fetch the shared lookups (category map + size option group GUIDs) that are
 * reused across multiple days. Call once and pass to syncOrdersForDate.
 */
export async function fetchSharedLookups() {
  const [categoryMap, sizeGroupGuids] = await Promise.all([
    fetchMenuItemCategoryMap(),
    fetchSizeOptionGroupGuids(),
  ]);
  return { categoryMap, sizeGroupGuids };
}
