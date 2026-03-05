// Pure functions for menu-sales item normalization and aggregation.
// Extracted from app/api/menu-sales/route.ts so they can be unit-tested.

export const BEER_ALIASES: Record<string, string> = {
  "high life": "Miller High Life",
  "miller high life": "Miller High Life",
  "tecate": "Tecate",
};

export function normalizeItemName(name: string, category?: string): string {
  let normalized = name.replace(/\s*\(Happy Hour\)\s*$/i, "").trim();

  const lowerCat = category?.toLowerCase();
  const isBeerOrWine = lowerCat?.includes("wine") || lowerCat?.includes("beer");

  const withoutShot = normalized
    .replace(/\s+and\s+(a\s+)?Shot\s*$/i, "")
    .replace(/\s*&\s*Shot\s*$/i, "")
    .trim();

  if (isBeerOrWine) {
    normalized = withoutShot;
    const alias = BEER_ALIASES[normalized.toLowerCase()];
    if (alias) normalized = alias;
  } else {
    const alias = BEER_ALIASES[withoutShot.toLowerCase()];
    if (alias) normalized = alias;
  }

  return normalized;
}

/**
 * Returns true if the category represents beer or wine.
 */
export function isBeerOrWineCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return lower.includes("beer") || lower.includes("wine");
}

/**
 * Given two categories for the same aggregated item, returns the preferred one.
 * Beer/wine categories are preferred over non-beer/wine so that cases compute correctly.
 */
export function preferredCategory(existing: string, incoming: string): string {
  if (!isBeerOrWineCategory(existing) && isBeerOrWineCategory(incoming)) {
    return incoming;
  }
  return existing;
}

/**
 * Compute the number of cases for a menu item based on its category.
 * Beer = 24 per case, wine = 12 per case, others = no cases.
 */
export function computeCases(quantity: number, category: string): number | null {
  const lower = category?.toLowerCase() ?? "";
  if (lower.includes("beer")) return Math.ceil(quantity / 24);
  if (lower.includes("wine")) return Math.ceil(quantity / 12);
  return null;
}
