import { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrders, fetchMenuItemCategoryMap, fetchSizeOptionGroupGuids } from "@/lib/integrations/toast-client";
import { RESTAURANT_TIMEZONE } from "@/lib/sync/timezone";

/**
 * Sync a single day's orders from Toast into daily_sales + order_items.
 * Returns the number of records upserted/inserted.
 *
 * `dateStr` is a local calendar date (YYYY-MM-DD) in the restaurant's
 * timezone. Uses Toast's `businessDate` parameter so that Toast itself
 * determines the business day boundaries, avoiding UTC conversion issues
 * that could cause orders to land on the wrong day.
 */
export async function syncOrdersForDate(
  supabase: SupabaseClient,
  dateStr: string,
  categoryMap: Map<string, string>,
  sizeGroupGuids: Set<string>,
  _timezone: string = RESTAURANT_TIMEZONE,
): Promise<{ records: number; ordersProcessed: number }> {
  const orders = await fetchOrders(dateStr);

  let grossSales = 0;
  let netSales = 0;
  let taxAmount = 0;
  let tipAmount = 0;
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
    // Skip voided/deleted orders entirely
    if (order.voided || order.deleted) continue;

    for (const check of order.checks || []) {
      // Skip voided/deleted checks
      if (check.voided || check.deleted) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = check as any;

      // Tax from check level
      taxAmount += c.taxAmount || 0;

      // Tips: Toast v2 puts tip amounts on each payment, not on the check.
      for (const payment of check.payments || []) {
        tipAmount += payment.tipAmount || 0;
        paymentBreakdown[payment.type] =
          (paymentBreakdown[payment.type] || 0) + payment.amount;
      }

      // Sales from selections:
      // - preDiscountPrice = gross (before discounts, includes qty × unit + modifiers)
      // - price = net (after discounts, before tax)
      for (const selection of check.selections || []) {
        if (selection.voided) continue;

        grossSales += selection.preDiscountPrice || 0;
        netSales += selection.price || 0;

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

  // Always clear stale data for this date first so previous bad syncs
  // (e.g. $0 rows from old UTC-based queries) don't persist.
  await supabase.from("order_items").delete().eq("date", dateStr);
  await supabase.from("daily_sales").delete().eq("date", dateStr);

  let records = 0;

  // Only write daily sales when we have actual revenue
  if (grossSales > 0) {
    const discountAmount = grossSales - netSales;
    const { error: salesError } = await supabase.from("daily_sales").upsert(
      {
        date: dateStr,
        gross_sales: grossSales,
        net_sales: netSales,
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
    records = 1;
  }

  // Insert order items
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
