import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Simulate the Service Worker global environment
// ---------------------------------------------------------------------------

interface MockClient {
  focused: boolean;
  visibilityState: "visible" | "hidden";
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

function createMockClient(overrides: Partial<MockClient> = {}): MockClient {
  return {
    focused: false,
    visibilityState: "hidden",
    url: "https://app.barmanager.app/dashboard",
    focus: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  };
}

let pushHandler: (event: any) => void;
let showNotification: ReturnType<typeof vi.fn>;
let mockClients: MockClient[];

/**
 * Load sw.js into a mock Service Worker global and extract the registered
 * "push" event handler so we can call it directly in tests.
 */
function loadServiceWorker(clients: MockClient[] = []) {
  mockClients = clients;
  showNotification = vi.fn().mockResolvedValue(undefined);

  const handlers: Record<string, Function> = {};

  const selfGlobal: any = {
    addEventListener: (type: string, handler: Function) => {
      handlers[type] = handler;
    },
    skipWaiting: vi.fn(),
    clients: {
      matchAll: vi.fn().mockResolvedValue(clients),
      claim: vi.fn().mockResolvedValue(undefined),
      openWindow: vi.fn(),
    },
    registration: {
      showNotification,
    },
    location: { origin: "https://app.barmanager.app" },
  };

  // Execute sw.js in a context where `self` is our mock
  const swSource = readFileSync(join(__dirname, "sw.js"), "utf-8");
  const wrapped = new Function("self", swSource);
  wrapped(selfGlobal);

  pushHandler = handlers["push"];
}

/**
 * Simulate a push event and wait for the async handler to complete.
 */
async function firePush(payload: Record<string, unknown>): Promise<void> {
  let waitUntilPromise: Promise<void> | undefined;

  const event = {
    data: {
      json: () => payload,
      text: () => JSON.stringify(payload),
    },
    waitUntil: (p: Promise<void>) => {
      waitUntilPromise = p;
    },
  };

  pushHandler(event);

  if (waitUntilPromise) {
    await waitUntilPromise;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Service Worker — push notification display", () => {
  // =======================================================================
  // INVENTORY ALERTS — must ALWAYS show, no suppression
  // =======================================================================

  describe("inventory_alert", () => {
    const inventoryPayload = {
      type: "inventory_alert",
      title: "Low Stock Alert",
      body: "Tequila Blanco is below par level",
      url: "/inventory/alerts",
      tag: "inventory-alert-1",
    };

    it("shows notification when no tabs are open", async () => {
      loadServiceWorker([]);
      await firePush(inventoryPayload);

      expect(showNotification).toHaveBeenCalledTimes(1);
      expect(showNotification).toHaveBeenCalledWith("Low Stock Alert", expect.objectContaining({
        body: "Tequila Blanco is below par level",
      }));
    });

    it("shows notification even when user is focused on the inventory alerts page", async () => {
      loadServiceWorker([
        createMockClient({
          focused: true,
          visibilityState: "visible",
          url: "https://app.barmanager.app/inventory/alerts",
        }),
      ]);
      await firePush(inventoryPayload);

      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("shows notification when user is focused on a different page", async () => {
      loadServiceWorker([
        createMockClient({
          focused: true,
          visibilityState: "visible",
          url: "https://app.barmanager.app/dashboard",
        }),
      ]);
      await firePush(inventoryPayload);

      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("shows notification when user is on inventory alerts but tab not focused (switched app)", async () => {
      loadServiceWorker([
        createMockClient({
          focused: false,
          visibilityState: "visible",
          url: "https://app.barmanager.app/inventory/alerts",
        }),
      ]);
      await firePush(inventoryPayload);

      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("shows notification on mobile (browser in background)", async () => {
      loadServiceWorker([
        createMockClient({
          focused: false,
          visibilityState: "hidden",
          url: "https://app.barmanager.app/inventory/alerts",
        }),
      ]);
      await firePush(inventoryPayload);

      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("shows out-of-stock notification", async () => {
      loadServiceWorker([]);
      await firePush({
        ...inventoryPayload,
        title: "Out of Stock",
        body: "Lime Juice is depleted",
      });

      expect(showNotification).toHaveBeenCalledWith("Out of Stock", expect.objectContaining({
        body: "Lime Juice is depleted",
      }));
    });
  });

  // =======================================================================
  // CHAT RESPONSES — suppress ONLY when user is focused on /chat
  // =======================================================================

  describe("chat_response", () => {
    const chatPayload = {
      type: "chat_response",
      title: "Willy — Chat Reply",
      body: "Based on your sales data, I recommend ordering...",
      url: "/chat",
      tag: "chat-response",
    };

    it("shows notification when no tabs are open", async () => {
      loadServiceWorker([]);
      await firePush(chatPayload);

      expect(showNotification).toHaveBeenCalledTimes(1);
      expect(showNotification).toHaveBeenCalledWith("Willy — Chat Reply", expect.objectContaining({
        body: "Based on your sales data, I recommend ordering...",
      }));
    });

    it("shows notification when user switched to another macOS app (tab visible but NOT focused)", async () => {
      loadServiceWorker([
        createMockClient({
          focused: false,
          visibilityState: "visible",  // <-- the old bug: this was "visible" but user was in Slack
          url: "https://app.barmanager.app/chat",
        }),
      ]);
      await firePush(chatPayload);

      // THIS is the core fix — visibilityState is "visible" but focused is false,
      // so the notification MUST fire.
      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("shows notification when user switched to a different browser tab", async () => {
      loadServiceWorker([
        createMockClient({
          focused: false,
          visibilityState: "hidden",
          url: "https://app.barmanager.app/chat",
        }),
      ]);
      await firePush(chatPayload);

      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("shows notification when user is focused on a different page (not /chat)", async () => {
      loadServiceWorker([
        createMockClient({
          focused: true,
          visibilityState: "visible",
          url: "https://app.barmanager.app/dashboard",
        }),
      ]);
      await firePush(chatPayload);

      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("shows notification on mobile when browser is backgrounded", async () => {
      loadServiceWorker([
        createMockClient({
          focused: false,
          visibilityState: "hidden",
          url: "https://app.barmanager.app/chat",
        }),
      ]);
      await firePush(chatPayload);

      expect(showNotification).toHaveBeenCalledTimes(1);
    });

    it("suppresses notification ONLY when user is focused on the chat page", async () => {
      loadServiceWorker([
        createMockClient({
          focused: true,
          visibilityState: "visible",
          url: "https://app.barmanager.app/chat",
        }),
      ]);
      await firePush(chatPayload);

      expect(showNotification).not.toHaveBeenCalled();
    });

    it("suppresses when user is focused on a chat sub-route", async () => {
      loadServiceWorker([
        createMockClient({
          focused: true,
          visibilityState: "visible",
          url: "https://app.barmanager.app/chat?thread=123",
        }),
      ]);
      await firePush(chatPayload);

      expect(showNotification).not.toHaveBeenCalled();
    });

    it("shows notification when multiple tabs open but none focused on chat", async () => {
      loadServiceWorker([
        createMockClient({
          focused: false,
          visibilityState: "hidden",
          url: "https://app.barmanager.app/chat",
        }),
        createMockClient({
          focused: true,
          visibilityState: "visible",
          url: "https://app.barmanager.app/inventory",
        }),
      ]);
      await firePush(chatPayload);

      // Chat tab exists but isn't focused — notification should fire.
      expect(showNotification).toHaveBeenCalledTimes(1);
    });
  });

  // =======================================================================
  // Edge cases
  // =======================================================================

  describe("edge cases", () => {
    it("handles push event with no data gracefully", async () => {
      loadServiceWorker([]);

      const event = { data: null, waitUntil: vi.fn() };
      pushHandler(event);

      // Should not call showNotification and should not throw
      expect(showNotification).not.toHaveBeenCalled();
      expect(event.waitUntil).not.toHaveBeenCalled();
    });

    it("falls back to default payload when JSON parsing fails", async () => {
      loadServiceWorker([]);

      let waitUntilPromise: Promise<void> | undefined;
      const event = {
        data: {
          json: () => { throw new Error("invalid JSON"); },
          text: () => "Something happened",
        },
        waitUntil: (p: Promise<void>) => { waitUntilPromise = p; },
      };

      pushHandler(event);
      if (waitUntilPromise) await waitUntilPromise;

      expect(showNotification).toHaveBeenCalledWith("Willy", expect.objectContaining({
        body: "Something happened",
        data: { url: "/dashboard" },
      }));
    });

    it("notification options include correct url in data", async () => {
      loadServiceWorker([]);
      await firePush({
        type: "inventory_alert",
        title: "Low Stock",
        body: "Vodka is low",
        url: "/inventory/alerts",
        tag: "inventory-alert-5",
      });

      expect(showNotification).toHaveBeenCalledWith("Low Stock", expect.objectContaining({
        data: { url: "/inventory/alerts" },
        tag: "inventory-alert-5",
      }));
    });
  });
});
