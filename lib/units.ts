/**
 * Unit conversion utilities for inventory management.
 *
 * Handles:
 * - Volume conversions (ml, oz, l, cl, cup, tbsp, tsp, dash)
 * - Weight conversions (g, lb, kg)
 * - Count passthrough (each)
 * - Purchase-unit → base-unit conversion (e.g. 1 bottle = 750 ml)
 */

// ---------------------------------------------------------------------------
// Volume units → ml
// ---------------------------------------------------------------------------
const ML_PER: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  cl: 10,
  centiliter: 10,
  centiliters: 10,
  l: 1000,
  liter: 1000,
  liters: 1000,
  oz: 29.5735,
  "fl oz": 29.5735,
  ounce: 29.5735,
  ounces: 29.5735,
  cup: 236.588,
  cups: 236.588,
  tbsp: 14.787,
  tablespoon: 14.787,
  tablespoons: 14.787,
  tsp: 4.929,
  teaspoon: 4.929,
  teaspoons: 4.929,
  dash: 0.92,
  dashes: 0.92,
  barspoon: 5,
  barspoons: 5,
  pint: 473.176,
  pints: 473.176,
  quart: 946.353,
  quarts: 946.353,
  gallon: 3785.41,
  gallons: 3785.41,
};

// ---------------------------------------------------------------------------
// Weight units → g
// ---------------------------------------------------------------------------
const G_PER: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

// ---------------------------------------------------------------------------
// Count units (passthrough)
// ---------------------------------------------------------------------------
const COUNT_UNITS = new Set([
  "each",
  "ea",
  "piece",
  "pieces",
  "pcs",
  "unit",
  "units",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "leaf",
  "leaves",
  "wedge",
  "wedges",
  "wheel",
  "wheels",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(unit: string): string {
  return unit.trim().toLowerCase();
}

export type UnitCategory = "volume" | "weight" | "count" | "unknown";

export function unitCategory(unit: string): UnitCategory {
  const n = normalize(unit);
  if (ML_PER[n] !== undefined) return "volume";
  if (G_PER[n] !== undefined) return "weight";
  if (COUNT_UNITS.has(n)) return "count";
  return "unknown";
}

/**
 * Convert a quantity between two compatible units.
 * Returns null if the units are incompatible or unknown.
 */
export function convertUnits(
  qty: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const from = normalize(fromUnit);
  const to = normalize(toUnit);

  if (from === to) return qty;

  // Volume
  if (ML_PER[from] !== undefined && ML_PER[to] !== undefined) {
    return (qty * ML_PER[from]) / ML_PER[to];
  }

  // Weight
  if (G_PER[from] !== undefined && G_PER[to] !== undefined) {
    return (qty * G_PER[from]) / G_PER[to];
  }

  // Count
  if (COUNT_UNITS.has(from) && COUNT_UNITS.has(to)) {
    return qty;
  }

  return null;
}

/**
 * Convert a quantity from any compatible unit to the given base unit.
 * If the units are incompatible, returns the original quantity unchanged
 * (best-effort: assume the recipe and inventory use the same scale).
 */
export function toBaseUnit(
  qty: number,
  fromUnit: string,
  baseUnit: string,
): number {
  const result = convertUnits(qty, fromUnit, baseUnit);
  return result ?? qty;
}

/**
 * Convert a purchase-unit quantity to base units.
 *
 * Example: 2 bottles → 2 * 750 = 1500 ml
 */
export function purchaseToBase(
  purchaseQty: number,
  purchaseUnitQuantity: number,
): number {
  return purchaseQty * purchaseUnitQuantity;
}

/**
 * Convert a base-unit quantity to purchase units for display.
 *
 * Example: 1500 ml → 1500 / 750 = 2 bottles
 */
export function baseToPurchase(
  baseQty: number,
  purchaseUnitQuantity: number,
): number {
  if (purchaseUnitQuantity <= 0) return baseQty;
  return baseQty / purchaseUnitQuantity;
}

/**
 * Format a quantity with its unit for display.
 * If the ingredient has a purchase unit configured, shows both.
 */
export function formatQuantity(
  qty: number,
  baseUnit: string,
  purchaseUnit?: string | null,
  purchaseUnitQty?: number | null,
): string {
  const rounded = Math.round(qty * 100) / 100;

  if (purchaseUnit && purchaseUnitQty && purchaseUnitQty > 0) {
    const inPurchase = baseToPurchase(qty, purchaseUnitQty);
    const roundedPurchase = Math.round(inPurchase * 100) / 100;
    return `${roundedPurchase} ${purchaseUnit} (${rounded} ${baseUnit})`;
  }

  return `${rounded} ${baseUnit}`;
}

/**
 * Parse a user-entered quantity string that may include a purchase unit.
 *
 * Examples:
 *   "2 bottles" with purchaseUnitQty=750 → 1500 (ml)
 *   "1.5"       with no purchase unit    → 1.5 (base units)
 *   "500 ml"    with base_unit=ml        → 500
 *   "16 oz"     with base_unit=ml        → 473.18
 */
export function parseQuantityInput(
  input: string,
  baseUnit: string,
  purchaseUnit?: string | null,
  purchaseUnitQty?: number | null,
): { quantity: number; raw: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try to extract number and optional unit
  const match = trimmed.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;

  const unitStr = match[2].trim().toLowerCase();

  // No unit specified → raw base units
  if (!unitStr) {
    return { quantity: num, raw: trimmed };
  }

  // Check if it matches the purchase unit
  if (
    purchaseUnit &&
    purchaseUnitQty &&
    (unitStr === purchaseUnit.toLowerCase() ||
      unitStr === purchaseUnit.toLowerCase() + "s" ||
      unitStr === purchaseUnit.toLowerCase().replace(/s$/, ""))
  ) {
    return {
      quantity: purchaseToBase(num, purchaseUnitQty),
      raw: trimmed,
    };
  }

  // Try direct unit conversion to base unit
  const converted = convertUnits(num, unitStr, baseUnit);
  if (converted !== null) {
    return { quantity: converted, raw: trimmed };
  }

  // Fall back to treating it as base units
  return { quantity: num, raw: trimmed };
}

/**
 * Known display-friendly unit labels.
 */
export const COMMON_UNITS = [
  { value: "ml", label: "ml (milliliters)" },
  { value: "oz", label: "oz (fluid ounces)" },
  { value: "l", label: "L (liters)" },
  { value: "each", label: "each" },
  { value: "g", label: "g (grams)" },
  { value: "lb", label: "lb (pounds)" },
  { value: "kg", label: "kg (kilograms)" },
] as const;

export const COMMON_PURCHASE_UNITS = [
  "bottle",
  "case",
  "bag",
  "box",
  "can",
  "keg",
  "carton",
  "container",
  "jar",
  "pack",
  "bunch",
] as const;
