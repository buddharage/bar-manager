/**
 * Integration tests for push notification delivery.
 *
 * Requirements under test:
 *   1. When an inventory alert fires, a push notification is delivered
 *      to every device (desktop + mobile).
 *   2. When the chatbot responds, a push notification is delivered.
 *
 * These tests mock only the outermost boundaries (web-push HTTP call,
 * Supabase database) and exercise the real application code in between:
 *   trigger → sendPushNotification / broadcastInventoryAlert → web-push
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Boundary mock: web-push (the HTTP call to the push service)
// ---------------------------------------------------------------------------

const mockSendNotification = vi.fn().mockResolvedValue({});

vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
    setVapidDetails: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Boundary mock: Supabase (the database)
// ---------------------------------------------------------------------------

let mockPreferences: { inventory_alerts: boolean; chat_responses: boolean } | null;
let mockSubscriptions: { id: number; user_id: string; endpoint: string; p256dh: string; auth: string }[];

function createChainableMock(resolvedValue: unknown) {
  const chain: any = {};
  for (const m of ["select", "eq", "neq", "not", "in", "gte", "limit", "order", "range", "delete"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = (resolve: (v: unknown) => void) => resolve(resolvedValue);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "notification_preferences") {
        return createChainableMock({ data: mockPreferences, error: null });
      }
      if (table === "push_subscriptions") {
        const chain = createChainableMock({ data: mockSubscriptions, error: null });
        chain.delete = vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        });
        return chain;
      }
      return createChainableMock({ data: null, error: null });
    },
  }),
}));

// ---------------------------------------------------------------------------
// Import the real application code (after mocks)
// ---------------------------------------------------------------------------

const { sendPushNotification, broadcastInventoryAlert } = await import("./push");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DESKTOP_SUB = {
  id: 1,
  user_id: "user-1",
  endpoint: "https://fcm.googleapis.com/fcm/send/desktop-token",
  p256dh: "desktop-p256dh-key",
  auth: "desktop-auth-key",
};

const MOBILE_SUB = {
  id: 2,
  user_id: "user-1",
  endpoint: "https://web.push.apple.com/mobile-token",
  p256dh: "mobile-p256dh-key",
  auth: "mobile-auth-key",
};

function sentPayloads(): Record<string, unknown>[] {
  return mockSendNotification.mock.calls.map(
    (call: unknown[]) => JSON.parse(call[1] as string),
  );
}

function sentEndpoints(): string[] {
  return mockSendNotification.mock.calls.map(
    (call: unknown[]) => (call[0] as { endpoint: string }).endpoint,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Requirement 1: inventory alert → push notification to all devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferences = null; // defaults to enabled
    mockSubscriptions = [DESKTOP_SUB, MOBILE_SUB];
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
  });

  it("broadcastInventoryAlert delivers to every registered device", async () => {
    await broadcastInventoryAlert({
      title: "Low Stock Alert",
      body: "Tequila Blanco is below par level (expected: 3.0 oz, par: 10)",
      url: "/inventory/alerts",
      tag: "inventory-alert-42",
    });

    // Must reach both desktop and mobile
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    expect(sentEndpoints()).toContain(DESKTOP_SUB.endpoint);
    expect(sentEndpoints()).toContain(MOBILE_SUB.endpoint);

    // Every payload must be type "inventory_alert"
    for (const payload of sentPayloads()) {
      expect(payload.type).toBe("inventory_alert");
      expect(payload.title).toBe("Low Stock Alert");
      expect(payload.url).toBe("/inventory/alerts");
    }
  });

  it("out-of-stock alert also delivers to every device", async () => {
    await broadcastInventoryAlert({
      title: "Out of Stock",
      body: "Lime Juice is depleted",
      url: "/inventory/alerts",
      tag: "inventory-alert-7",
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    for (const payload of sentPayloads()) {
      expect(payload.type).toBe("inventory_alert");
      expect(payload.title).toBe("Out of Stock");
    }
  });

  it("sendPushNotification delivers inventory_alert to both desktop and mobile", async () => {
    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock Alert",
      body: "Vodka is below par",
      url: "/inventory/alerts",
      tag: "inventory-alert-1",
    });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(sentEndpoints()).toContain(DESKTOP_SUB.endpoint);
    expect(sentEndpoints()).toContain(MOBILE_SUB.endpoint);
  });

  it("still delivers when user has no notification_preferences row (defaults enabled)", async () => {
    mockPreferences = null;

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    expect(result.sent).toBe(2);
  });

  it("respects user preference to disable inventory_alerts", async () => {
    mockPreferences = { inventory_alerts: false, chat_responses: true };

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    expect(result.sent).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("cleans up expired subscription without breaking other deliveries", async () => {
    // Desktop subscription expired, mobile still valid
    mockSendNotification
      .mockRejectedValueOnce({ statusCode: 410 }) // desktop: expired
      .mockResolvedValueOnce({});                  // mobile: OK

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    // One succeeded, one failed — but both were attempted
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });
});

describe("Requirement 2: chat response → push notification delivered", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferences = null;
    mockSubscriptions = [DESKTOP_SUB, MOBILE_SUB];
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
  });

  it("chat response triggers push notification to all devices", async () => {
    const result = await sendPushNotification("user-1", {
      type: "chat_response",
      title: "Willy — Chat Reply",
      body: "Based on your sales data, I recommend ordering more tequila...",
      url: "/chat",
      tag: "chat-response",
    });

    expect(result.sent).toBe(2);
    expect(sentEndpoints()).toContain(DESKTOP_SUB.endpoint);
    expect(sentEndpoints()).toContain(MOBILE_SUB.endpoint);

    for (const payload of sentPayloads()) {
      expect(payload.type).toBe("chat_response");
      expect(payload.title).toBe("Willy — Chat Reply");
      expect(payload.url).toBe("/chat");
    }
  });

  it("long chat responses are sent as-is (truncation is caller's job)", async () => {
    const longBody = "A".repeat(200);

    await sendPushNotification("user-1", {
      type: "chat_response",
      title: "Willy — Chat Reply",
      body: longBody,
      url: "/chat",
      tag: "chat-response",
    });

    expect(sentPayloads()[0].body).toBe(longBody);
  });

  it("respects user preference to disable chat_responses", async () => {
    mockPreferences = { inventory_alerts: true, chat_responses: false };

    const result = await sendPushNotification("user-1", {
      type: "chat_response",
      title: "Willy",
      body: "test",
      url: "/chat",
    });

    expect(result.sent).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("does not send when VAPID keys are missing", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    const result = await sendPushNotification("user-1", {
      type: "chat_response",
      title: "Willy",
      body: "test",
      url: "/chat",
    });

    expect(result.sent).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("does not send when user has no push subscriptions", async () => {
    mockSubscriptions = [];

    const result = await sendPushNotification("user-1", {
      type: "chat_response",
      title: "Willy",
      body: "test",
      url: "/chat",
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
  });
});
