import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyWebhookSignature } from "@/lib/integrations/toast-client";

// Toast stock webhook — receives real-time inventory changes
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("toast-signature") || "";

  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const supabase = createServerClient();
  const payload = JSON.parse(body);

  try {
    // Toast stock webhooks send inventory change events
    // Shape: { eventType, restaurantGuid, data: { menuItemGuid, quantity, status } }
    if (payload.eventType === "STOCK_UPDATE") {
      const { menuItemGuid, quantity } = payload.data;

      // Update inventory item
      const { data: item } = await supabase
        .from("inventory_items")
        .update({
          current_stock: quantity,
          last_synced_at: new Date().toISOString(),
        })
        .eq("toast_guid", menuItemGuid)
        .select()
        .single();

      // Check if we need to create/resolve alerts
      if (item && item.par_level) {
        if (quantity <= item.par_level) {
          const alertType = quantity === 0 ? "out_of_stock" : "low_stock";

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
              message: `${item.name} is ${alertType === "out_of_stock" ? "out of stock" : "below par level"} (${quantity} ${item.unit} remaining, par: ${item.par_level})`,
            });
          }
        } else {
          // Stock is back above par — resolve alerts
          await supabase
            .from("inventory_alerts")
            .update({ resolved: true, resolved_at: new Date().toISOString() })
            .eq("item_id", item.id)
            .eq("resolved", false);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Toast webhook error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
