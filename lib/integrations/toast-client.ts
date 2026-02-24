// Toast POS API Client
// Uses OAuth2 Client Credentials flow (read-only Standard API access)
// Docs: https://doc.toasttab.com/openapi

interface ToastTokenResponse {
  token: {
    tokenType: string;
    accessToken: string;
    expiresIn: number;
    scope: string | null;
  };
  status: string;
}

interface ToastOrder {
  guid: string;
  openedDate: string;
  closedDate?: string;
  totalAmount: number;
  netAmount: number;
  taxAmount: number;
  tipAmount: number;
  discountAmount: number;
  checks: Array<{
    selections: Array<{
      guid: string;
      itemGroup?: { guid: string };
      displayName: string;
      quantity: number;
      price: number;
    }>;
    payments: Array<{
      type: string;
      amount: number;
    }>;
  }>;
}

interface ToastStockItem {
  guid: string;
  menuItem: { guid: string };
  quantity: number;
  status: string;
}

interface ToastMenuItem {
  guid: string;
  name: string;
  menuGroup?: { guid: string; name: string };
}

// Toast API responses may be a direct array or wrapped in an object (e.g. { results: [...] }).
// Normalize to always return an array.
function normalizeToArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data != null && typeof data === "object") {
    const values = Object.values(data as Record<string, unknown>);
    const arr = values.find(Array.isArray);
    if (arr) return arr as T[];
  }
  return [];
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const response = await fetch(
    `${process.env.TOAST_API_BASE_URL}/authentication/v1/authentication/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: process.env.TOAST_CLIENT_ID,
        clientSecret: process.env.TOAST_CLIENT_SECRET,
        userAccessType: "TOAST_MACHINE_CLIENT",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Toast auth failed: ${response.status} ${await response.text()}`);
  }

  const data: ToastTokenResponse = await response.json();
  cachedToken = {
    token: data.token.accessToken,
    expiresAt: Date.now() + (data.token.expiresIn - 60) * 1000, // refresh 60s early
  };
  return cachedToken.token;
}

async function toastFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID!;

  const response = await fetch(
    `${process.env.TOAST_API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Toast-Restaurant-External-ID": restaurantGuid,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Toast API ${path}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

// Fetch orders for a date range (ISO strings)
export async function fetchOrders(startDate: string, endDate: string): Promise<ToastOrder[]> {
  const data = await toastFetch<unknown>(
    `/orders/v2/ordersBulk?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
  );
  return normalizeToArray<ToastOrder>(data);
}

// Fetch current inventory stock levels
export async function fetchInventory(): Promise<ToastStockItem[]> {
  const data = await toastFetch<unknown>("/stock/v1/inventory");
  return normalizeToArray<ToastStockItem>(data);
}

// Fetch menu items for mapping GUIDs to names.
// The /menus/v2/menus endpoint returns menus containing nested menuGroups
// and menuItems. Flatten the hierarchy to get individual menu items.
export async function fetchMenuItems(): Promise<ToastMenuItem[]> {
  const data = await toastFetch<unknown>("/menus/v2/menus");
  const menus = normalizeToArray<Record<string, unknown>>(data);

  const items: ToastMenuItem[] = [];
  for (const menu of menus) {
    const groups = Array.isArray(menu.menuGroups) ? menu.menuGroups : [];
    for (const group of groups) {
      const groupInfo = group.guid
        ? { guid: group.guid as string, name: (group.name as string) || "" }
        : undefined;
      const menuItems = Array.isArray(group.menuItems) ? group.menuItems : [];
      for (const item of menuItems) {
        if (item.guid && item.name) {
          items.push({
            guid: item.guid as string,
            name: item.name as string,
            menuGroup: groupInfo,
          });
        }
      }
    }
  }
  return items;
}

// Parse a Toast webhook payload and verify the signature
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  // Toast webhook signatures use HMAC-SHA256
  // In production, verify using TOAST_WEBHOOK_SECRET
  const secret = process.env.TOAST_WEBHOOK_SECRET;
  if (!secret) return false;

  const crypto = require("crypto");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export type { ToastOrder, ToastStockItem, ToastMenuItem };
