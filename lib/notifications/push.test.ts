import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock web-push
// ---------------------------------------------------------------------------

const mockSendNotification = vi.fn().mockResolvedValue({});
const mockSetVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
    setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
  },
}));

// ---------------------------------------------------------------------------
// Mock Supabase — tracks every query so we can assert behaviour
// ---------------------------------------------------------------------------

let mockPreferences: { inventory_alerts: boolean; chat_responses: boolean } | null;
let mockSubscriptions: { id: number; user_id: string; endpoint: string; p256dh: string; auth: string }[];
let deletedIds: number[];

function createChainableMock(resolvedValue: unknown) {
  const chain: any = {};
  const methods = ["select", "eq", "neq", "not", "in", "gte", "limit", "order", "range", "delete"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  // Allow awaiting the chain directly
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
        // Override delete to track which IDs are removed
        chain.delete = vi.fn().mockReturnValue({
          in: vi.fn((_col: string, ids: number[]) => {
            deletedIds.push(...ids);
            return Promise.resolve({ error: null });
          }),
        });
        return chain;
      }
      return createChainableMock({ data: null, error: null });
    },
  }),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks are set up)
// ---------------------------------------------------------------------------

const { sendPushNotification, broadcastInventoryAlert } = await import("./push");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendPushNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deletedIds = [];
    // Defaults: preferences enabled, one subscription
    mockPreferences = null; // no row = defaults to enabled
    mockSubscriptions = [
      { id: 1, user_id: "user-1", endpoint: "https://push.example.com/sub1", p256dh: "key1", auth: "auth1" },
    ];
    // Set VAPID env vars
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    process.env.VAPID_SUBJECT = "mailto:test@barmanager.app";
  });

  // =========================================================================
  // Core delivery
  // =========================================================================

  it("sends push notification with correct payload for inventory_alert", async () => {
    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock Alert",
      body: "Tequila is below par",
      url: "/inventory/alerts",
      tag: "inventory-alert-1",
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/sub1", keys: { p256dh: "key1", auth: "auth1" } },
      expect.stringContaining('"type":"inventory_alert"'),
    );
  });

  it("sends push notification with correct payload for chat_response", async () => {
    const result = await sendPushNotification("user-1", {
      type: "chat_response",
      title: "Willy — Chat Reply",
      body: "Here are your sales trends...",
      url: "/chat",
      tag: "chat-response",
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining('"type":"chat_response"'),
    );
  });

  it("sends to multiple subscriptions for the same user", async () => {
    mockSubscriptions = [
      { id: 1, user_id: "user-1", endpoint: "https://push.example.com/desktop", p256dh: "k1", auth: "a1" },
      { id: 2, user_id: "user-1", endpoint: "https://push.example.com/mobile", p256dh: "k2", auth: "a2" },
    ];

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "Vodka is low",
      url: "/inventory/alerts",
    });

    expect(result.sent).toBe(2);
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  // =========================================================================
  // VAPID key validation
  // =========================================================================

  it("skips sending when VAPID public key is missing", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    expect(result.sent).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("skips sending when VAPID private key is missing", async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    expect(result.sent).toBe(0);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Preference enforcement
  // =========================================================================

  it("sends inventory alert when preferences exist and inventory_alerts is true", async () => {
    mockPreferences = { inventory_alerts: true, chat_responses: true };

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    expect(result.sent).toBe(1);
  });

  it("blocks inventory alert when user disabled inventory_alerts preference", async () => {
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

  it("blocks chat_response when user disabled chat_responses preference", async () => {
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

  it("defaults to enabled when no preferences row exists", async () => {
    mockPreferences = null;

    const result = await sendPushNotification("user-1", {
      type: "chat_response",
      title: "Willy",
      body: "test",
      url: "/chat",
    });

    expect(result.sent).toBe(1);
  });

  // =========================================================================
  // Subscription edge cases
  // =========================================================================

  it("returns zero when user has no subscriptions", async () => {
    mockSubscriptions = [];

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("cleans up expired subscriptions (410 Gone)", async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 410 });

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    expect(result.failed).toBe(1);
    expect(deletedIds).toContain(1);
  });

  it("cleans up expired subscriptions (404 Not Found)", async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 404 });

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    expect(result.failed).toBe(1);
    expect(deletedIds).toContain(1);
  });

  it("does not delete subscription on transient errors (e.g. 500)", async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 500 });

    const result = await sendPushNotification("user-1", {
      type: "inventory_alert",
      title: "Low Stock",
      body: "test",
      url: "/inventory/alerts",
    });

    expect(result.failed).toBe(1);
    expect(deletedIds).toHaveLength(0);
  });
});

describe("broadcastInventoryAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deletedIds = [];
    mockPreferences = null;
    mockSubscriptions = [
      { id: 1, user_id: "user-1", endpoint: "https://push.example.com/sub1", p256dh: "k1", auth: "a1" },
    ];
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
  });

  it("sends inventory_alert type to all users with subscriptions", async () => {
    await broadcastInventoryAlert({
      title: "Out of Stock",
      body: "Lime Juice is depleted",
      url: "/inventory/alerts",
      tag: "inventory-alert-3",
    });

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const sentPayload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    expect(sentPayload.type).toBe("inventory_alert");
    expect(sentPayload.title).toBe("Out of Stock");
  });
});
