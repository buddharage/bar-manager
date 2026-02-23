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
  return toastFetch<ToastOrder[]>(
    `/orders/v2/ordersBulk?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
  );
}

// Fetch current inventory stock levels
export async function fetchInventory(): Promise<ToastStockItem[]> {
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID!;
  return toastFetch<ToastStockItem[]>(
    `/stock/v1/inventory/${restaurantGuid}`
  );
}

// Fetch menu items for mapping GUIDs to names
export async function fetchMenuItems(): Promise<ToastMenuItem[]> {
  return toastFetch<ToastMenuItem[]>("/menus/v2/menus");
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

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export type { ToastOrder, ToastStockItem, ToastMenuItem };
