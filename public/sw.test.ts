/**
 * Integration tests for the service worker push notification display.
 *
 * Requirements under test:
 *   1. When an inventory alert push arrives, the notification ALWAYS shows
 *      — on desktop, on mobile, regardless of what page the user is on.
 *   2. When a chat response push arrives and the user is NOT looking at
 *      the chat page, the notification shows.
 *   3. When a chat response push arrives and the user IS looking at the
 *      chat page, the notification is suppressed (they see it in the UI).
 *
 * These tests load the real sw.js into a mock Service Worker environment,
 * simulate push events with realistic payloads (matching what the server
 * sends), and assert whether showNotification was called.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Mock Service Worker environment
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

function loadServiceWorker(clients: MockClient[] = []) {
  showNotification = vi.fn().mockResolvedValue(undefined);

  const handlers: Record<string, Function> = {};
  const selfGlobal: any = {
    addEventListener: (type: string, handler: Function) => { handlers[type] = handler; },
    skipWaiting: vi.fn(),
    clients: {
      matchAll: vi.fn().mockResolvedValue(clients),
      claim: vi.fn().mockResolvedValue(undefined),
      openWindow: vi.fn(),
    },
    registration: { showNotification },
    location: { origin: "https://app.barmanager.app" },
  };

  const swSource = readFileSync(join(__dirname, "sw.js"), "utf-8");
  new Function("self", swSource)(selfGlobal);
  pushHandler = handlers["push"];
}

async function firePush(payload: Record<string, unknown>): Promise<void> {
  let waitUntilPromise: Promise<void> | undefined;
  pushHandler({
    data: {
      json: () => payload,
      text: () => JSON.stringify(payload),
    },
    waitUntil: (p: Promise<void>) => { waitUntilPromise = p; },
  });
  if (waitUntilPromise) await waitUntilPromise;
}

// ---------------------------------------------------------------------------
// Realistic payloads (same shape the server sends)
// ---------------------------------------------------------------------------

const INVENTORY_LOW_STOCK = {
  type: "inventory_alert",
  title: "Low Stock Alert",
  body: "Tequila Blanco is below par level (expected: 3.0 oz, par: 10)",
  url: "/inventory/alerts",
  tag: "inventory-alert-42",
};

const INVENTORY_OUT_OF_STOCK = {
  type: "inventory_alert",
  title: "Out of Stock",
  body: "Lime Juice is depleted (expected: 0.0 oz, par: 8)",
  url: "/inventory/alerts",
  tag: "inventory-alert-7",
};

const CHAT_RESPONSE = {
  type: "chat_response",
  title: "Willy — Chat Reply",
  body: "Based on your sales data, I recommend ordering more tequila and triple sec before the weekend...",
  url: "/chat",
  tag: "chat-response",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Requirement 1: inventory alert push → notification ALWAYS shows", () => {
  it("shows on desktop — user is on dashboard", async () => {
    loadServiceWorker([
      createMockClient({ focused: true, visibilityState: "visible", url: "https://app.barmanager.app/dashboard" }),
    ]);
    await firePush(INVENTORY_LOW_STOCK);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows on desktop — user is focused on the inventory alerts page", async () => {
    loadServiceWorker([
      createMockClient({ focused: true, visibilityState: "visible", url: "https://app.barmanager.app/inventory/alerts" }),
    ]);
    await firePush(INVENTORY_LOW_STOCK);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows on desktop — user switched to Slack (visible but not focused)", async () => {
    loadServiceWorker([
      createMockClient({ focused: false, visibilityState: "visible", url: "https://app.barmanager.app/inventory/alerts" }),
    ]);
    await firePush(INVENTORY_LOW_STOCK);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows on desktop — browser minimized", async () => {
    loadServiceWorker([
      createMockClient({ focused: false, visibilityState: "hidden", url: "https://app.barmanager.app/inventory/alerts" }),
    ]);
    await firePush(INVENTORY_LOW_STOCK);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows on mobile — app is in background", async () => {
    loadServiceWorker([
      createMockClient({ focused: false, visibilityState: "hidden", url: "https://app.barmanager.app/inventory" }),
    ]);
    await firePush(INVENTORY_LOW_STOCK);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows on mobile — no tabs open (PWA closed)", async () => {
    loadServiceWorker([]);
    await firePush(INVENTORY_LOW_STOCK);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows out-of-stock alerts the same way", async () => {
    loadServiceWorker([
      createMockClient({ focused: true, visibilityState: "visible", url: "https://app.barmanager.app/inventory/alerts" }),
    ]);
    await firePush(INVENTORY_OUT_OF_STOCK);
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith("Out of Stock", expect.objectContaining({
      body: expect.stringContaining("Lime Juice"),
    }));
  });

  it("passes correct url so clicking the notification navigates to alerts", async () => {
    loadServiceWorker([]);
    await firePush(INVENTORY_LOW_STOCK);
    expect(showNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ data: { url: "/inventory/alerts" } }),
    );
  });
});

describe("Requirement 2: chat response push → notification when user NOT looking at /chat", () => {
  it("shows when user switched to another macOS app (tab visible, NOT focused)", async () => {
    // THIS is the exact scenario that was broken before the fix.
    // The old code checked visibilityState === "visible" and suppressed.
    // The fix checks `focused` instead.
    loadServiceWorker([
      createMockClient({ focused: false, visibilityState: "visible", url: "https://app.barmanager.app/chat" }),
    ]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows when user switched to a different browser tab", async () => {
    loadServiceWorker([
      createMockClient({ focused: false, visibilityState: "hidden", url: "https://app.barmanager.app/chat" }),
    ]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows when user is focused on a different page entirely", async () => {
    loadServiceWorker([
      createMockClient({ focused: true, visibilityState: "visible", url: "https://app.barmanager.app/inventory" }),
    ]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows on mobile when browser is in the background", async () => {
    loadServiceWorker([
      createMockClient({ focused: false, visibilityState: "hidden", url: "https://app.barmanager.app/chat" }),
    ]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows when no tabs are open at all", async () => {
    loadServiceWorker([]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("shows when multiple tabs exist but chat tab is not focused", async () => {
    loadServiceWorker([
      createMockClient({ focused: false, visibilityState: "hidden", url: "https://app.barmanager.app/chat" }),
      createMockClient({ focused: true, visibilityState: "visible", url: "https://app.barmanager.app/inventory" }),
    ]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("passes correct url so clicking the notification navigates to /chat", async () => {
    loadServiceWorker([]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).toHaveBeenCalledWith(
      "Willy — Chat Reply",
      expect.objectContaining({ data: { url: "/chat" } }),
    );
  });
});

describe("Chat suppression: notification hidden ONLY when user IS focused on /chat", () => {
  it("suppresses when user is focused on /chat", async () => {
    loadServiceWorker([
      createMockClient({ focused: true, visibilityState: "visible", url: "https://app.barmanager.app/chat" }),
    ]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).not.toHaveBeenCalled();
  });

  it("suppresses when user is focused on /chat with query params", async () => {
    loadServiceWorker([
      createMockClient({ focused: true, visibilityState: "visible", url: "https://app.barmanager.app/chat?thread=abc" }),
    ]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).not.toHaveBeenCalled();
  });
});

describe("Regression guard: visibilityState alone must NOT suppress", () => {
  it("chat: visibilityState=visible + focused=false → notification SHOWS", async () => {
    // This is the regression test for the original bug.
    // On macOS, switching to another app leaves visibilityState as "visible"
    // but sets focused to false. The old broken code suppressed here.
    loadServiceWorker([
      createMockClient({ focused: false, visibilityState: "visible", url: "https://app.barmanager.app/chat" }),
    ]);
    await firePush(CHAT_RESPONSE);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });

  it("inventory: any combination of focused/visibilityState → notification SHOWS", async () => {
    // Inventory must never be suppressed, regardless of state
    const combos: Pick<MockClient, "focused" | "visibilityState">[] = [
      { focused: true, visibilityState: "visible" },
      { focused: true, visibilityState: "hidden" },
      { focused: false, visibilityState: "visible" },
      { focused: false, visibilityState: "hidden" },
    ];

    for (const combo of combos) {
      loadServiceWorker([
        createMockClient({ ...combo, url: "https://app.barmanager.app/inventory/alerts" }),
      ]);
      await firePush(INVENTORY_LOW_STOCK);
      expect(showNotification).toHaveBeenCalledTimes(1);
    }
  });
});
