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
  checks: Array<{
    // Financial totals live on checks, not orders
    amount: number; // subtotal after discounts, before tax
    totalAmount: number; // amount + tax
    taxAmount: number;
    selections: Array<{
      guid: string;
      item?: { guid: string };
      itemGroup?: { guid: string };
      displayName: string;
      quantity: number;
      price: number; // per-unit price (does NOT reflect quantity)
      discountAmount?: number;
      modifiers?: Array<{
        guid: string;
        displayName: string;
        optionGroup?: { guid: string };
        quantity: number;
        price: number;
      }>;
    }>;
    payments: Array<{
      type: string;
      amount: number;
      tipAmount: number;
    }>;
    appliedDiscounts?: Array<{
      discountAmount: number;
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

const MAX_RETRIES = 4;

async function toastFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID!;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s, 16s
      const delayMs = Math.pow(2, attempt) * 1000;
      console.warn(`Toast API ${path}: 429 rate limited, retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

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

    if (response.status === 429) {
      lastError = new Error(`Toast API ${path}: ${response.status} ${await response.text()}`);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Toast API ${path}: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  throw lastError!;
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

// Recursively collect menu items from a list of menuGroups.
// Toast menus support nested sub-groups, so we must recurse to find all items.
function collectMenuItems(
  groups: Array<Record<string, unknown>>,
  items: ToastMenuItem[]
): void {
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

    // Recurse into nested sub-groups
    const subGroups = Array.isArray(group.menuGroups) ? group.menuGroups : [];
    if (subGroups.length > 0) {
      collectMenuItems(subGroups, items);
    }
  }
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
    collectMenuItems(groups, items);
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

// Build a lookup of menu-item GUID → menu group name (category).
// Useful for enriching order-item rows with the category they belong to.
export async function fetchMenuItemCategoryMap(): Promise<Map<string, string>> {
  const items = await fetchMenuItems();
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.menuGroup?.name) {
      map.set(item.guid, item.menuGroup.name);
    }
  }
  return map;
}

// Check whether an optionGroup name indicates a size modifier.
// Toast menus use various naming conventions for size-related modifier
// groups — match common patterns used in bar / restaurant setups.
function isSizeOptionGroup(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("size") ||
    lower.includes("pour") ||
    lower.includes("glass or") ||
    lower.includes("single") ||
    lower.includes("portion")
  );
}

// Collect size-related optionGroup GUIDs from a list of optionGroups.
function collectSizeGuidsFromOptionGroups(
  optionGroups: Array<Record<string, unknown>>,
  sizeGuids: Set<string>
): void {
  for (const og of optionGroups) {
    const name = (og.name as string) || "";
    if (isSizeOptionGroup(name) && og.guid) {
      sizeGuids.add(og.guid as string);
    }
  }
}

// Recursively collect size optionGroup GUIDs from nested menuGroups.
// Checks optionGroups at both the menuGroup level (shared modifiers
// inherited by all items in the group) and the menuItem level.
function collectSizeGuidsFromGroups(
  groups: Array<Record<string, unknown>>,
  sizeGuids: Set<string>
): void {
  for (const group of groups) {
    // Check optionGroups at the menuGroup level (shared modifiers)
    const groupOGs = Array.isArray(group.optionGroups) ? group.optionGroups : [];
    collectSizeGuidsFromOptionGroups(groupOGs, sizeGuids);

    // Check optionGroups on each menuItem
    const menuItems = Array.isArray(group.menuItems) ? group.menuItems : [];
    for (const item of menuItems) {
      const itemOGs = Array.isArray(item.optionGroups) ? item.optionGroups : [];
      collectSizeGuidsFromOptionGroups(itemOGs, sizeGuids);
    }

    // Recurse into nested sub-groups
    const subGroups = Array.isArray(group.menuGroups) ? group.menuGroups : [];
    if (subGroups.length > 0) {
      collectSizeGuidsFromGroups(subGroups, sizeGuids);
    }
  }
}

// Build a set of modifier-option-group GUIDs that represent sizes.
// Toast menus nest optionGroups (modifier groups) inside menu items
// and menu groups. We identify size groups by name (case-insensitive
// contains "size"). Recursively traverses nested menuGroups to find
// all size option groups.
// Returns a Set of optionGroup GUIDs so the sync can check
// `modifier.optionGroup.guid` against this set.
export async function fetchSizeOptionGroupGuids(): Promise<Set<string>> {
  const data = await toastFetch<unknown>("/menus/v2/menus");
  const menus = normalizeToArray<Record<string, unknown>>(data);

  const sizeGuids = new Set<string>();

  for (const menu of menus) {
    const groups = Array.isArray(menu.menuGroups) ? menu.menuGroups : [];
    collectSizeGuidsFromGroups(groups, sizeGuids);
  }
  return sizeGuids;
}

// Fetch /menus/v2/menus once and derive all lookups in a single pass.
// Avoids multiple requests to the same endpoint which triggers 429 rate limiting.
export async function fetchAllMenuLookups(): Promise<{
  menuItems: ToastMenuItem[];
  categoryMap: Map<string, string>;
  sizeGroupGuids: Set<string>;
}> {
  const data = await toastFetch<unknown>("/menus/v2/menus");
  const menus = normalizeToArray<Record<string, unknown>>(data);

  const menuItems: ToastMenuItem[] = [];
  const sizeGuids = new Set<string>();

  for (const menu of menus) {
    const groups = Array.isArray(menu.menuGroups) ? menu.menuGroups : [];
    collectMenuItems(groups, menuItems);
    collectSizeGuidsFromGroups(groups, sizeGuids);
  }

  const categoryMap = new Map<string, string>();
  for (const item of menuItems) {
    if (item.menuGroup?.name) {
      categoryMap.set(item.guid, item.menuGroup.name);
    }
  }

  return { menuItems, categoryMap, sizeGroupGuids: sizeGuids };
}

export type { ToastOrder, ToastStockItem, ToastMenuItem };
