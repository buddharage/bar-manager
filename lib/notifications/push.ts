import webpush from "web-push";
import { createServerClient } from "@/lib/supabase/server";

export interface PushPayload {
  type: "inventory_alert" | "chat_response";
  title: string;
  body: string;
  url: string;
  tag?: string;
}

function getVapidKeys() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@barmanager.app";

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

/**
 * Send a push notification to all subscriptions for a user.
 * Checks notification preferences before sending.
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const vapid = getVapidKeys();
  if (!vapid) {
    console.warn("VAPID keys not configured, skipping push notification");
    return { sent: 0, failed: 0 };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const supabase = createServerClient();

  // Check user preferences
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("inventory_alerts, chat_responses")
    .eq("user_id", userId)
    .maybeSingle();

  // Default to enabled if no preferences exist
  if (prefs) {
    if (payload.type === "inventory_alert" && !prefs.inventory_alerts) {
      return { sent: 0, failed: 0 };
    }
    if (payload.type === "chat_response" && !prefs.chat_responses) {
      return { sent: 0, failed: 0 };
    }
  }

  // Get all subscriptions for this user
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const expiredIds: number[] = [];

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };

    try {
      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // Subscription expired or invalid — mark for cleanup
        expiredIds.push(sub.id);
      }
      failed++;
    }
  }

  // Clean up expired subscriptions
  if (expiredIds.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", expiredIds);
  }

  return { sent, failed };
}

/**
 * Send inventory alert push to all users with subscriptions.
 * Used by background processes that don't have a specific user context.
 */
export async function broadcastInventoryAlert(
  payload: Omit<PushPayload, "type">,
): Promise<void> {
  const supabase = createServerClient();

  // Get all distinct user IDs with push subscriptions
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id");

  if (!subs || subs.length === 0) return;

  const userIds = [...new Set(subs.map((s) => s.user_id))];

  for (const userId of userIds) {
    await sendPushNotification(userId, { ...payload, type: "inventory_alert" });
  }
}
